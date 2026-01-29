import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../shared/services/prisma.service';
import { hasAdminAccess, getRoleName } from '../../../shared/constants/rbac.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('jwt.secret');
    if (!jwtSecret) {
      throw new Error(
        'JWT_SECRET environment variable is required. Generate one with: openssl rand -base64 32',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.smfMember.findUnique({
      where: { idMember: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      id: user.idMember,
      username: user.memberName,
      email: user.emailAddress,
      groupId: user.idGroup,
      role: getRoleName(user.idGroup),
      isAdmin:
        hasAdminAccess(user.idGroup) ||
        user.idMember === 1 ||
        user.idMember === 17667,
    };
  }
}
