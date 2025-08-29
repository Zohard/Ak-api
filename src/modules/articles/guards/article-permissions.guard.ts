import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ARTICLE_PERMISSIONS_KEY } from '../decorators/article-permissions.decorator';

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

    if (!user) {
      return false;
    }

    // Check user roles for article permissions
    // These should be based on your user role system
    const isWriter = this.hasWriterRole(user);
    const isEditor = this.hasEditorRole(user);
    const isAdmin = user.isAdmin || false;

    switch (requiredPermission) {
      case 'write':
        return isWriter || isEditor || isAdmin;
      case 'edit':
        return isEditor || isAdmin;
      case 'publish':
        return isEditor || isAdmin;
      case 'moderate':
        return isEditor || isAdmin;
      case 'manage':
        return isAdmin;
      case 'delete':
        return isAdmin;
      default:
        return false;
    }
  }

  private hasWriterRole(user: any): boolean {
    // Implement your writer role check logic
    // This could be based on user groups, permissions, or a separate roles table

    // For now, check if user has admin privileges or is in a writer group
    return user.isAdmin || user.idGroup === 2 || user.isWriter === true;
  }

  private hasEditorRole(user: any): boolean {
    // Implement your editor role check logic
    // Editors typically have more permissions than writers

    return user.isAdmin || user.idGroup === 3 || user.isEditor === true;
  }
}
