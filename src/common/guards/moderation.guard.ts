import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { hasAdminAccess } from '../../shared/constants/rbac.constants';

/**
 * ModerationGuard checks if user has moderation rights (comments)
 * Only Administrator, Global Moderator, and Moderator groups can moderate
 */
@Injectable()
export class ModerationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentification requise');
    }

    // Check if user has moderation access using RBAC system
    const hasAccess = hasAdminAccess(user.groupId);

    if (!hasAccess) {
      throw new ForbiddenException('Droits de modération requis (Administrateur, Modérateur Global, ou Modérateur uniquement)');
    }

    return true;
  }
}
