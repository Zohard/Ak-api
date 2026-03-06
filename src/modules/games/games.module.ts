import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { AnimesModule } from '../animes/animes.module';
import { PrismaService } from '../../shared/services/prisma.service';
import { R2Service } from '../media/r2.service';

@Module({
    imports: [AnimesModule],
    controllers: [GamesController],
    providers: [GamesService, PrismaService, R2Service],
    exports: [GamesService],
})
export class GamesModule { }
