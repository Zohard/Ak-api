# Articles System Implementation Roadmap

## Phase 8: Articles System (Webzine)

### 8.1 Core Articles Module

#### 8.1.1 Database Schema Analysis
- ✅ Analyzed webzine tables structure:
  - `ak_webzine_articles` - Main articles table
  - `ak_webzine_categories` - Article categories
  - `ak_webzine_art2cat` - Article-category relationships
  - `ak_webzine_com` - Article comments
  - `ak_webzine_img` - Article images
  - `ak_webzine_sous_categories` - Sub-categories
  - `ak_webzine_to_fiches` - Article-content relationships
  - `ak_webzine_une` - Featured articles

#### 8.1.2 Prisma Schema Integration
- [x] Add Prisma models for webzine tables
- [x] Define relationships between articles, categories, comments
- [x] Set up proper foreign key constraints
- [x] Generate Prisma client with new models

#### 8.1.3 Core Articles Service
- [x] Create `ArticlesService` with CRUD operations
- [x] Implement article creation with rich text content
- [x] Add article status management (draft, published, archived)
- [x] Implement article search and filtering
- [x] Add article statistics (views, comments count)

#### 8.1.4 Articles DTOs
- [x] `CreateArticleDto` - Article creation
- [x] `UpdateArticleDto` - Article updates
- [x] `ArticleQueryDto` - Search and filtering
- [x] `ArticleResponseDto` - API responses
- [x] `PublishArticleDto` - Publishing workflow

### 8.2 Categories Management

#### 8.2.1 Categories Service
- [x] Create `CategoriesService` for category management
- [x] Implement category CRUD operations
- [x] Add sub-categories support
- [x] Category hierarchy management
- [x] Category statistics

#### 8.2.2 Category DTOs
- [x] `CreateCategoryDto`
- [x] `UpdateCategoryDto`
- [x] `CategoryQueryDto`
- [x] `CategoryResponseDto`

### 8.3 Comments System

#### 8.3.1 Comments Service
- [x] Create `CommentsService` for article comments
- [x] Implement comment CRUD operations
- [x] Add comment moderation system
- [ ] Nested comments support (replies)
- [x] Comment spam protection

#### 8.3.2 Comment DTOs
- [x] `CreateCommentDto`
- [x] `UpdateCommentDto`
- [x] `CommentQueryDto`
- [x] `ModerateCommentDto`

### 8.4 Articles Controller (Public API)

#### 8.4.1 Public Endpoints
- [x] `GET /api/articles` - List published articles
- [x] `GET /api/articles/:id` - Get article details
- [x] `GET /api/articles/category/:categoryId` - Articles by category
- [x] `GET /api/articles/search` - Search articles
- [x] `GET /api/articles/featured` - Featured articles
- [x] `POST /api/articles/:id/view` - Track article views

#### 8.4.2 Public Comments Endpoints
- [x] `GET /api/articles/:id/comments` - Get article comments
- [x] `POST /api/articles/:id/comments` - Add comment (auth required)
- [x] `PUT /api/articles/comments/:commentId` - Update own comment
- [x] `DELETE /api/articles/comments/:commentId` - Delete own comment

### 8.5 Admin Articles Management

#### 8.5.1 Admin Articles Controller
- [x] `GET /api/admin/articles` - List all articles (with drafts)
- [x] `POST /api/admin/articles` - Create article (writers only)
- [x] `GET /api/admin/articles/:id` - Get article (including drafts)
- [x] `PUT /api/admin/articles/:id` - Update article (author/admin)
- [x] `DELETE /api/admin/articles/:id` - Delete article (admin only)
- [x] `PUT /api/admin/articles/:id/publish` - Publish article
- [x] `PUT /api/admin/articles/:id/unpublish` - Unpublish article
- [x] `GET /api/admin/articles/stats` - Articles statistics

#### 8.5.2 Admin Categories Controller
- [x] `GET /api/admin/categories` - List categories
- [x] `POST /api/admin/categories` - Create category (admin only)
- [x] `PUT /api/admin/categories/:id` - Update category (admin only)
- [x] `DELETE /api/admin/categories/:id` - Delete category (admin only)

#### 8.5.3 Admin Comments Moderation
- [x] `GET /api/admin/comments` - List all comments
- [x] `GET /api/admin/comments/pending` - Pending moderation
- [x] `PUT /api/admin/comments/:id/approve` - Approve comment
- [x] `PUT /api/admin/comments/:id/reject` - Reject comment
- [x] `DELETE /api/admin/comments/:id` - Delete comment

### 8.6 Permission System

#### 8.6.1 User Roles for Articles
- [ ] **Reader** - Can read published articles, add comments
- [ ] **Writer** - Can create/edit own articles, manage own comments
- [ ] **Editor** - Can edit any article, moderate comments
- [ ] **Admin** - Full access to articles, categories, comments

#### 8.6.2 Guards and Decorators
- [x] `@CanWriteArticles()` - Writer/Editor/Admin roles
- [x] `@CanEditArticle()` - Author or Editor/Admin
- [x] `@CanModerateComments()` - Editor/Admin roles
- [x] `@CanManageCategories()` - Admin only
- [x] Article ownership verification

### 8.7 Media Integration

#### 8.7.1 Article Images
- [x] Integrate with existing Media module
- [x] Support for article cover images
- [ ] Rich text editor image uploads
- [x] Image gallery for articles
- [x] Image optimization and resizing

#### 8.7.2 Article-Content Relationships
- [x] Link articles to anime/manga (ak_webzine_to_fiches)
- [x] Related content suggestions
- [x] Content tagging system
- [x] Cross-reference management

### 8.8 Rich Text Editor Support

#### 8.8.1 Content Management
- [x] HTML content sanitization
- [ ] Markdown support (optional)
- [x] Rich text formatting preservation
- [x] Content validation and length limits
- [x] Auto-save drafts functionality

#### 8.8.2 SEO Features
- [x] Meta descriptions management
- [x] URL slugs generation
- [x] Tags management
- [ ] Social media preview generation

### 8.9 Featured Articles System

#### 8.9.1 Homepage Integration
- [x] Featured articles management (ak_webzine_une)
- [x] Article spotlight rotation
- [x] Featured articles API endpoints
- [x] Admin interface for featuring articles

### 8.10 Analytics and Reporting

#### 8.10.1 Article Metrics
- [x] View tracking and analytics
- [x] Popular articles tracking
- [x] Author performance metrics
- [x] Category performance analysis
- [x] Comment engagement metrics

#### 8.10.2 Admin Dashboard
- [x] Articles overview dashboard
- [x] Writing activity reports
- [x] Comment moderation queue
- [x] Popular content insights

### 8.11 Testing Suite

#### 8.11.1 Unit Tests
- [ ] Articles service tests
- [ ] Categories service tests
- [ ] Comments service tests
- [ ] Permission guards tests

#### 8.11.2 Integration Tests
- [ ] Articles API endpoints
- [ ] Admin management endpoints
- [ ] Comment moderation flow
- [ ] Media integration tests

#### 8.11.3 E2E Tests
- [ ] Complete article lifecycle
- [ ] Publishing workflow
- [ ] Comment moderation process
- [ ] Multi-user collaboration

### 8.12 Documentation

#### 8.12.1 API Documentation
- [ ] Swagger documentation for all endpoints
- [ ] Permission requirements documentation
- [ ] Response examples and schemas
- [ ] Error handling documentation

#### 8.12.2 User Guides
- [ ] Writer's guide for article creation
- [ ] Editor's guide for content management
- [ ] Admin guide for system management
- [ ] Comment moderation guidelines

## Implementation Order

### Phase 8.1: Core Foundation (Week 1)
1. Prisma schema integration
2. Basic Articles service and DTOs
3. Core CRUD operations
4. Basic API endpoints

### Phase 8.2: Categories & Comments (Week 2)
1. Categories management system
2. Comments system with moderation
3. Article-category relationships
4. Basic admin endpoints

### Phase 8.3: Permissions & Security (Week 3)
1. Role-based access control
2. Article ownership verification
3. Permission guards implementation
4. Security validations

### Phase 8.4: Advanced Features (Week 4)
1. Rich text editor integration
2. Media and image management
3. Featured articles system
4. Analytics and reporting

### Phase 8.5: Testing & Documentation (Week 5)
1. Comprehensive testing suite
2. API documentation
3. User guides and workflows
4. Performance optimization

## Technical Considerations

### Database Optimization
- Add proper indexes for article queries
- Implement full-text search for content
- Optimize comment pagination
- Cache frequently accessed articles

### Security Measures
- Content sanitization to prevent XSS
- Rate limiting for article creation
- Image upload security validation
- Comment spam protection

### Performance Features
- Article content caching
- Lazy loading for comments
- Image lazy loading and optimization
- Database query optimization

### Scalability Planning
- CDN integration for media files
- Database connection pooling
- Microservice architecture preparation
- Monitoring and logging integration

## Success Metrics

- [x] Complete CRUD operations for articles
- [x] Functional permission system
- [x] Comment moderation workflow
- [x] Media integration working
- [ ] All tests passing (>90% coverage)
- [x] API documentation complete
- [ ] Performance benchmarks met
- [ ] Security audit passed