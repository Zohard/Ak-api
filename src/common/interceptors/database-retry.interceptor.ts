import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retry, mergeMap } from 'rxjs/operators';

@Injectable()
export class DatabaseRetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DatabaseRetryInterceptor.name);

  // Max retries for database connection errors
  private readonly MAX_RETRIES = 3;

  // Initial delay between retries (ms)
  private readonly INITIAL_DELAY = 500;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request?.method || 'UNKNOWN';
    const url = request?.url || 'unknown';

    return next.handle().pipe(
      // Retry with exponential backoff on database errors
      retry({
        count: this.MAX_RETRIES,
        delay: (error, retryCount) => {
          // Only retry on database connection errors
          if (!this.isDatabaseConnectionError(error)) {
            return throwError(() => error);
          }

          const delay = this.INITIAL_DELAY * Math.pow(2, retryCount - 1);
          this.logger.warn(
            `Database error on ${method} ${url} (retry ${retryCount}/${this.MAX_RETRIES}, waiting ${delay}ms): ${error.message}`
          );

          return timer(delay);
        },
      }),
      // Transform unrecoverable database errors into proper HTTP errors
      catchError(error => {
        if (this.isDatabaseConnectionError(error)) {
          this.logger.error(
            `Database connection failed after ${this.MAX_RETRIES} retries on ${method} ${url}: ${error.message}`
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
   * Check if the error is a database connection error that should be retried
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

    // String-based error detection
    const connectionErrorPatterns = [
      'connection',
      'timeout',
      'timed out',
      'econnrefused',
      'econnreset',
      'enotfound',
      'socket hang up',
      'max client connections reached',
      'too many connections',
      'connection pool',
      'fatal',
      'terminating connection',
      'server closed the connection',
      'could not connect',
      'connection refused',
      'network',
    ];

    return connectionErrorPatterns.some(pattern => message.includes(pattern));
  }
}
