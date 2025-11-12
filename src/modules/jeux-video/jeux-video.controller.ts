import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JeuxVideoService } from './jeux-video.service';
import { JeuVideoQueryDto } from './dto/jeu-video-query.dto';

@ApiTags('Jeux Vidéo')
@Controller('jeux-video')
export class JeuxVideoController {
  constructor(private readonly jeuxVideoService: JeuxVideoService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des jeux vidéo avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des jeux vidéo' })
  async findAll(@Query() query: JeuVideoQueryDto) {
    return this.jeuxVideoService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un jeu vidéo par ID' })
  @ApiParam({ name: 'id', description: 'ID du jeu vidéo' })
  @ApiResponse({ status: 200, description: 'Jeu vidéo trouvé' })
  @ApiResponse({ status: 404, description: 'Jeu vidéo introuvable' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.jeuxVideoService.findOne(id);
  }
}
