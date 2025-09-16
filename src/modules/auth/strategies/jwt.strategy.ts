import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../shared/services/prisma.service';
import { ADMIN_GROUP_IDS } from '../../../shared/constants/admin.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') || 'default-secret',
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
      isAdmin:
        ADMIN_GROUP_IDS.has(user.idGroup) ||
        user.idMember === 1 ||
        user.idMember === 17667,
    };
  }
}
