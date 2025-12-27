import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new role
   */
  async create(createRoleDto: CreateRoleDto, adminId: number) {
    // Check if role name already exists
    const existing = await this.prisma.akRole.findUnique({
      where: { roleName: createRoleDto.roleName },
    });

    if (existing) {
      throw new BadRequestException(
        `Role "${createRoleDto.roleName}" already exists`,
      );
    }

    const role = await this.prisma.akRole.create({
      data: createRoleDto,
    });

    // Log the action
    await this.logAction(adminId, 'ROLE_CREATED', 'ROLE', role.idRole, {
      roleName: role.roleName,
      displayName: role.displayName,
    });

    return role;
  }

  /**
   * Get all roles with their permissions and user counts
   */
  async findAll(includeInactive = false) {
    return this.prisma.akRole.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            userRoles: { where: { isActive: true } },
            rolePermissions: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { displayName: 'asc' }],
    });
  }

  /**
   * Get a single role by ID with full details
   */
  async findOne(id: number) {
    const role = await this.prisma.akRole.findUnique({
      where: { idRole: id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
            grantedByUser: {
              select: {
                idMember: true,
                memberName: true,
              },
            },
          },
        },
        userRoles: {
          where: { isActive: true },
          include: {
            member: {
              select: {
                idMember: true,
                memberName: true,
                avatar: true,
                emailAddress: true,
              },
            },
            assignedByUser: {
              select: {
                idMember: true,
                memberName: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  /**
   * Update a role
   */
  async update(id: number, updateRoleDto: UpdateRoleDto, adminId: number) {
    const role = await this.findOne(id);

    // Prevent modifying system role flag
    if (role.isSystem && updateRoleDto.isSystem === false) {
      throw new BadRequestException('Cannot remove system flag from system roles');
    }

    // Prevent deleting system roles
    if (role.isSystem && updateRoleDto.isActive === false) {
      throw new BadRequestException('Cannot deactivate system roles');
    }

    const updated = await this.prisma.akRole.update({
      where: { idRole: id },
      data: {
        ...updateRoleDto,
        updatedAt: new Date(),
      },
    });

    await this.logAction(adminId, 'ROLE_UPDATED', 'ROLE', id, updateRoleDto);

    return updated;
  }

  /**
   * Delete a role
   */
  async remove(id: number, adminId: number) {
    const role = await this.findOne(id);

    // Prevent deleting system roles
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system roles');
    }

    // Check if role is assigned to any users
    const userCount = role.userRoles.length;
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.displayName}" - it is assigned to ${userCount} user(s)`,
      );
    }

    await this.prisma.akRole.delete({
      where: { idRole: id },
    });

    await this.logAction(adminId, 'ROLE_DELETED', 'ROLE', id, {
      roleName: role.roleName,
      displayName: role.displayName,
    });

    return { message: 'Role deleted successfully' };
  }

  /**
   * Assign permissions to a role (replaces existing permissions)
   */
  async assignPermissions(
    roleId: number,
    dto: AssignPermissionsDto,
    adminId: number,
  ) {
    const role = await this.findOne(roleId);

    // Verify all permission IDs exist
    const permissions = await this.prisma.akPermission.findMany({
      where: {
        idPermission: { in: dto.permissionIds },
        isActive: true,
      },
    });

    if (permissions.length !== dto.permissionIds.length) {
      throw new BadRequestException('Some permission IDs are invalid or inactive');
    }

    // Remove existing permissions
    await this.prisma.akRolePermission.deleteMany({
      where: { idRole: roleId },
    });

    // Add new permissions
    if (dto.permissionIds.length > 0) {
      await this.prisma.akRolePermission.createMany({
        data: dto.permissionIds.map((permId) => ({
          idRole: roleId,
          idPermission: permId,
          grantedBy: adminId,
        })),
      });
    }

    await this.logAction(adminId, 'PERMISSIONS_ASSIGNED', 'ROLE', roleId, {
      roleName: role.roleName,
      permissionCount: dto.permissionIds.length,
      permissionIds: dto.permissionIds,
    });

    return this.findOne(roleId);
  }

  /**
   * Get permissions for a role
   */
  async getRolePermissions(roleId: number) {
    const role = await this.findOne(roleId);
    return role.rolePermissions;
  }

  /**
   * Assign a role to a user
   */
  async assignRoleToUser(dto: AssignRoleDto, adminId: number) {
    // Verify role exists
    const role = await this.findOne(dto.roleId);

    // Verify user exists
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if assignment already exists
    const existing = await this.prisma.akUserRole.findUnique({
      where: {
        idMember_idRole: {
          idMember: dto.userId,
          idRole: dto.roleId,
        },
      },
    });

    if (existing) {
      // Update existing assignment
      const updated = await this.prisma.akUserRole.update({
        where: { idUserRole: existing.idUserRole },
        data: {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          isActive: dto.isActive ?? true,
        },
      });

      await this.logAction(adminId, 'USER_ROLE_UPDATED', 'USER_ROLE', updated.idUserRole, {
        userId: dto.userId,
        roleId: dto.roleId,
        roleName: role.roleName,
        userName: user.memberName,
      });

      return updated;
    }

    // Create new assignment
    const userRole = await this.prisma.akUserRole.create({
      data: {
        idMember: dto.userId,
        idRole: dto.roleId,
        assignedBy: adminId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.logAction(adminId, 'USER_ROLE_ASSIGNED', 'USER_ROLE', userRole.idUserRole, {
      userId: dto.userId,
      roleId: dto.roleId,
      roleName: role.roleName,
      userName: user.memberName,
    });

    return userRole;
  }

  /**
   * Remove a role from a user
   */
  async removeRoleFromUser(userId: number, roleId: number, adminId: number) {
    const userRole = await this.prisma.akUserRole.findUnique({
      where: {
        idMember_idRole: {
          idMember: userId,
          idRole: roleId,
        },
      },
      include: {
        role: true,
        member: true,
      },
    });

    if (!userRole) {
      throw new NotFoundException('User role assignment not found');
    }

    await this.prisma.akUserRole.delete({
      where: { idUserRole: userRole.idUserRole },
    });

    await this.logAction(adminId, 'USER_ROLE_REMOVED', 'USER_ROLE', userRole.idUserRole, {
      userId,
      roleId,
      roleName: userRole.role.roleName,
      userName: userRole.member.memberName,
    });

    return { message: 'Role removed from user successfully' };
  }

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: number) {
    return this.prisma.akUserRole.findMany({
      where: {
        idMember: userId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Get all users with a specific role
   */
  async getRoleUsers(roleId: number) {
    const role = await this.findOne(roleId);

    return this.prisma.akUserRole.findMany({
      where: {
        idRole: roleId,
        isActive: true,
      },
      include: {
        member: {
          select: {
            idMember: true,
            memberName: true,
            emailAddress: true,
            avatar: true,
            idGroup: true,
          },
        },
        assignedByUser: {
          select: {
            idMember: true,
            memberName: true,
          },
        },
      },
      orderBy: {
        assignedAt: 'desc',
      },
    });
  }

  /**
   * Get audit logs for role/permission changes
   */
  async getAuditLogs(limit = 100, offset = 0) {
    return this.prisma.akRoleAuditLog.findMany({
      take: limit,
      skip: offset,
      include: {
        member: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Log an admin action
   */
  private async logAction(
    adminId: number,
    action: string,
    entityType: string,
    entityId: number,
    details: any,
  ) {
    try {
      await this.prisma.akRoleAuditLog.create({
        data: {
          idMember: adminId,
          action,
          entityType,
          entityId,
          details: JSON.stringify(details),
        },
      });
    } catch (error) {
      // Don't fail the main operation if logging fails
      console.error('Failed to log RBAC action:', error);
    }
  }
}
