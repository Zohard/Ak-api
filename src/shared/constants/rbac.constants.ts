/**
 * Role-Based Access Control (RBAC) Constants
 * Based on SMF member group IDs and their associated permissions
 */

// SMF Member Group IDs
export enum SMFGroup {
  ADMINISTRATOR = 1,
  GLOBAL_MODERATOR = 2,
  MODERATOR = 3,
  NEWBIE = 4,
  JR_MEMBER = 5,
  FULL_MEMBER = 6,
  SR_MEMBER = 7,
  HERO_MEMBER = 8,
  STAFF_AK = 9,
  STAFF_AK_2 = 11,
  STAFF_WEBZINE = 12,
  STAFF_AK_3 = 13,
  REDACTEUR_INVITE = 14,
  LEGEND_MEMBER = 15,
}

// Resource Types
export enum Resource {
  ARTICLES = 'articles',
  ANIME = 'anime',
  MANGA = 'manga',
  SYNOPSIS = 'synopsis',
  BUSINESS = 'business',
  SAISON = 'saison',
  MEMBERS = 'members',
  REVIEWS = 'reviews',
  FORUM = 'forum',
}

// Action Types
export enum Action {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  PUBLISH = 'publish',
  MODERATE = 'moderate',
  UPDATE_OWN = 'update_own', // Special action for updating only own content
}

/**
 * Permission matrix mapping groups to allowed resources and actions
 */
export const PERMISSIONS_MATRIX: Record<
  number,
  Partial<Record<Resource, Action[]>>
> = {
  // Group 1 - Administrator: Full access to everything
  [SMFGroup.ADMINISTRATOR]: {
    [Resource.ARTICLES]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.PUBLISH,
      Action.MODERATE,
    ],
    [Resource.ANIME]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.MANGA]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.SYNOPSIS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.BUSINESS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.SAISON]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.MEMBERS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.REVIEWS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.FORUM]: [Action.MODERATE],
  },

  // Group 2 - Global Moderator: synopsis + members
  [SMFGroup.GLOBAL_MODERATOR]: {
    [Resource.SYNOPSIS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.MEMBERS]: [Action.READ, Action.UPDATE, Action.MODERATE],
    [Resource.FORUM]: [Action.MODERATE],
  },

  // Group 3 - Moderator: synopsis only
  [SMFGroup.MODERATOR]: {
    [Resource.SYNOPSIS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.MODERATE,
    ],
    [Resource.FORUM]: [Action.MODERATE],
  },

  // Groups 4-8 - Regular members: No admin access
  [SMFGroup.NEWBIE]: {},
  [SMFGroup.JR_MEMBER]: {},
  [SMFGroup.FULL_MEMBER]: {},
  [SMFGroup.SR_MEMBER]: {},
  [SMFGroup.HERO_MEMBER]: {},

  // Group 9 - Staff AK: synopsis + anime + manga + business + saison
  [SMFGroup.STAFF_AK]: {
    [Resource.SYNOPSIS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
    ],
    [Resource.ANIME]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE],
    [Resource.MANGA]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE],
    [Resource.BUSINESS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
    ],
    [Resource.SAISON]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
    ],
  },

  // Group 11 - Staff AK 2: synopsis + anime + manga + business + saison
  [SMFGroup.STAFF_AK_2]: {
    [Resource.SYNOPSIS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
    ],
    [Resource.ANIME]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE],
    [Resource.MANGA]: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE],
    [Resource.BUSINESS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
    ],
    [Resource.SAISON]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
    ],
  },

  // Group 12 - Staff Webzine: articles
  [SMFGroup.STAFF_WEBZINE]: {
    [Resource.ARTICLES]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
      Action.PUBLISH,
    ],
  },

  // Group 13 - Staff AK 3: members + synopsis
  [SMFGroup.STAFF_AK_3]: {
    [Resource.MEMBERS]: [Action.READ, Action.UPDATE],
    [Resource.SYNOPSIS]: [
      Action.CREATE,
      Action.READ,
      Action.UPDATE,
      Action.DELETE,
    ],
  },

  // Group 14 - Rédacteur invité (tmp): articles (create + update only own)
  [SMFGroup.REDACTEUR_INVITE]: {
    [Resource.ARTICLES]: [Action.CREATE, Action.READ, Action.UPDATE_OWN],
  },

  // Group 15 - Legend Member: No admin access
  [SMFGroup.LEGEND_MEMBER]: {},
};

/**
 * Groups that have admin panel access
 */
export const ADMIN_GROUP_IDS = new Set<number>([
  SMFGroup.ADMINISTRATOR,
  SMFGroup.GLOBAL_MODERATOR,
  SMFGroup.MODERATOR,
  SMFGroup.STAFF_AK,
  SMFGroup.STAFF_AK_2,
  SMFGroup.STAFF_WEBZINE,
  SMFGroup.STAFF_AK_3,
  SMFGroup.REDACTEUR_INVITE,
]);

/**
 * Check if a user has permission to perform an action on a resource
 */
export function hasPermission(
  groupId: number,
  resource: Resource,
  action: Action,
  userId?: number,
  resourceOwnerId?: number,
): boolean {
  // Administrator always has access
  if (groupId === SMFGroup.ADMINISTRATOR) {
    return true;
  }

  const permissions = PERMISSIONS_MATRIX[groupId];
  if (!permissions || !permissions[resource]) {
    return false;
  }

  const allowedActions = permissions[resource];

  // Check for UPDATE_OWN action (only for own content)
  if (action === Action.UPDATE && allowedActions?.includes(Action.UPDATE_OWN)) {
    return userId !== undefined && userId === resourceOwnerId;
  }

  // Check if action is allowed
  return allowedActions?.includes(action) || false;
}

/**
 * Get all resources accessible by a group
 */
export function getAccessibleResources(groupId: number): Resource[] {
  if (groupId === SMFGroup.ADMINISTRATOR) {
    return Object.values(Resource);
  }

  const permissions = PERMISSIONS_MATRIX[groupId];
  if (!permissions) {
    return [];
  }

  return Object.keys(permissions) as Resource[];
}

/**
 * Check if a user has admin access
 */
export function hasAdminAccess(groupId: number): boolean {
  return ADMIN_GROUP_IDS.has(groupId);
}

/**
 * Check if a user has moderation access for comments
 * Only Administrators, Global Moderators, and Moderators can moderate
 */
export function hasModerationAccess(groupId: number): boolean {
  return (
    groupId === SMFGroup.ADMINISTRATOR ||
    groupId === SMFGroup.GLOBAL_MODERATOR ||
    groupId === SMFGroup.MODERATOR
  );
}

/**
 * Get user role name based on group ID
 */
export function getRoleName(groupId: number): string {
  const roleNames: Record<number, string> = {
    [SMFGroup.ADMINISTRATOR]: 'Administrator',
    [SMFGroup.GLOBAL_MODERATOR]: 'Global Moderator',
    [SMFGroup.MODERATOR]: 'Moderator',
    [SMFGroup.NEWBIE]: 'Newbie',
    [SMFGroup.JR_MEMBER]: 'Jr. Member',
    [SMFGroup.FULL_MEMBER]: 'Full Member',
    [SMFGroup.SR_MEMBER]: 'Sr. Member',
    [SMFGroup.HERO_MEMBER]: 'Hero Member',
    [SMFGroup.STAFF_AK]: 'Staff AK',
    [SMFGroup.STAFF_AK_2]: 'Staff AK 2',
    [SMFGroup.STAFF_WEBZINE]: 'Staff Webzine',
    [SMFGroup.STAFF_AK_3]: 'Staff AK 3',
    [SMFGroup.REDACTEUR_INVITE]: 'Rédacteur invité',
    [SMFGroup.LEGEND_MEMBER]: 'Legend Member',
  };

  return roleNames[groupId] || 'Member';
}
