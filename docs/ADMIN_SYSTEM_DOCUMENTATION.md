# Admin System Documentation

## Overview

The Admin System is a comprehensive modular administrative interface for Anime-Kun built with NestJS. It provides granular control over users, content, and moderation workflows with enterprise-grade features including audit logging, role-based permissions, and automated moderation queues.

## Architecture

### Module Structure

```
src/modules/admin/
├── admin.module.ts              # Main admin module
├── admin.controller.ts          # Dashboard and system admin endpoints
├── admin.service.ts             # Core admin business logic
├── users/                       # User management module
│   ├── admin-users.module.ts
│   ├── admin-users.controller.ts
│   ├── admin-users.service.ts
│   └── dto/
├── content/                     # Content management module
│   ├── admin-content.module.ts
│   ├── admin-content.controller.ts
│   ├── admin-content.service.ts
│   └── dto/
└── moderation/                  # Moderation workflow module
    ├── admin-moderation.module.ts
    ├── admin-moderation.controller.ts
    ├── admin-moderation.service.ts
    └── dto/
```

## Features

### 1. User Management (`AdminUsersModule`)

#### Capabilities
- **User CRUD Operations**: Complete user lifecycle management
- **Role Management**: Assign and manage user groups and permissions
- **Ban/Unban System**: Temporary and permanent user restrictions
- **User Analytics**: Activity tracking and reputation scoring
- **Bulk Operations**: Mass user management actions

#### Key Endpoints
- `GET /admin/users` - Paginated user listing with search/filter
- `GET /admin/users/stats` - User statistics dashboard
- `GET /admin/users/:id` - Detailed user profile with activity
- `PUT /admin/users/:id` - Update user profile and settings
- `POST /admin/users/:id/ban` - Ban user with reason
- `POST /admin/users/:id/unban` - Restore user access
- `DELETE /admin/users/:id` - Delete user account

#### Features
- Advanced search and filtering
- User reputation scoring
- Activity timeline tracking
- Group assignment management
- Audit trail for all actions

### 2. Content Management (`AdminContentModule`)

#### Capabilities
- **Multi-Content Support**: Animes, Mangas, Business entities, Articles
- **Relationship Management**: Link related content with metadata
- **Media Management**: Handle uploads, screenshots, covers
- **Tag System**: Organize content with hierarchical tags
- **Staff Management**: Associate business entities with content
- **Bulk Operations**: Mass content actions

#### Key Endpoints
- `GET /admin/content` - Universal content listing
- `GET /admin/content/stats` - Content statistics
- `GET /admin/content/:type/:id` - Detailed content view
- `PUT /admin/content/:type/:id/status` - Update content status
- `DELETE /admin/content/:type/:id` - Delete content
- `POST /admin/content/bulk-action` - Bulk operations
- `GET /admin/content/:type/:id/relationships` - Content relationships
- `POST /admin/content/:type/:id/relationships` - Create relationships
- `GET /admin/content/:type/:id/staff` - Staff management
- `GET /admin/content/:type/:id/tags` - Tag management

#### Features
- Unified content interface
- Relationship mapping
- Media file management
- Tag hierarchy
- Staff attribution
- Publishing workflow

### 3. Moderation System (`AdminModerationModule`)

#### Capabilities
- **Review Moderation**: Approve/reject/edit user reviews
- **Content Reporting**: User-generated content reports
- **Automated Moderation**: AI-assisted content screening
- **Bulk Moderation**: Mass approval/rejection workflows
- **Queue Management**: Prioritized moderation workflows

#### Key Endpoints
- `GET /admin/moderation/queue` - Moderation queue with filters
- `GET /admin/moderation/stats` - Moderation statistics
- `POST /admin/moderation/reviews/:id/moderate` - Review moderation actions
- `POST /admin/moderation/reviews/bulk-moderate` - Bulk review actions
- `GET /admin/moderation/reports` - Content reports
- `POST /admin/moderation/reports` - Submit content report
- `PUT /admin/moderation/reports/:id/process` - Process report

#### Features
- Intelligent queue prioritization
- Automated spam detection
- User reputation scoring
- Bulk moderation tools
- Comprehensive reporting

### 4. System Administration

#### Capabilities
- **Dashboard Analytics**: Comprehensive system overview
- **Health Monitoring**: Database, storage, performance metrics
- **Settings Management**: System-wide configuration
- **Data Export**: Multiple format support (CSV, JSON)
- **Activity Logging**: Complete admin action audit trail

#### Key Endpoints
- `GET /admin/dashboard` - Comprehensive dashboard
- `GET /admin/activity` - Recent system activity
- `GET /admin/system/health` - System health status
- `GET /admin/settings` - System settings
- `PUT /admin/settings` - Update settings
- `POST /admin/export` - Data export functionality

## Security & Permissions

### Role-Based Access Control (RBAC)

The system implements granular permissions with the following structure:

#### Permission Categories
- **User Management**: `view_users`, `edit_users`, `delete_users`, `ban_users`, `manage_user_roles`
- **Content Management**: `view_content`, `edit_content`, `delete_content`, `publish_content`, `manage_content_relationships`
- **Moderation**: `view_moderation_queue`, `moderate_reviews`, `moderate_content`, `view_reports`, `process_reports`
- **System Administration**: `view_system_stats`, `manage_system_settings`, `view_audit_logs`, `export_data`

#### Permission Groups
- **Super Admin**: All permissions
- **User Manager**: User-related permissions
- **Content Manager**: Content-related permissions  
- **Moderator**: Moderation-related permissions
- **System Admin**: System administration permissions

#### Implementation
```typescript
// Example usage in controllers
@Permissions(Permission.VIEW_USERS, Permission.EDIT_USERS)
@UseGuards(JwtAuthGuard, PermissionsGuard)
async updateUser() { ... }
```

### Audit Logging

Comprehensive audit logging tracks all administrative actions:

#### Logged Information
- Admin user performing action
- Action type and target
- Timestamp and IP address
- User agent and metadata
- Reason/justification

#### Features
- Automatic logging via interceptors
- Manual logging for complex operations
- Searchable audit trail
- Export capabilities
- Retention policies

## Queue System (BullMQ)

### Automated Moderation Workflow

The system uses Redis-backed queues for scalable moderation:

#### Queue Types
- **Review Submission**: Auto-moderation of new reviews
- **Content Reporting**: Processing user reports
- **Bulk Operations**: Background processing of mass actions
- **Auto Moderation**: AI-assisted content screening

#### Auto-Moderation Features
- **Spam Detection**: Pattern recognition for spam content
- **Quality Assessment**: Review quality scoring
- **User Reputation**: Historical behavior analysis
- **Content Analysis**: Inappropriate content detection

#### Configuration
```typescript
// Queue job example
await queueService.addReviewModerationJob(reviewId, userId, contentId, contentType);
```

## Admin CRUD Roadmap: Animes, Mangas, Business

- Overview: Implement admin CRUD for core entities with server-side filtering, sorting, pagination, image handling, and admin-only access. Aligns with tables `ak_animes`, `ak_mangas`, and `ak_business`.

- Backend Endpoints (admin-only):
  - Animes:
    - `GET /api/admin/animes`: list with `page`, `limit`, `status`, `search` filters
    - `GET /api/admin/animes/:id`: fetch one
    - `POST /api/admin/animes`: create (required: `titre`)
    - `PUT /api/admin/animes/:id`: update
    - `DELETE /api/admin/animes/:id`: delete
    - Extras: staff (`GET/POST/DELETE /:id/staff`), tags (`GET/POST/DELETE /:id/tags`), relations (`GET/POST/DELETE /:id/relations`), screenshots (`GET/POST/DELETE /:id/screenshots`), autocomplete (`GET /api/admin/animes/autocomplete`)
  - Mangas:
    - `GET /api/admin/mangas`, `GET /api/admin/mangas/:id`, `POST /api/admin/mangas`, `PUT /api/admin/mangas/:id`, `DELETE /api/admin/mangas/:id`
    - Extras: tags, relations, covers mirror anime endpoints; autocomplete `GET /api/admin/mangas/autocomplete`
  - Business:
    - `GET /api/admin/business`, `GET /api/admin/business/:id`, `POST /api/admin/business`, `PUT /api/admin/business/:id`, `DELETE /api/admin/business/:id`
    - Upload image: `POST /api/admin/business/:id/upload-image`

- Field Mapping (DB accurate):
  - Anime (`ak_animes`): `idAnime(PK)`, `niceUrl`, `titre`(required), `titreOrig`, `annee(number)`, `nbEp(number)`, `image`, `studio`, `synopsis`, `statut(0|1|2)`, `realisateur`, read-only: `nbReviews`, `moyenneNotes`, `dateAjout`.
  - Manga (`ak_mangas`): `idManga(PK)`, `niceUrl`, `titre`(required), `auteur`, `annee(string len 4)`, `origine`, `titreOrig`, `titreFr`, `titresAlternatifs`, `licence`, `nbVolumes(string)`, `nbVol(number)`, `statutVol`, `synopsis`, `image`, `editeur`, `isbn`, `precisions`, `tags`, `statut(0|1|2)`, `ficheComplete`, read-only metrics: `nbClics*`, `nbReviews`, `moyenneNotes`, `dateAjout`.
  - Business (`ak_business`): `idBusiness(PK)`, `niceUrl`, `type`, `denomination`(required), `autresDenominations`, `image`, `date(string)`, `origine`, `siteOfficiel(url)`, `notes`, `statut`, read-only metrics: `nbClics*`, `relations`, `dateAjout`.

- Validation Hints:
  - Anime: `annee>=1900`, `nbEp>=0`, `statut in {0,1,2}`.
  - Manga: `annee` is STRING (e.g., "2024"), `nbVol>=0`, `statut in {0,1,2}`.
  - Business: `siteOfficiel` URL if provided; keep `date` as free-form string unless standardized.

- Images:
  - Use existing media upload: `POST /api/media/upload` with `type: 'anime'|'manga'|'cover'`, save returned `filename` to entity `image`.
  - Business image via `POST /api/admin/business/:id/upload-image` also supported.

- Frontend Admin (Nuxt) Pages:
  - Animes: `pages/admin/animes/index.vue` (list), `create.vue`, `[id].vue` (edit)
  - Mangas: `pages/admin/mangas/index.vue`, `create.vue`, `[id].vue`
  - Business: `pages/admin/business/index.vue`, `create.vue`, `[id].vue`
  - Features: server-side pagination, search, filters, sorting; forms with validation; image uploader; slug (niceUrl) generator; status chips; toasts.
  - Auth: route middleware to enforce admin; attach `Authorization: Bearer ...` to API calls.

- Implementation Checklist:
  - Add NestJS admin controllers/services (or bridge legacy endpoints) for the endpoints above with `JwtAuthGuard` + `AdminGuard`.
  - Create DTOs matching DB fields exactly (notably Manga `annee` as string).
  - Build frontend admin tables and forms per entity.
  - Wire media upload and preview.
  - Add Swagger tags for Admin CRUD and ensure examples reflect required/optional fields.

## Database Schema

### New Tables
- `moderation_reports`: Content reports and processing status
- `admin_audit_log`: Complete audit trail of admin actions
- `moderation_log`: Moderation-specific action logging
- `system_settings`: System-wide configuration storage
- `user_permissions`: User-specific permission overrides

### Enhanced Tables
- `ak_critique`: Added moderation fields (`moderated_by`, `moderated_at`, `moderation_reason`)
- Indexes added for performance optimization

## API Documentation

### Response Formats

#### Standard Success Response
```json
{
  "data": { ... },
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### Paginated Response
```json
{
  "items": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 100,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

#### Error Response
```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "statusCode": 400,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Development & Testing

### Running Tests
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Specific admin tests
npm run test -- admin

# Coverage report
npm run test:cov
```

### Development Setup
1. Install dependencies: `npm install`
2. Set up environment variables
3. Run database migrations
4. Start Redis for queues
5. Start development server: `npm run start:dev`

## Performance Considerations

### Database Optimization
- Indexes on frequently queried fields
- Pagination for large datasets
- Query optimization for complex joins
- Connection pooling

### Caching Strategy
- Redis caching for frequently accessed data
- Application-level caching for static content
- Query result caching

### Queue Management
- Background processing for heavy operations
- Prioritized job processing
- Graceful error handling and retries

## Monitoring & Maintenance

### Health Checks
- Database connectivity and performance
- Queue system status
- Storage usage monitoring
- Application performance metrics

### Maintenance Tasks
- Regular audit log cleanup
- Queue job cleanup
- Database optimization
- Cache invalidation

## Migration from Express Admin

### Compatibility
- 100% API compatibility with existing frontend
- Gradual migration path available
- Backward compatibility for legacy endpoints

### Improvements Over Legacy System
- Modular architecture vs monolithic file
- Type safety with TypeScript
- Comprehensive testing coverage
- Better error handling
- Scalable queue system
- Granular permissions
- Audit logging
- Performance optimizations

## Configuration

### Environment Variables
```bash
# Database
DATABASE_URL="postgresql://..."

# Redis (for queues)
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET="your-secret-key"
JWT_EXPIRE_TIME="24h"

# Upload Configuration
MAX_UPLOAD_SIZE=10485760  # 10MB
UPLOAD_DIRECTORY="./uploads"

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_RETRIES=3
```

### System Settings
Configurable through admin interface:
- Site name and branding
- Maintenance mode
- Registration settings
- Moderation policies
- File upload limits
- Cache settings

## Future Enhancements

### Planned Features
- Real-time notifications
- Advanced analytics dashboard
- Machine learning moderation
- API rate limiting
- Multi-language support
- Advanced reporting
- Integration with external services

### Performance Improvements
- Database query optimization
- Caching strategy enhancement
- Queue processing optimization
- CDN integration
- Search index optimization

This admin system provides a robust, scalable foundation for managing the Anime-Kun platform with enterprise-grade features and modern development practices.
