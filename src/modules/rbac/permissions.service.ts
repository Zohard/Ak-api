import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all permissions
   */
  async findAll() {
    return this.prisma.akPermission.findMany({
      where: { isActive: true },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  /**
   * Get permissions grouped by resource for UI display
   */
  async getGroupedPermissions() {
    const permissions = await this.findAll();

    // Group by resource
    const grouped = permissions.reduce((acc, perm) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push(perm);
      return acc;
    }, {} as Record<string, any[]>);

    // Return as array of objects for easier frontend consumption
    return Object.entries(grouped).map(([resource, permissions]) => ({
      resource,
      permissions,
    }));
  }

  /**
   * Get permission matrix (all resources × all actions)
   */
  async getPermissionMatrix() {
    const permissions = await this.findAll();

    // Get unique resources and actions
    const resources = [...new Set(permissions.map((p) => p.resource))].sort();
    const actions = [...new Set(permissions.map((p) => p.action))].sort();

    // Create matrix
    const matrix = resources.map((resource) => {
      const resourcePerms = permissions.filter((p) => p.resource === resource);
      const actionMap = {} as Record<string, any>;

      actions.forEach((action) => {
        const perm = resourcePerms.find((p) => p.action === action);
        actionMap[action] = perm || null;
      });

      return {
        resource,
        actions: actionMap,
      };
    });

    return {
      resources,
      actions,
      matrix,
    };
  }

  /**
   * Seed default permissions for all resources and actions
   */
  async seedDefaultPermissions() {
    const resources = [
      'ARTICLES',
      'ANIME',
      'MANGA',
      'JEUX_VIDEO',
      'SYNOPSIS',
      'BUSINESS',
      'SAISON',
      'MEMBERS',
      'REVIEWS',
      'FORUM',
      'ROLES',
      'MEDIA',
      'COMMENTS',
    ];

    const actions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'MODERATE', 'PUBLISH'];

    const permissions = [];
    for (const resource of resources) {
      for (const action of actions) {
        permissions.push({
          resource,
          action,
          description: `${action} permission for ${resource}`,
        });
      }
    }

    // Use createMany with skipDuplicates to avoid errors on re-seeding
    const result = await this.prisma.akPermission.createMany({
      data: permissions,
      skipDuplicates: true,
    });

    return {
      message: 'Default permissions seeded successfully',
      count: result.count,
      total: permissions.length,
    };
  }

  /**
   * Get permission statistics
   */
  async getStats() {
    const [total, byResource, byAction] = await Promise.all([
      this.prisma.akPermission.count({ where: { isActive: true } }),
      this.prisma.akPermission.groupBy({
        by: ['resource'],
        where: { isActive: true },
        _count: true,
      }),
      this.prisma.akPermission.groupBy({
        by: ['action'],
        where: { isActive: true },
        _count: true,
      }),
    ]);

    return {
      total,
      byResource: byResource.map((r) => ({
        resource: r.resource,
        count: r._count,
      })),
      byAction: byAction.map((a) => ({
        action: a.action,
        count: a._count,
      })),
    };
  }

  /**
   * Check if a user has a specific permission (through their roles)
   */
  async userHasPermission(
    userId: number,
    resource: string,
    action: string,
  ): Promise<boolean> {
    const userRoles = await this.prisma.akUserRole.findMany({
      where: {
        idMember: userId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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

    // Check if any of the user's roles have the required permission
    for (const userRole of userRoles) {
      const hasPermission = userRole.role.rolePermissions.some(
        (rp) =>
          rp.permission.resource === resource &&
          rp.permission.action === action &&
          rp.permission.isActive,
      );

      if (hasPermission) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions for a user (combined from all their roles)
   */
  async getUserPermissions(userId: number) {
    const userRoles = await this.prisma.akUserRole.findMany({
      where: {
        idMember: userId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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

    // Collect all unique permissions
    const permissionsMap = new Map<number, any>();
    userRoles.forEach((userRole) => {
      userRole.role.rolePermissions.forEach((rp) => {
        if (rp.permission.isActive && !permissionsMap.has(rp.permission.idPermission)) {
          permissionsMap.set(rp.permission.idPermission, {
            ...rp.permission,
            grantedByRole: userRole.role.roleName,
            grantedByRoleId: userRole.role.idRole,
          });
        }
      });
    });

    return Array.from(permissionsMap.values());
  }
}
