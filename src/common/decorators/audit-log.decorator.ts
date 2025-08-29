import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'audit_log';

/**
 * Simple audit log decorator for admin actions
 * @param action - The action being performed (e.g., 'user_ban', 'content_delete')
 * @param target_type - Optional target type (e.g., 'user', 'anime', 'review')
 */
export const AuditLog = (action: string, target_type?: string) =>
  SetMetadata(AUDIT_LOG_KEY, { action, target_type });

/**
 * Common audit log actions for consistency
 */
export const AuditActions = {
  // User actions
  USER_CREATE: 'user_create',
  USER_UPDATE: 'user_update',
  USER_DELETE: 'user_delete',
  USER_BAN: 'user_ban',
  USER_UNBAN: 'user_unban',
  USER_ROLE_CHANGE: 'user_role_change',

  // Content actions
  CONTENT_CREATE: 'content_create',
  CONTENT_UPDATE: 'content_update',
  CONTENT_DELETE: 'content_delete',
  CONTENT_PUBLISH: 'content_publish',
  CONTENT_UNPUBLISH: 'content_unpublish',

  // Moderation actions
  REVIEW_APPROVE: 'review_approve',
  REVIEW_REJECT: 'review_reject',
  REVIEW_DELETE: 'review_delete',
  BULK_MODERATE: 'bulk_moderate',

  // System actions
  SETTINGS_UPDATE: 'settings_update',
  SYSTEM_MAINTENANCE: 'system_maintenance',
  DATA_EXPORT: 'data_export',
} as const;

/**
 * Target types for consistency
 */
export const AuditTargets = {
  USER: 'user',
  ANIME: 'anime',
  MANGA: 'manga',
  BUSINESS: 'business',
  ARTICLE: 'article',
  REVIEW: 'review',
  SYSTEM: 'system',
} as const;
