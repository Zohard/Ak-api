import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
    pageCount?: number;
    categories?: string[];
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    language?: string;
    infoLink?: string;
  };
}

interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
  totalItems: number;
}

@Injectable()
export class GoogleBooksService {
  private readonly logger = new Logger(GoogleBooksService.name);
  private readonly GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Search manga releases in France by month
   * @param year Year (e.g., 2024)
   * @param month Month (1-12)
   * @param maxResults Maximum number of results (default 40)
   */
  async searchMangaByMonth(year: number, month: number, maxResults = 40) {
    try {
      // Format dates for the search query
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Google Books query:
      // - subject:manga = manga category
      // - intitle:"Tome 1" OR intitle:"Vol. 1" OR intitle:"Volume 1" = first volume
      // - inpublisher:france = French publishers (may not work perfectly)
      const query = `subject:manga (intitle:"Tome 1" OR intitle:"Vol 1" OR intitle:"Volume 1" OR intitle:"T01" OR intitle:"Vol.1")`;

      const params = {
        q: query,
        langRestrict: 'fr', // French language
        printType: 'books',
        orderBy: 'newest',
        maxResults: Math.min(maxResults, 40), // Google Books API limit
        // Filter by publish date range (not always accurate)
        // Using a broader search since date filtering is not perfect
      };

      this.logger.log(`Searching Google Books for manga: ${year}-${month}`);

      const response = await firstValueFrom(
        this.httpService.get<GoogleBooksResponse>(this.GOOGLE_BOOKS_API_URL, { params }),
      );

      const items = response.data.items || [];

      // Filter and transform results
      const mangas = items
        .map((item) => this.transformGoogleBooksItem(item))
        .filter((manga) => {
          // Additional filtering to ensure it's a manga and has valid data
          if (!manga.title) return false;

          // Check if published date is in the requested month
          if (manga.publishedDate) {
            const pubDate = new Date(manga.publishedDate);
            const pubYear = pubDate.getFullYear();
            const pubMonth = pubDate.getMonth() + 1;

            // Only include if it matches the requested month/year
            if (pubYear !== year || pubMonth !== month) {
              return false;
            }
          }

          return true;
        });

      this.logger.log(`Found ${mangas.length} mangas for ${year}-${month}`);

      return {
        mangas,
        totalItems: response.data.totalItems,
        query,
      };
    } catch (error) {
      this.logger.error(`Error searching Google Books: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Transform Google Books item to our manga format
   */
  private transformGoogleBooksItem(item: GoogleBooksVolume) {
    const { volumeInfo } = item;

    // Extract ISBN-13 and ISBN-10
    const isbn13 = volumeInfo.industryIdentifiers?.find((id) => id.type === 'ISBN_13')?.identifier;
    const isbn10 = volumeInfo.industryIdentifiers?.find((id) => id.type === 'ISBN_10')?.identifier;

    return {
      googleBooksId: item.id,
      title: volumeInfo.title,
      subtitle: volumeInfo.subtitle,
      authors: volumeInfo.authors || [],
      publisher: volumeInfo.publisher,
      publishedDate: volumeInfo.publishedDate,
      description: volumeInfo.description,
      isbn13,
      isbn10,
      pageCount: volumeInfo.pageCount,
      categories: volumeInfo.categories || [],
      imageUrl: volumeInfo.imageLinks?.thumbnail?.replace('http://', 'https://'),
      language: volumeInfo.language,
      infoLink: volumeInfo.infoLink,
    };
  }

  /**
   * Get volume details by ISBN
   */
  async getByISBN(isbn: string) {
    try {
      const params = {
        q: `isbn:${isbn}`,
      };

      const response = await firstValueFrom(
        this.httpService.get<GoogleBooksResponse>(this.GOOGLE_BOOKS_API_URL, { params }),
      );

      const items = response.data.items || [];
      if (items.length === 0) {
        return null;
      }

      return this.transformGoogleBooksItem(items[0]);
    } catch (error) {
      this.logger.error(`Error fetching ISBN ${isbn}: ${error.message}`);
      return null;
    }
  }
}
