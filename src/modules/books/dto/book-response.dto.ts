import { ApiProperty } from '@nestjs/swagger';

export class BookResponseDto {
  @ApiProperty({ example: '9782756098593', description: 'ISBN-13 or ISBN-10' })
  isbn: string;

  @ApiProperty({ example: 'One Piece, Tome 1 : À l\'aube d\'une grande aventure' })
  title: string;

  @ApiProperty({ example: ['Eiichiro Oda'], type: [String] })
  authors: string[];

  @ApiProperty({ example: '2013', required: false })
  publishDate?: string;

  @ApiProperty({ example: 'Glénat', required: false })
  publisher?: string;

  @ApiProperty({ example: 192, required: false })
  numberOfPages?: number;

  @ApiProperty({
    example: 'https://covers.openlibrary.org/b/isbn/9782756098593-L.jpg',
    required: false
  })
  coverUrl?: string;

  @ApiProperty({
    example: 'Le manga qui raconte l\'histoire de Monkey D. Luffy...',
    required: false
  })
  description?: string;

  @ApiProperty({
    example: ['Comics & Graphic Novels', 'Manga', 'Adventure'],
    type: [String],
    required: false
  })
  subjects?: string[];

  @ApiProperty({
    example: 'https://openlibrary.org/works/OL12345W',
    required: false
  })
  openLibraryUrl?: string;

  @ApiProperty({ example: 'fre', required: false })
  language?: string;
}

export class OpenLibraryWorkDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: [String], required: false })
  authors?: string[];

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ type: [String], required: false })
  subjects?: string[];

  @ApiProperty({ required: false })
  firstPublishDate?: string;
}

export class BatchIsbnResponseDto {
  @ApiProperty({ type: [BookResponseDto] })
  books: BookResponseDto[];

  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({ example: 2 })
  found: number;

  @ApiProperty({ example: 3 })
  notFound: number;

  @ApiProperty({
    example: ['9782756098593', '9781234567890'],
    type: [String]
  })
  notFoundIsbns?: string[];
}
