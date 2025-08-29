import { SetMetadata } from '@nestjs/common';

export enum Permission {
  // User management permissions
  VIEW_USERS = 'view_users',
  EDIT_USERS = 'edit_users',
  DELETE_USERS = 'delete_users',
  BAN_USERS = 'ban_users',
  MANAGE_USER_ROLES = 'manage_user_roles',

  // Content management permissions
  VIEW_CONTENT = 'view_content',
  EDIT_CONTENT = 'edit_content',
  DELETE_CONTENT = 'delete_content',
  PUBLISH_CONTENT = 'publish_content',
  MANAGE_CONTENT_RELATIONSHIPS = 'manage_content_relationships',
  MANAGE_CONTENT_TAGS = 'manage_content_tags',
  UPLOAD_MEDIA = 'upload_media',

  // Moderation permissions
  VIEW_MODERATION_QUEUE = 'view_moderation_queue',
  MODERATE_REVIEWS = 'moderate_reviews',
  MODERATE_CONTENT = 'moderate_content',
  VIEW_REPORTS = 'view_reports',
  PROCESS_REPORTS = 'process_reports',

  // System administration permissions
  VIEW_SYSTEM_STATS = 'view_system_stats',
  MANAGE_SYSTEM_SETTINGS = 'manage_system_settings',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  EXPORT_DATA = 'export_data',
  MANAGE_BACKUPS = 'manage_backups',

  // Business management permissions
  VIEW_BUSINESS = 'view_business',
  EDIT_BUSINESS = 'edit_business',
  DELETE_BUSINESS = 'delete_business',

  // Super admin permissions
  SUPER_ADMIN = 'super_admin',
}

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// Permission groups for easier management
export const PermissionGroups = {
  USER_MANAGER: [
    Permission.VIEW_USERS,
    Permission.EDIT_USERS,
    Permission.BAN_USERS,
    Permission.MANAGE_USER_ROLES,
  ],

  CONTENT_MANAGER: [
    Permission.VIEW_CONTENT,
    Permission.EDIT_CONTENT,
    Permission.PUBLISH_CONTENT,
    Permission.MANAGE_CONTENT_RELATIONSHIPS,
    Permission.MANAGE_CONTENT_TAGS,
    Permission.UPLOAD_MEDIA,
  ],

  MODERATOR: [
    Permission.VIEW_MODERATION_QUEUE,
    Permission.MODERATE_REVIEWS,
    Permission.MODERATE_CONTENT,
    Permission.VIEW_REPORTS,
    Permission.PROCESS_REPORTS,
  ],

  BUSINESS_MANAGER: [
    Permission.VIEW_BUSINESS,
    Permission.EDIT_BUSINESS,
    Permission.DELETE_BUSINESS,
  ],

  SYSTEM_ADMIN: [
    Permission.VIEW_SYSTEM_STATS,
    Permission.MANAGE_SYSTEM_SETTINGS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.EXPORT_DATA,
    Permission.MANAGE_BACKUPS,
  ],

  SUPER_ADMIN: [Permission.SUPER_ADMIN],
};
