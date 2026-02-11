export interface RelatedContentItem {
  id: number;
  type: 'anime' | 'manga' | 'game' | 'article';
  title: string;
  image: string | null;
  year: number | string | null;
  rating: number | null;
  niceUrl: string | null;
  relationType: string;
  slug?: string; // For articles
  date?: Date | string; // For articles
  excerpt?: string; // For articles
}

export interface RelationsResponse {
  anime_id?: number;
  manga_id?: number;
  relations: RelatedContentItem[];
  total: number;
}