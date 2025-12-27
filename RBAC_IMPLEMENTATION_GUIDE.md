# Role-Based Access Control (RBAC) System Implementation Guide

## Overview
This guide provides a complete implementation plan for the custom RBAC system that allows granular access control management for admin users.

---

## ✅ Completed

### 1. Database Schema (COMPLETED)
- ✅ Created Prisma schema for RBAC system
- ✅ Added 5 new tables:
  - `ak_roles` - Custom roles
  - `ak_permissions` - Resource + Action permissions
  - `ak_role_permissions` - Role-Permission mapping
  - `ak_user_roles` - User role assignments
  - `ak_role_audit_logs` - Activity logging
- ✅ Updated `SmfMember` model with RBAC relations
- ✅ Created migration SQL file

**Location:** `/prisma/schema.prisma` (lines 1267-1374)
**Migration:** `/prisma/migrations/add_rbac_system/migration.sql`

---

## 📋 Implementation Roadmap

### Phase 1: Backend API (2-3 hours)

#### Step 1.1: Create NestJS Module Structure
```bash
cd /home/zohardus/www/anime-kun-nestjs-v2
nest g module modules/rbac
nest g service modules/rbac/roles
nest g service modules/rbac/permissions
nest g controller modules/rbac/roles
nest g controller modules/rbac/permissions
```

#### Step 1.2: Create DTOs

**File:** `src/modules/rbac/dto/create-role.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, MinLength, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'content_manager' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  roleName: string;

  @ApiProperty({ example: 'Content Manager' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  displayName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: '#3B82F6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

**File:** `src/modules/rbac/dto/update-role.dto.ts`
```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
```

**File:** `src/modules/rbac/dto/assign-permissions.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3] })
  @IsArray()
  @IsInt({ each: true })
  permissionIds: number[];
}
```

**File:** `src/modules/rbac/dto/assign-role.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsBoolean } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty()
  @IsInt()
  userId: number;

  @ApiProperty()
  @IsInt()
  roleId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  expiresAt?: Date;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

#### Step 1.3: Implement Roles Service

**File:** `src/modules/rbac/roles.service.ts`
```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(createRoleDto: CreateRoleDto, adminId: number) {
    // Check if role name already exists
    const existing = await this.prisma.akRole.findUnique({
      where: { roleName: createRoleDto.roleName }
    });

    if (existing) {
      throw new BadRequestException(`Role "${createRoleDto.roleName}" already exists`);
    }

    const role = await this.prisma.akRole.create({
      data: createRoleDto
    });

    // Log the action
    await this.logAction(adminId, 'ROLE_CREATED', 'ROLE', role.idRole, {
      roleName: role.roleName,
      displayName: role.displayName
    });

    return role;
  }

  async findAll(includeInactive = false) {
    return this.prisma.akRole.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        },
        _count: {
          select: {
            userRoles: true,
            rolePermissions: true
          }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { displayName: 'asc' }
      ]
    });
  }

  async findOne(id: number) {
    const role = await this.prisma.akRole.findUnique({
      where: { idRole: id },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        },
        userRoles: {
          where: { isActive: true },
          include: {
            member: {
              select: {
                idMember: true,
                memberName: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: number, updateRoleDto: UpdateRoleDto, adminId: number) {
    const role = await this.findOne(id);

    // Prevent updating system roles
    if (role.isSystem && updateRoleDto.isSystem === false) {
      throw new BadRequestException('Cannot modify system role flags');
    }

    const updated = await this.prisma.akRole.update({
      where: { idRole: id },
      data: updateRoleDto
    });

    await this.logAction(adminId, 'ROLE_UPDATED', 'ROLE', id, updateRoleDto);

    return updated;
  }

  async remove(id: number, adminId: number) {
    const role = await this.findOne(id);

    // Prevent deleting system roles
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system roles');
    }

    await this.prisma.akRole.delete({
      where: { idRole: id }
    });

    await this.logAction(adminId, 'ROLE_DELETED', 'ROLE', id, {
      roleName: role.roleName
    });

    return { message: 'Role deleted successfully' };
  }

  async assignPermissions(roleId: number, dto: AssignPermissionsDto, adminId: number) {
    const role = await this.findOne(roleId);

    // Remove existing permissions
    await this.prisma.akRolePermission.deleteMany({
      where: { idRole: roleId }
    });

    // Add new permissions
    const permissions = await this.prisma.akRolePermission.createMany({
      data: dto.permissionIds.map(permId => ({
        idRole: roleId,
        idPermission: permId,
        grantedBy: adminId
      }))
    });

    await this.logAction(adminId, 'PERMISSIONS_ASSIGNED', 'ROLE', roleId, {
      permissionIds: dto.permissionIds
    });

    return this.findOne(roleId);
  }

  async getRolePermissions(roleId: number) {
    const role = await this.findOne(roleId);
    return role.rolePermissions;
  }

  private async logAction(adminId: number, action: string, entityType: string, entityId: number, details: any) {
    await this.prisma.akRoleAuditLog.create({
      data: {
        idMember: adminId,
        action,
        entityType,
        entityId,
        details: JSON.stringify(details)
      }
    });
  }
}
```

#### Step 1.4: Implement Permissions Service

**File:** `src/modules/rbac/permissions.service.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.akPermission.findMany({
      where: { isActive: true },
      orderBy: [
        { resource: 'asc' },
        { action: 'asc' }
      ]
    });
  }

  async getGroupedPermissions() {
    const permissions = await this.findAll();

    // Group by resource
    const grouped = permissions.reduce((acc, perm) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push(perm);
      return acc;
    }, {} as Record<string, any[]>);

    return grouped;
  }

  async seedDefaultPermissions() {
    const resources = [
      'ARTICLES', 'ANIME', 'MANGA', 'JEUX_VIDEO',
      'SYNOPSIS', 'BUSINESS', 'SAISON', 'MEMBERS',
      'REVIEWS', 'FORUM', 'ROLES'
    ];

    const actions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'MODERATE', 'PUBLISH'];

    const permissions = [];
    for (const resource of resources) {
      for (const action of actions) {
        permissions.push({
          resource,
          action,
          description: `${action} access to ${resource}`
        });
      }
    }

    await this.prisma.akPermission.createMany({
      data: permissions,
      skipDuplicates: true
    });

    return this.findAll();
  }
}
```

#### Step 1.5: Implement Controllers

**File:** `src/modules/rbac/roles.controller.ts`
```typescript
import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseGuards, Request, ParseIntPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('RBAC - Roles')
@Controller('admin/roles')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new role' })
  create(@Body() createRoleDto: CreateRoleDto, @Request() req) {
    return this.rolesService.create(createRoleDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update role' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
    @Request() req
  ) {
    return this.rolesService.update(id, updateRoleDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete role' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.rolesService.remove(id, req.user.id);
  }

  @Post(':id/permissions')
  @ApiOperation({ summary: 'Assign permissions to role' })
  assignPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignPermissionsDto,
    @Request() req
  ) {
    return this.rolesService.assignPermissions(id, dto, req.user.id);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Get role permissions' })
  getRolePermissions(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.getRolePermissions(id);
  }
}
```

**File:** `src/modules/rbac/permissions.controller.ts`
```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('RBAC - Permissions')
@Controller('admin/permissions')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all permissions' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('grouped')
  @ApiOperation({ summary: 'Get permissions grouped by resource' })
  getGrouped() {
    return this.permissionsService.getGroupedPermissions();
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default permissions' })
  seed() {
    return this.permissionsService.seedDefaultPermissions();
  }
}
```

#### Step 1.6: Update RBAC Module

**File:** `src/modules/rbac/rbac.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [RolesController, PermissionsController],
  providers: [RolesService, PermissionsService, PrismaService],
  exports: [RolesService, PermissionsService]
})
export class RbacModule {}
```

---

### Phase 2: Frontend Admin Pages (3-4 hours)

#### Step 2.1: Create Role Management Page

**File:** `frontendv2/pages/admin/roles/index.vue`

This page should include:
- List of all roles with their permissions count
- Create new role button
- Edit/Delete actions for each role
- Search and filter capabilities

#### Step 2.2: Create Role Form Page

**File:** `frontendv2/pages/admin/roles/create.vue`
**File:** `frontendv2/pages/admin/roles/[id].vue`

Forms should include:
- Role name (kebab-case)
- Display name
- Description
- Color picker
- Priority slider
- System role checkbox
- Active/Inactive toggle

#### Step 2.3: Create Permission Matrix Component

**File:** `frontendv2/components/admin/PermissionMatrix.vue`

This component should display a matrix with:
- **Rows:** Resources (ARTICLES, ANIME, MANGA, etc.)
- **Columns:** Actions (CREATE, READ, UPDATE, DELETE, MODERATE, PUBLISH)
- **Cells:** Checkboxes to grant/revoke permissions
- Bulk select by row or column
- Save changes button

Example structure:
```
| Resource    | CREATE | READ | UPDATE | DELETE | MODERATE | PUBLISH |
|-------------|--------|------|--------|--------|----------|---------|
| ARTICLES    |   ✓    |  ✓   |   ✓    |   ✓    |    ✓     |    ✓    |
| ANIME       |   ✓    |  ✓   |   ✓    |        |          |         |
| MANGA       |   ✓    |  ✓   |   ✓    |        |          |         |
```

#### Step 2.4: Create User Role Assignment Page

**File:** `frontendv2/pages/admin/users/[id]/roles.vue`

Should allow:
- View user's current roles
- Add new role with optional expiration
- Remove role
- View role permissions
- Activity log

#### Step 2.5: Create Composables

**File:** `frontendv2/composables/useRolesAPI.ts`
```typescript
export function useRolesAPI() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()

  const fetchRoles = async () => {
    return $fetch(`${config.public.apiBase}/api/admin/roles`, {
      headers: authStore.getAuthHeaders()
    })
  }

  const createRole = async (data: any) => {
    return $fetch(`${config.public.apiBase}/api/admin/roles`, {
      method: 'POST',
      body: data,
      headers: authStore.getAuthHeaders()
    })
  }

  const updateRole = async (id: number, data: any) => {
    return $fetch(`${config.public.apiBase}/api/admin/roles/${id}`, {
      method: 'PATCH',
      body: data,
      headers: authStore.getAuthHeaders()
    })
  }

  const deleteRole = async (id: number) => {
    return $fetch(`${config.public.apiBase}/api/admin/roles/${id}`, {
      method: 'DELETE',
      headers: authStore.getAuthHeaders()
    })
  }

  const assignPermissions = async (roleId: number, permissionIds: number[]) => {
    return $fetch(`${config.public.apiBase}/api/admin/roles/${roleId}/permissions`, {
      method: 'POST',
      body: { permissionIds },
      headers: authStore.getAuthHeaders()
    })
  }

  const fetchPermissions = async () => {
    return $fetch(`${config.public.apiBase}/api/admin/permissions`, {
      headers: authStore.getAuthHeaders()
    })
  }

  const fetchGroupedPermissions = async () => {
    return $fetch(`${config.public.apiBase}/api/admin/permissions/grouped`, {
      headers: authStore.getAuthHeaders()
    })
  }

  return {
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    assignPermissions,
    fetchPermissions,
    fetchGroupedPermissions
  }
}
```

---

### Phase 3: Enhanced RBAC Utility (1 hour)

#### Update Frontend RBAC Utility

**File:** `frontendv2/utils/rbac.ts`

Add new functions:
```typescript
// Check permission using custom roles (database-driven)
export async function hasCustomPermission(
  userId: number,
  resource: Resource,
  action: Action
): Promise<boolean> {
  // Fetch user's custom roles and their permissions from API
  const userRoles = await fetchUserRoles(userId)

  for (const role of userRoles) {
    const permissions = role.rolePermissions
    if (permissions.some(p => p.permission.resource === resource && p.permission.action === action)) {
      return true
    }
  }

  return false
}

// Combine SMF groups and custom roles
export async function hasPermissionCombined(
  user: any,
  resource: Resource,
  action: Action
): Promise<boolean> {
  // First check SMF group-based permissions (legacy)
  if (hasPermission(user.groupId, resource, action)) {
    return true
  }

  // Then check custom role permissions
  return hasCustomPermission(user.id, resource, action)
}
```

---

## 🚀 Deployment Steps

### 1. Run Database Migration
```bash
cd /home/zohardus/www/anime-kun-nestjs-v2
npx prisma migrate dev --name add_rbac_system
npx prisma generate
```

### 2. Seed Default Permissions
```bash
# Call the seed endpoint after starting the server
curl -X POST http://localhost:3000/api/admin/permissions/seed \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 3. Create Default System Roles

Example roles to create:
- **Super Admin** - All permissions
- **Content Manager** - ANIME, MANGA, JEUX_VIDEO, BUSINESS (CREATE, READ, UPDATE, DELETE)
- **Moderator** - REVIEWS, FORUM, SYNOPSIS (MODERATE, DELETE)
- **Article Writer** - ARTICLES (CREATE, READ, UPDATE)
- **Read Only** - All resources (READ only)

---

## 📊 Admin UI Wireframe

```
┌─────────────────────────────────────────────────────────┐
│ Admin > Roles & Permissions                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [+ Create Role]          [🔍 Search roles...]          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Role: Content Manager                    [Edit] [X]│ │
│  │ Priority: 5  |  Users: 12  |  Permissions: 24     │ │
│  │ ──────────────────────────────────────────────────  │ │
│  │ Description: Manages anime, manga, and game content│ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Role: Moderator                          [Edit] [X]│ │
│  │ Priority: 3  |  Users: 5   |  Permissions: 8      │ │
│  │ ──────────────────────────────────────────────────  │ │
│  │ Description: Moderates reviews and forum posts     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Considerations

1. **Always validate on backend** - Frontend checks are for UX only
2. **Log all permission changes** - Use `ak_role_audit_logs`
3. **Rate limit role/permission API** - Prevent abuse
4. **Require super admin for role CRUD** - Add extra guard
5. **Validate permission combinations** - Some permissions require others
6. **Prevent privilege escalation** - Users can't grant permissions they don't have

---

## 🎯 Next Steps

1. Complete Phase 1 (Backend API) - **2-3 hours**
2. Test API endpoints with Postman/Swagger
3. Complete Phase 2 (Frontend pages) - **3-4 hours**
4. Test frontend functionality
5. Complete Phase 3 (Enhanced RBAC utility) - **1 hour**
6. Deploy to production
7. Create documentation for admins

**Total Estimated Time:** 6-8 hours

---

## 📝 Notes

- The system is designed to work alongside existing SMF group permissions
- Custom roles override SMF groups when assigned
- System roles (isSystem=true) cannot be deleted
- Audit logs track all permission changes
- Roles can have expiration dates for temporary access

---

## 🆘 Support

If you encounter issues during implementation:
1. Check Prisma schema syntax
2. Verify database connection
3. Check TypeScript types after migration
4. Test API endpoints individually
5. Review frontend composable error handling
