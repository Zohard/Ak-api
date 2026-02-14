import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
    controllers: [SocialController],
    providers: [SocialService, PrismaService],
    exports: [SocialService],
})
export class SocialModule { }
