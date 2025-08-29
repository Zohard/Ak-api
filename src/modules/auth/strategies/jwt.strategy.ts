import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../shared/services/prisma.service';

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
        user.idGroup === 1 || user.idMember === 1 || user.idMember === 17667,
    };
  }
}
