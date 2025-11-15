import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { OpenLibraryService } from './openlibrary.service';
import { BookResponseDto, BatchIsbnResponseDto } from './dto/book-response.dto';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly openLibraryService: OpenLibraryService) {}

  @Get('isbn/:isbn')
  @ApiOperation({
    summary: 'Get book details by ISBN',
    description: 'Fetch book information from OpenLibrary using ISBN-10 or ISBN-13',
  })
  @ApiParam({
    name: 'isbn',
    description: 'ISBN-10 or ISBN-13 (with or without hyphens)',
    example: '9782756098593',
  })
  @ApiResponse({
    status: 200,
    description: 'Book details found',
    type: BookResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Book not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid ISBN format',
  })
  async getBookByIsbn(@Param('isbn') isbn: string): Promise<BookResponseDto> {
    return await this.openLibraryService.getBookByIsbn(isbn);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search book by ISBN (query parameter)',
    description: 'Alternative endpoint using query parameter instead of path parameter',
  })
  @ApiQuery({
    name: 'isbn',
    description: 'ISBN-10 or ISBN-13',
    example: '9782756098593',
  })
  @ApiResponse({
    status: 200,
    description: 'Book details found',
    type: BookResponseDto,
  })
  async searchByIsbn(@Query('isbn') isbn: string): Promise<BookResponseDto> {
    if (!isbn) {
      throw new BadRequestException('ISBN query parameter is required');
    }
    return await this.openLibraryService.getBookByIsbn(isbn);
  }

  @Get('batch')
  @ApiOperation({
    summary: 'Batch ISBN lookup',
    description: 'Search multiple ISBNs at once (comma-separated)',
  })
  @ApiQuery({
    name: 'isbns',
    description: 'Comma-separated list of ISBNs',
    example: '9782756098593,9781421536255,9782723492812',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch lookup results',
    type: BatchIsbnResponseDto,
  })
  async batchIsbnLookup(@Query('isbns') isbns: string): Promise<BatchIsbnResponseDto> {
    if (!isbns) {
      throw new BadRequestException('ISBNs query parameter is required');
    }

    const isbnArray = isbns.split(',').map(isbn => isbn.trim()).filter(isbn => isbn.length > 0);

    if (isbnArray.length === 0) {
      throw new BadRequestException('At least one ISBN is required');
    }

    if (isbnArray.length > 20) {
      throw new BadRequestException('Maximum 20 ISBNs allowed per batch request');
    }

    return await this.openLibraryService.getBatchBooks(isbnArray);
  }

  @Get('search-title')
  @ApiOperation({
    summary: 'Search books by title',
    description: 'Search for books using title (returns multiple results)',
  })
  @ApiQuery({
    name: 'title',
    description: 'Book title to search for',
    example: 'One Piece',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of results',
    required: false,
    example: 5,
  })
  @ApiResponse({
    status: 200,
    description: 'Search results',
  })
  async searchByTitle(
    @Query('title') title: string,
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    if (!title) {
      throw new BadRequestException('Title query parameter is required');
    }

    const parsedLimit = limit ? parseInt(limit) : 5;

    if (parsedLimit > 50) {
      throw new BadRequestException('Maximum limit is 50');
    }

    return await this.openLibraryService.searchBooksByTitle(title, parsedLimit);
  }
}
