# Security Audit Report

**Date:** January 2026
**Scope:** anime-kun-nestjs-v2 API Backend

---

## Executive Summary

This document tracks security findings, fixes, and remaining vulnerabilities in the API codebase.

---

## ✅ Fixed Issues

### Critical (Fixed)

| Issue | Location | Fix |
|-------|----------|-----|
| Default JWT Secret | `jwt.config.ts`, `jwt.strategy.ts` | Now throws error if `JWT_SECRET` not set |
| CORS allows all origins | `main.ts` | Strict whitelist only, no fallback |
| Hardcoded reCAPTCHA key | `.env.example` | Replaced with placeholder |

### High (Fixed)

| Issue | Location | Fix |
|-------|----------|-----|
| SSRF in URL upload | `media.service.ts` | Added URL validation with domain whitelist |
| SSRF in metadata fetch | `media.service.ts` | Added URL validation blocking private IPs |
| Missing file size limits | `media.service.ts` | Added 10MB/5MB limits |
| Missing security headers | `main.ts` | Added X-Frame-Options, HSTS, etc. |
| X-User-Id header exposed | `main.ts` | Removed from CORS allowedHeaders |

### Medium (Fixed)

| Issue | Location | Fix |
|-------|----------|-----|
| IP-only rate limiting | N/A | Added `UserRateLimitGuard` with user ID + IP |

---

## ⚠️ Known Issues (Require Manual Review)

### SQL Injection Risk - HIGH PRIORITY

**Location:** `src/modules/users/users.service.ts` (lines 778-830, 848-890, 942-980)

**Description:** The recommendation queries use `$queryRawUnsafe` with string interpolation for user-provided data:

```typescript
// UNSAFE - String interpolation with user input
`similarity(LOWER(a.titre), LOWER('${originalMediaTitle.replace(/'/g, "''")}'))`
`WHERE LOWER(t.tag_name) IN (${genresToUse.map(g => `'${g.toLowerCase().replace(/'/g, "''")}'`).join(',')})`
```

**Risk:** While single quotes are escaped, this is not robust protection. Advanced SQL injection techniques may bypass this.

**Recommendation:** Refactor to use Prisma's safe parameterized queries:
```typescript
// SAFE - Use Prisma.sql with Prisma.join for arrays
const tags = Prisma.join(genresToUse.map(g => g.toLowerCase()));
await this.prisma.$queryRaw`
  SELECT ... WHERE LOWER(t.tag_name) IN (${tags})
`;
```

### Raw SQL Usage Audit

The following files use `$queryRawUnsafe` or `$executeRawUnsafe` and should be reviewed:

**High Priority (User-facing):**
- `src/modules/users/users.service.ts` - User recommendations, reviews
- `src/modules/forums/forums.service.ts` - Forum messages
- `src/modules/business/business.service.ts` - Business search

**Medium Priority (Admin-only):**
- `src/modules/admin/users/admin-users.service.ts`
- `src/modules/admin/content/admin-content.service.ts`
- `src/modules/admin/moderation/admin-moderation.service.ts`
- `src/modules/admin/logging/admin-logging.service.ts`

**Safe Patterns Found:**
- Most `$queryRawUnsafe` calls use parameterized queries with `...params` spread
- `Prisma.sql` and `Prisma.join` are used correctly in `friends.service.ts`

---

## Security Controls in Place

### Authentication
- ✅ JWT-based authentication with refresh tokens
- ✅ bcrypt password hashing (12 rounds)
- ✅ Google OAuth integration
- ✅ Email verification for new accounts
- ✅ Refresh token revocation on logout/password change

### Authorization
- ✅ RBAC with AdminGuard, RolesGuard, PermissionsGuard
- ✅ Super admin bypass for system administrators

### Input Validation
- ✅ Global ValidationPipe with whitelist enabled
- ✅ DTOs with class-validator decorators
- ✅ File type/MIME validation for uploads

### Rate Limiting
- ✅ Global rate limiting via express-rate-limit
- ✅ Per-route rate limiting in gateway
- ✅ User ID + IP rate limiting (new)

### Logging & Monitoring
- ✅ Sentry integration for error tracking
- ✅ Audit logging for admin actions
- ✅ Activity tracking middleware
- ✅ Authorization header redaction in logs

---

## Security Headers

The following headers are now set on all responses:

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | SAMEORIGIN | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-XSS-Protection | 1; mode=block | Legacy XSS protection |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer leakage |
| Permissions-Policy | Restricted | Block sensitive APIs |
| Strict-Transport-Security | max-age=31536000 | HSTS (production only) |

---

## URL Validation (SSRF Protection)

### Allowed Domains for Image Upload

The following domains are whitelisted for `upload-from-url`:

- `cdn.myanimelist.net`
- `img.anili.st`, `s4.anilist.co`
- `media.kitsu.io`
- `images.igdb.com`
- `image.tmdb.org`
- `booknode.com`, `babelio.com`, `fnac.com`
- `images-*.ssl-images-amazon.com`, `m.media-amazon.com`
- `i.imgur.com`, `imgur.com`
- `upload.wikimedia.org`

To add a new domain, update `src/shared/utils/url-validator.util.ts`.

### Blocked IP Ranges

All private/internal IP ranges are blocked:
- 127.x.x.x (loopback)
- 10.x.x.x (private class A)
- 172.16-31.x.x (private class B)
- 192.168.x.x (private class C)
- 169.254.x.x (link-local/AWS metadata)
- IPv6 private ranges

---

## Recommendations for Future Work

1. **Migrate raw SQL to Prisma queries** where possible
2. **Add CSRF protection** if cookie-based sessions are used
3. **Implement request signing** for cron/webhook endpoints
4. **Add Content-Security-Policy header** for additional XSS protection
5. **Regular dependency audits** with `npm audit`
6. **Penetration testing** before major releases

---

## Audit Trail

| Date | Action | By |
|------|--------|-----|
| Jan 2026 | Initial security audit | Claude Code |
| Jan 2026 | Fixed critical JWT/CORS/reCAPTCHA issues | Claude Code |
| Jan 2026 | Added SSRF protection | Claude Code |
| Jan 2026 | Added security headers | Claude Code |
| Jan 2026 | Added user-based rate limiting | Claude Code |
