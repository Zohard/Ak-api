import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class SourcesExternesImportDto {
  @ApiProperty({ 
    description: 'HTML content from external source page or URL to scrape',
    example: '<html>...</html>' 
  })
  @IsString()
  htmlContentOrUrl: string;

  @ApiPropertyOptional({ 
    description: 'Whether the input is a URL (true) or HTML content (false)',
    default: false 
  })
  @IsOptional()
  isUrl?: boolean = false;
}

export class SourcesExternesAnimeComparisonDto {
  @ApiProperty({ description: 'Original title from external source' })
  titre: string;

  @ApiProperty({ description: 'Alternative titles if available' })
  titresAlternatifs?: string;

  @ApiProperty({ description: 'French title if available' })
  titreFr?: string;

  @ApiProperty({ description: 'Whether anime exists in database' })
  exists: boolean;

  @ApiProperty({ description: 'Existing anime ID if found' })
  existingAnimeId?: number;

  @ApiProperty({ description: 'JSON resources data for creation' })
  ressources?: any;

  @ApiProperty({ description: 'Scraped data from combined script' })
  scrapedData?: any;
}

export class CreateAnimeFromSourcesExternesDto {
  @ApiProperty({ description: 'Title from external sources comparison' })
  @IsString()
  titre: string;

  @ApiPropertyOptional({ description: 'Original title' })
  @IsOptional()
  @IsString()
  titreOrig?: string;

  @ApiPropertyOptional({ description: 'French title' })
  @IsOptional()
  @IsString()
  titreFr?: string;

  @ApiPropertyOptional({ description: 'Alternative titles (one per line)' })
  @IsOptional()
  @IsString()
  titresAlternatifs?: string;

  @ApiProperty({ description: 'JSON resources data from scraping' })
  ressources: any;
}