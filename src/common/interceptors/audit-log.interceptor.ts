import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from '../services/audit-log.service';

export const AUDIT_LOG_KEY = 'audit_log';
export const AuditLog = (action: string, target_type?: string) =>
  SetMetadata(AUDIT_LOG_KEY, { action, target_type });

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditConfig = this.reflector.getAllAndOverride<{
      action: string;
      target_type?: string;
    }>(AUDIT_LOG_KEY, [context.getHandler(), context.getClass()]);

    if (!auditConfig) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.isAdmin) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          // Extract target ID from request parameters or response
          const targetId =
            request.params?.id || request.body?.id || response?.id || null;

          // Use simple logging for interceptor (no user-agent/IP by default)
          await this.auditLogService.logSimpleAction({
            admin_id: user.id,
            action: auditConfig.action,
            target_type: auditConfig.target_type,
            target_id: targetId ? parseInt(targetId) : undefined,
            metadata: {
              method: request.method,
              url: request.url,
              body: this.sanitizeBody(request.body),
              params: request.params,
            },
          });
        } catch (error) {
          // Don't fail the request if audit logging fails
          console.error('Audit logging error:', error);
        }
      }),
    );
  }

  private getClientIp(request: any): string {
    return (
      request.ip ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      'unknown'
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return null;

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key'];
    const sanitized = { ...body };

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}
