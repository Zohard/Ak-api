import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  Permission,
} from '../decorators/permissions.decorator';
import { PrismaService } from '../../shared/services/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Super admin bypass
    if (
      user.id_group === 1 ||
      (await this.hasPermission(user.id, Permission.SUPER_ADMIN))
    ) {
      return true;
    }

    // Check if user has any of the required permissions
    const hasPermission = await this.checkUserPermissions(
      user.id,
      requiredPermissions,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  private async checkUserPermissions(
    userId: number,
    requiredPermissions: Permission[],
  ): Promise<boolean> {
    for (const permission of requiredPermissions) {
      if (await this.hasPermission(userId, permission)) {
        return true; // User has at least one required permission
      }
    }
    return false;
  }

  private async hasPermission(
    userId: number,
    permission: Permission,
  ): Promise<boolean> {
    try {
      // Get user's group and any additional permissions
      const userInfo = await this.prisma.$queryRaw`
        SELECT 
          u.id_group,
          u.additional_groups,
          mg.permissions as group_permissions
        FROM smf_members u
        LEFT JOIN smf_membergroups mg ON u.id_group = mg.id_group
        WHERE u.id_member = ${userId}
      `;

      if (!userInfo || (userInfo as any[]).length === 0) {
        return false;
      }

      const user = (userInfo as any[])[0];

      // Check group-based permissions
      if (this.groupHasPermission(user.id_group, permission)) {
        return true;
      }

      // Check if user has specific permission overrides
      const userPermissions = await this.getUserSpecificPermissions(userId);
      if (userPermissions.includes(permission)) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  private groupHasPermission(groupId: number, permission: Permission): boolean {
    // Define permissions for each group
    const groupPermissions = {
      1: [Permission.SUPER_ADMIN], // Administrators
      2: [
        // Moderators
        Permission.VIEW_MODERATION_QUEUE,
        Permission.MODERATE_REVIEWS,
        Permission.MODERATE_CONTENT,
        Permission.VIEW_REPORTS,
        Permission.PROCESS_REPORTS,
        Permission.VIEW_CONTENT,
        Permission.EDIT_CONTENT,
      ],
      3: [
        // Content Managers
        Permission.VIEW_CONTENT,
        Permission.EDIT_CONTENT,
        Permission.PUBLISH_CONTENT,
        Permission.MANAGE_CONTENT_RELATIONSHIPS,
        Permission.MANAGE_CONTENT_TAGS,
        Permission.UPLOAD_MEDIA,
        Permission.VIEW_BUSINESS,
        Permission.EDIT_BUSINESS,
      ],
      4: [
        // Premium users (limited admin access)
        Permission.VIEW_CONTENT,
      ],
    };

    const permissions = groupPermissions[groupId] || [];
    return permissions.includes(permission);
  }

  private async getUserSpecificPermissions(
    userId: number,
  ): Promise<Permission[]> {
    try {
      // Check for user-specific permission overrides
      const userPermissions = await this.prisma.$queryRaw`
        SELECT permissions 
        FROM user_permissions 
        WHERE user_id = ${userId} AND active = true
      `;

      if (userPermissions && (userPermissions as any[]).length > 0) {
        return (userPermissions as any[])[0].permissions || [];
      }

      return [];
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }
}
