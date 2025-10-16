import { SetMetadata } from '@nestjs/common';
import { Resource, Action } from '../../../shared/constants/rbac.constants';

export interface PermissionRequirement {
  resource: Resource;
  action: Action;
}

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to require specific permissions for a route
 * @param requirements - Array of permission requirements or single requirement
 * @example
 * @RequirePermissions({ resource: Resource.ARTICLES, action: Action.CREATE })
 * @RequirePermissions([
 *   { resource: Resource.ARTICLES, action: Action.UPDATE },
 *   { resource: Resource.ARTICLES, action: Action.DELETE }
 * ])
 */
export const RequirePermissions = (
  ...requirements: PermissionRequirement[]
) => SetMetadata(PERMISSIONS_KEY, requirements);

/**
 * Decorator to require admin access (any admin group)
 */
export const REQUIRE_ADMIN_KEY = 'require_admin';
export const RequireAdmin = () => SetMetadata(REQUIRE_ADMIN_KEY, true);

/**
 * Decorator to check ownership for UPDATE_OWN actions
 * Specify the parameter name that contains the resource ID
 */
export const CHECK_OWNERSHIP_KEY = 'check_ownership';
export const CheckOwnership = (paramName: string = 'id') =>
  SetMetadata(CHECK_OWNERSHIP_KEY, paramName);
