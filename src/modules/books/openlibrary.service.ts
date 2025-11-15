import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import { BookResponseDto, OpenLibraryWorkDto, BatchIsbnResponseDto } from './dto/book-response.dto';

@Injectable()
export class OpenLibraryService {
  private readonly logger = new Logger(OpenLibraryService.name);
  private readonly baseUrl = 'https://openlibrary.org';
  private readonly accessKey: string;
  private readonly secret: string;
  private readonly requestTimeout = 5000; // 5 seconds

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.accessKey = this.configService.get<string>('OPENLIBRARY_ACCESS_KEY') || '';
    this.secret = this.configService.get<string>('OPENLIBRARY_SECRET') || '';
  }

  /**
   * Validate ISBN format (10 or 13 digits)
   */
  private validateIsbn(isbn: string): boolean {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    return /^(\d{10}|\d{13})$/.test(cleanIsbn);
  }

  /**
   * Clean and normalize ISBN
   */
  private cleanIsbn(isbn: string): string {
    return isbn.replace(/[-\s]/g, '');
  }

  /**
   * Fetch book details by ISBN from OpenLibrary
   */
  async getBookByIsbn(isbn: string): Promise<BookResponseDto> {
    const cleanedIsbn = this.cleanIsbn(isbn);

    if (!this.validateIsbn(cleanedIsbn)) {
      throw new BadRequestException(`Invalid ISBN format: ${isbn}`);
    }

    this.logger.log(`Fetching book details for ISBN: ${cleanedIsbn}`);

    try {
      // Fetch book data from OpenLibrary
      const bookData = await this.fetchOpenLibraryBook(cleanedIsbn);

      if (!bookData) {
        throw new NotFoundException(`Book not found for ISBN: ${cleanedIsbn}`);
      }

      // Fetch additional work details if available
      let workDetails: OpenLibraryWorkDto | null = null;
      if (bookData.works && bookData.works.length > 0) {
        const workKey = bookData.works[0].key;
        workDetails = await this.fetchWorkDetails(workKey);
      }

      // Build response
      return this.buildBookResponse(cleanedIsbn, bookData, workDetails);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error fetching book for ISBN ${cleanedIsbn}:`, error.message);
      throw new NotFoundException(`Unable to fetch book details for ISBN: ${cleanedIsbn}`);
    }
  }

  /**
   * Batch ISBN lookup
   */
  async getBatchBooks(isbns: string[]): Promise<BatchIsbnResponseDto> {
    this.logger.log(`Batch fetching ${isbns.length} books`);

    const results = await Promise.allSettled(
      isbns.map(isbn => this.getBookByIsbn(isbn))
    );

    const books: BookResponseDto[] = [];
    const notFoundIsbns: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        books.push(result.value);
      } else {
        notFoundIsbns.push(isbns[index]);
      }
    });

    return {
      books,
      total: isbns.length,
      found: books.length,
      notFound: notFoundIsbns.length,
      notFoundIsbns,
    };
  }

  /**
   * Fetch book data from OpenLibrary API
   */
  private async fetchOpenLibraryBook(isbn: string): Promise<any> {
    const url = `${this.baseUrl}/isbn/${isbn}.json`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: this.getAuthHeaders(),
        }).pipe(timeout(this.requestTimeout))
      );

      return (response as any).data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch work details for additional metadata
   */
  private async fetchWorkDetails(workKey: string): Promise<OpenLibraryWorkDto | null> {
    const url = `${this.baseUrl}${workKey}.json`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: this.getAuthHeaders(),
        }).pipe(timeout(this.requestTimeout))
      );

      return (response as any).data;
    } catch (error) {
      this.logger.warn(`Failed to fetch work details for ${workKey}`);
      return null;
    }
  }

  /**
   * Build standardized book response
   */
  private buildBookResponse(
    isbn: string,
    bookData: any,
    workDetails: OpenLibraryWorkDto | null,
  ): BookResponseDto {
    const response: BookResponseDto = {
      isbn,
      title: bookData.title || 'Unknown Title',
      authors: this.extractAuthors(bookData, workDetails),
      publishDate: bookData.publish_date || workDetails?.firstPublishDate,
      publisher: this.extractPublisher(bookData),
      numberOfPages: bookData.number_of_pages,
      coverUrl: this.buildCoverUrl(isbn),
      description: this.extractDescription(bookData, workDetails),
      subjects: this.extractSubjects(bookData, workDetails),
      openLibraryUrl: workDetails ? `${this.baseUrl}${workDetails.key}` : undefined,
      language: this.extractLanguage(bookData),
    };

    return response;
  }

  /**
   * Extract authors from book data or work details
   */
  private extractAuthors(bookData: any, workDetails: OpenLibraryWorkDto | null): string[] {
    const authors: string[] = [];

    // Try to get authors from book data
    if (bookData.authors && Array.isArray(bookData.authors)) {
      // Authors might be references, we'd need to fetch them
      // For now, just use the keys
      authors.push(...bookData.authors.map((a: any) => a.key || 'Unknown'));
    }

    // Try work details
    if (workDetails?.authors && authors.length === 0) {
      authors.push(...workDetails.authors);
    }

    return authors.length > 0 ? authors : ['Unknown Author'];
  }

  /**
   * Extract publisher (first one if multiple)
   */
  private extractPublisher(bookData: any): string | undefined {
    if (bookData.publishers && Array.isArray(bookData.publishers) && bookData.publishers.length > 0) {
      return bookData.publishers[0];
    }
    return undefined;
  }

  /**
   * Build cover image URL
   */
  private buildCoverUrl(isbn: string): string {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  }

  /**
   * Extract description from book or work data
   */
  private extractDescription(bookData: any, workDetails: OpenLibraryWorkDto | null): string | undefined {
    // Check work details first (usually has better description)
    if (workDetails?.description) {
      if (typeof workDetails.description === 'string') {
        return workDetails.description;
      }
      // Handle object format with 'value' property
      if (typeof workDetails.description === 'object' && 'value' in workDetails.description) {
        return workDetails.description.value;
      }
    }

    // Fallback to book data
    if (bookData.description) {
      if (typeof bookData.description === 'string') {
        return bookData.description;
      }
      if (typeof bookData.description === 'object' && bookData.description.value) {
        return bookData.description.value;
      }
    }

    return undefined;
  }

  /**
   * Extract subjects/genres
   */
  private extractSubjects(bookData: any, workDetails: OpenLibraryWorkDto | null): string[] | undefined {
    const subjects: string[] = [];

    if (bookData.subjects && Array.isArray(bookData.subjects)) {
      subjects.push(...bookData.subjects);
    }

    if (workDetails?.subjects && subjects.length < 5) {
      subjects.push(...workDetails.subjects.slice(0, 5 - subjects.length));
    }

    return subjects.length > 0 ? subjects : undefined;
  }

  /**
   * Extract language code
   */
  private extractLanguage(bookData: any): string | undefined {
    if (bookData.languages && Array.isArray(bookData.languages) && bookData.languages.length > 0) {
      const langKey = bookData.languages[0].key || '';
      // Extract language code from key like "/languages/fre"
      return langKey.split('/').pop();
    }
    return undefined;
  }

  /**
   * Get authentication headers for OpenLibrary API
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'AnimeKun/1.0 (https://anime-kun.com; contact@anime-kun.com)',
    };

    // Add authentication if credentials are provided
    if (this.accessKey && this.secret) {
      // OpenLibrary uses OAuth 1.0, but for basic API access, we can use the access key
      headers['Authorization'] = `Bearer ${this.accessKey}`;
    }

    return headers;
  }

  /**
   * Search books by title (bonus feature)
   */
  async searchBooksByTitle(title: string, limit: number = 5): Promise<any[]> {
    const url = `${this.baseUrl}/search.json`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            title,
            limit,
          },
          headers: this.getAuthHeaders(),
        }).pipe(timeout(this.requestTimeout))
      );

      return response.data.docs || [];
    } catch (error) {
      this.logger.error(`Error searching books by title "${title}":`, error.message);
      return [];
    }
  }
}