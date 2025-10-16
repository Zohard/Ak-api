import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { hasAdminAccess } from '../../shared/constants/rbac.constants';

/**
 * AdminGuard checks if user has any admin panel access
 * For specific resource permissions, use PermissionsGuard instead
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    // Check if user has admin access using RBAC system
    const hasAccess = hasAdminAccess(user.groupId) || user.isAdmin;

    if (!hasAccess) {
      throw new ForbiddenException("Droits d'administrateur requis");
    }

    return true;
  }
}
