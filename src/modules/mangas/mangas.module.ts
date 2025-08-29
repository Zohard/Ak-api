import { Module } from '@nestjs/common';
import { MangasService } from './mangas.service';
import { MangasController } from './mangas.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [MangasController],
  providers: [MangasService, PrismaService],
  exports: [MangasService],
})
export class MangasModule {}
