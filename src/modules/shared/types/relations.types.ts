export interface RelatedContentItem {
  id: number;
  type: 'anime' | 'manga';
  title: string;
  image: string | null;
  year: number | string | null;
  rating: number | null;
  niceUrl: string | null;
  relationType: string;
}

export interface RelationsResponse {
  anime_id?: number;
  manga_id?: number;
  relations: RelatedContentItem[];
  total: number;
}