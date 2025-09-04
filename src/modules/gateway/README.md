# API Gateway Module

A comprehensive API gateway implementation for the Anime-Kun NestJS API that provides centralized routing, rate limiting, authentication, and monitoring.

## Features

- **Route Management**: Dynamic route configuration and pattern matching
- **Rate Limiting**: Configurable rate limits per route/service
- **Authentication**: Integration with JWT authentication
- **Role-based Access**: Support for role-based route protection  
- **Request Logging**: Comprehensive request/response logging
- **Health Monitoring**: Gateway health status and metrics

## Usage

### Accessing the Gateway

The gateway is available at `/api/gateway/*` and forwards requests to appropriate services.

### Available Endpoints

#### Health Check
```http
GET /api/gateway/health
```

Returns gateway health status and configuration.

#### Route Information
```http
GET /api/gateway/routes
```

Lists all configured routes (requires authentication).

#### Route Forwarding
```http
ALL /api/gateway/*
```

Forwards requests to appropriate backend services based on route configuration.

## Default Route Configuration

The gateway comes pre-configured with routes for all major services:

- `/auth/*` → Auth service (rate limit: 5 req/15min)
- `/users/*` → Users service (requires auth, 100 req/15min)  
- `/animes/*` → Animes service (200 req/15min)
- `/mangas/*` → Mangas service (200 req/15min)
- `/reviews/*` → Reviews service (requires auth, 50 req/15min)
- `/search/*` → Search service (30 req/min)
- `/admin/*` → Admin service (requires auth + admin role, 100 req/15min)
- `/media/*` → Media service (50 req/15min)
- `/notifications/*` → Notifications service (requires auth, 100 req/15min)
- `/articles/*` → Articles service (100 req/15min)
- `/forums/*` → Forums service (100 req/15min)
- `/collections/*` → Collections service (requires auth, 100 req/15min)
- `/lists/*` → Lists service (requires auth, 100 req/15min)

## Rate Limiting

Each route can have custom rate limiting configured:

```typescript
{
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Maximum requests per window
}
```

Rate limits are applied per IP address and service combination.

## Authentication & Authorization

Routes can require:
- **Authentication**: Valid JWT token
- **Roles**: Specific user roles (admin, moderator, etc.)

Protected routes automatically validate tokens and check user permissions.

## Request Headers

The gateway adds custom headers to all responses:

- `X-Gateway-Timestamp`: Request processing timestamp
- `X-Gateway-Request-ID`: Unique request identifier

## Error Responses

The gateway returns structured error responses:

```json
{
  "error": "Error type",
  "message": "Detailed error message", 
  "timestamp": "2023-09-04T12:00:00Z",
  "retryAfter": 900 // For rate limit errors
}
```

## Monitoring

Gateway requests are logged with:
- Request method and path
- Client IP address  
- Response status and size
- Processing time
- Error details

## Configuration

The gateway service can be extended with custom routes:

```typescript
gatewayService.addRoute({
  path: '/custom/*',
  method: 'GET',
  target: 'custom-service',
  rateLimit: { windowMs: 60000, max: 10 },
  auth: true,
  roles: ['admin']
});
```

## Architecture

- **GatewayController**: Handles HTTP requests and routing
- **GatewayService**: Core routing logic and configuration
- **RateLimitGuard**: Implements per-route rate limiting
- **GatewayMiddleware**: Request logging and header injection