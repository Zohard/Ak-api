import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class DatabaseRetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DatabaseRetryInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      // Only catch and transform database connection errors into proper HTTP errors
      catchError(error => {
        if (this.isDatabaseConnectionError(error)) {
          const request = context.switchToHttp().getRequest();
          const method = request?.method || 'UNKNOWN';
          const url = request?.url || 'unknown';

          this.logger.error(
            `Database connection error on ${method} ${url}: ${error.message}`
          );

          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                  message: 'Database temporarily unavailable. Please try again.',
                  error: 'Service Unavailable',
                },
                HttpStatus.SERVICE_UNAVAILABLE
              )
          );
        }

        return throwError(() => error);
      })
    );
  }

  /**
   * Check if the error is a database connection error
   */
  private isDatabaseConnectionError(error: any): boolean {
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';
    const code = error.code || '';

    // Prisma connection errors
    const prismaConnectionErrors = [
      'P2024', // Timed out fetching a new connection from the pool
      'P2034', // Transaction failed due to a write conflict or a deadlock
      'P1001', // Can't reach database server
      'P1002', // The database server was reached but timed out
      'P1008', // Operations timed out
      'P1017', // Server has closed the connection
    ];

    if (prismaConnectionErrors.includes(code)) {
      return true;
    }

    // Only match very specific connection error patterns to avoid false positives
    const connectionErrorPatterns = [
      'can\'t reach database',
      'connection pool timeout',
      'max client connections reached',
      'server closed the connection unexpectedly',
    ];

    return connectionErrorPatterns.some(pattern => message.includes(pattern));
  }
}
