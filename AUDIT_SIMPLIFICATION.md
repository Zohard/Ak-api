# Audit Logging Simplification

## Problem
The original audit logging system was too cumbersome, requiring user-agent and IP address information for every action, making it difficult to use in practice.

## Solution
Created a simplified audit logging system with two approaches:

### 1. Simple Audit Logging (Recommended)
For most admin actions, you only need to provide the essential information:

```typescript
// Simple logging - no request context needed
await auditLogService.logSimpleAction({
  admin_id: adminId,
  action: 'user_ban',
  target_type: 'user',
  target_id: userId,
  reason: 'Spamming',
  metadata: { ban_duration: '7 days' }
});
```

### 2. Full Audit Logging (For sensitive actions)
When you need complete tracking (IP, user-agent, etc.):

```typescript
// Full logging - includes request context
await auditLogService.logAction({
  admin_id: adminId,
  action: 'user_delete',
  target_type: 'user',
  target_id: userId,
  reason: 'Account violation',
  ip_address: request.ip,
  user_agent: request.get('User-Agent'),
  metadata: { deletion_reason: 'Terms violation' }
});
```

## Clean Decorator Usage

The cleanest approach uses decorators with predefined constants:

```typescript
import { AuditLog, AuditActions, AuditTargets } from '../../../common/decorators/audit-log.decorator';

@Controller('admin/users')
@UseInterceptors(AuditLogInterceptor) // Apply to entire controller
export class AdminUsersController {

  @Put(':id')
  @AuditLog(AuditActions.USER_UPDATE, AuditTargets.USER) // Simple one-liner
  async updateUser(@Param('id') id: number, @Body() data: UpdateUserDto) {
    return this.service.update(id, data);
  }

  @Post(':id/ban')
  @AuditLog(AuditActions.USER_BAN, AuditTargets.USER) // Automatic logging
  async banUser(@Param('id') id: number, @Body('reason') reason: string) {
    return this.service.ban(id, reason);
  }
}
```

## Available Constants

### Audit Actions
```typescript
AuditActions.USER_CREATE
AuditActions.USER_UPDATE
AuditActions.USER_DELETE
AuditActions.USER_BAN
AuditActions.USER_UNBAN
AuditActions.CONTENT_UPDATE
AuditActions.REVIEW_APPROVE
// ... and more
```

### Audit Targets
```typescript
AuditTargets.USER
AuditTargets.ANIME
AuditTargets.MANGA
AuditTargets.REVIEW
AuditTargets.BUSINESS
// ... and more
```

## What Gets Logged Automatically

With the interceptor, these are captured automatically:
- ✅ Admin ID (from JWT token)
- ✅ Action (from decorator)
- ✅ Target type (from decorator)
- ✅ Target ID (from URL params or request body)
- ✅ HTTP method and URL
- ✅ Request parameters
- ✅ Timestamp

What's **NOT** logged by default (keeping it simple):
- ❌ User-agent (cumbersome, rarely useful)
- ❌ IP address (can be added if needed)
- ❌ Full request body (only sanitized params)

## Benefits

1. **Simple to use**: Just add `@AuditLog()` decorator
2. **No request context needed**: Works in services and background jobs
3. **Consistent actions**: Predefined constants prevent typos
4. **Automatic**: Interceptor handles most cases transparently
5. **Flexible**: Can still do full logging when needed

## Migration

Old way (cumbersome):
```typescript
// Had to pass request context everywhere
async banUser(id: number, reason: string, request: Request) {
  const result = await this.service.ban(id, reason);
  
  // Manual logging with all the request details
  await this.auditService.logAction({
    admin_id: request.user.id,
    action: 'user_ban',
    target_type: 'user', 
    target_id: id,
    reason,
    ip_address: this.getClientIp(request),
    user_agent: request.get('User-Agent'),
    metadata: { /* complex extraction */ }
  });
  
  return result;
}
```

New way (clean):
```typescript
@AuditLog(AuditActions.USER_BAN, AuditTargets.USER)
async banUser(id: number, reason: string) {
  return this.service.ban(id, reason); // That's it!
}
```

The audit logging now focuses on **what matters**: who did what to what, when, and why. The technical details (IP, user-agent) are optional and only added when specifically needed for security investigations.