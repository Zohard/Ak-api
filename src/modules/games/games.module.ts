import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { AnimesModule } from '../animes/animes.module';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
    imports: [AnimesModule],
    controllers: [GamesController],
    providers: [GamesService, PrismaService],
    exports: [GamesService],
})
export class GamesModule { }
