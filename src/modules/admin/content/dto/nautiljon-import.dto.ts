import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class NautiljonImportDto {
  @ApiProperty({ 
    description: 'HTML content from Nautiljon page or URL to scrape',
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

export class NautiljonAnimeComparisonDto {
  @ApiProperty({ description: 'Original title from Nautiljon' })
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

export class CreateAnimeFromNautiljonDto {
  @ApiProperty({ description: 'Title from Nautiljon comparison' })
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