import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  REQUIRE_ADMIN_KEY,
  CHECK_OWNERSHIP_KEY,
  PermissionRequirement,
} from '../decorators/permissions.decorator';
import {
  hasPermission,
  hasAdminAccess,
  Action,
} from '../../../shared/constants/rbac.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireAdmin = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionRequirement[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    const ownershipParam = this.reflector.getAllAndOverride<string>(
      CHECK_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requireAdmin && !requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.groupId) {
      throw new ForbiddenException('Accès refusé - Authentification requise');
    }

    // Check if admin access is required
    if (requireAdmin && !hasAdminAccess(user.groupId) && user.id !== 1) {
      throw new ForbiddenException(
        'Accès refusé - Droits administrateur requis',
      );
    }

    // Check specific permissions
    if (requiredPermissions && requiredPermissions.length > 0) {
      for (const requirement of requiredPermissions) {
        let resourceOwnerId: number | undefined;

        // Check ownership if needed
        if (
          requirement.action === Action.UPDATE &&
          ownershipParam &&
          request.params[ownershipParam]
        ) {
          // For UPDATE_OWN, we need to fetch the resource owner
          // This will be handled by the service layer
          // For now, we'll pass undefined and let the service check
          resourceOwnerId = undefined;
        }

        const hasRequiredPermission = hasPermission(
          user.groupId,
          requirement.resource,
          requirement.action,
          user.id,
          resourceOwnerId,
        );

        if (!hasRequiredPermission) {
          throw new ForbiddenException(
            `Accès refusé - Permission requise: ${requirement.action} ${requirement.resource}`,
          );
        }
      }
    }

    return true;
  }
}
