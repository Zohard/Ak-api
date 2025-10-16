import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ARTICLE_PERMISSIONS_KEY } from '../decorators/article-permissions.decorator';
import {
  hasPermission,
  Resource,
  Action,
  SMFGroup,
} from '../../../shared/constants/rbac.constants';

@Injectable()
export class ArticlePermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      ARTICLE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.groupId) {
      throw new ForbiddenException('Accès refusé - Authentification requise');
    }

    // Map old permission strings to RBAC actions
    let action: Action;
    switch (requiredPermission) {
      case 'write':
        action = Action.CREATE;
        break;
      case 'edit':
        action = Action.UPDATE;
        break;
      case 'publish':
        action = Action.PUBLISH;
        break;
      case 'moderate':
        action = Action.MODERATE;
        break;
      case 'manage':
        action = Action.MODERATE;
        break;
      case 'delete':
        action = Action.DELETE;
        break;
      default:
        return false;
    }

    // For Rédacteur invité (group 14), check ownership for UPDATE actions
    if (user.groupId === SMFGroup.REDACTEUR_INVITE && action === Action.UPDATE) {
      // The ownership check will be done in the service layer
      // Here we just check if they have UPDATE_OWN permission
      return hasPermission(
        user.groupId,
        Resource.ARTICLES,
        Action.UPDATE_OWN,
        user.id,
      );
    }

    // Check permission using RBAC
    const hasRequiredPermission = hasPermission(
      user.groupId,
      Resource.ARTICLES,
      action,
      user.id,
    );

    if (!hasRequiredPermission) {
      throw new ForbiddenException(
        `Accès refusé - Permission requise: ${action} articles`,
      );
    }

    return true;
  }
}
