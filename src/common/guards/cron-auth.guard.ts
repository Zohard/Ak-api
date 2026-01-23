import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hasAdminAccess } from '../../shared/constants/rbac.constants';

@Injectable()
export class CronAuthGuard implements CanActivate {
    private readonly logger = new Logger(CronAuthGuard.name);

    constructor(private configService: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const headers = request.headers;

        // 1. Check for Cron API Key
        const apiKey = headers['x-cron-api-key'];
        const configuredKey = this.configService.get<string>('CRON_API_KEY');

        if (apiKey && configuredKey && apiKey === configuredKey) {
            this.logger.log('Cron access granted via API Key');
            return true;
        }

        // 2. Fallback: Check for Admin Access (for manual trigger via frontend)
        // We assume JwtAuthGuard has already run and populated request.user if a token was present
        // Note: If this guard is used ALONE without JwtAuthGuard, request.user might be undefined.
        // For the notifications controller, it is decorated with @UseGuards(JwtAuthGuard) at the controller level?
        // Let's check the controller. If JwtAuthGuard is global or class-level, request.user should be there.
        // If not, we might need to handle the case where we can't verify admin.

        const user = request.user;
        if (user) {
            const hasAccess = hasAdminAccess(user.groupId) || user.isAdmin;
            if (hasAccess) {
                this.logger.log(`Cron access granted to admin user ${user.id}`);
                return true;
            }
        }

        // If neither passed
        if (apiKey) {
            this.logger.warn('Invalid Cron API Key provided');
            throw new UnauthorizedException('Invalid API Key');
        }

        // If no key and no (valid) user session
        throw new ForbiddenException('Access denied: Valid API Key or Admin privileges required');
    }
}
