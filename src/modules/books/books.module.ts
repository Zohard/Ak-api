import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BooksController } from './books.controller';
import { OpenLibraryService } from './openlibrary.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [BooksController],
  providers: [OpenLibraryService],
  exports: [OpenLibraryService],
})
export class BooksModule {}
