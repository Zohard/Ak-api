import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto, CreateCategoryDto, CreateNomineeDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { VoteDto } from './dto/vote.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ============ PUBLIC ENDPOINTS ============

  @Get()
  @ApiOperation({ summary: 'Liste des événements publics' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrer par statut' })
  @ApiResponse({ status: 200, description: 'Liste des événements' })
  async findAll(@Query('status') status?: string) {
    return this.eventsService.findAll(status);
  }

  @Get(':idOrSlug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Détails d\'un événement' })
  @ApiParam({ name: 'idOrSlug', description: 'ID ou slug de l\'événement' })
  @ApiResponse({ status: 200, description: 'Détails de l\'événement' })
  async findOne(@Param('idOrSlug') idOrSlug: string, @Request() req) {
    const userId = req.user?.id;
    const isAdmin = req.user?.id_rang === 6; // Check if user is admin
    return this.eventsService.findOne(idOrSlug, userId, isAdmin);
  }

  // ============ USER ENDPOINTS (authenticated) ============

  @Post('vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Voter pour un nominé' })
  @ApiResponse({ status: 201, description: 'Vote enregistré' })
  async vote(@Body() voteDto: VoteDto, @Request() req) {
    return this.eventsService.vote(voteDto, req.user.id);
  }

  @Delete('vote/:categoryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirer son vote' })
  @ApiParam({ name: 'categoryId', description: 'ID de la catégorie' })
  @ApiResponse({ status: 200, description: 'Vote retiré' })
  async removeVote(@Param('categoryId', ParseIntPipe) categoryId: number, @Request() req) {
    return this.eventsService.removeVote(categoryId, req.user.id);
  }

  @Get(':eventId/my-votes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes votes pour un événement' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Liste des votes' })
  async getMyVotes(@Param('eventId', ParseIntPipe) eventId: number, @Request() req) {
    return this.eventsService.getUserVotes(eventId, req.user.id);
  }

  // ============ ADMIN ENDPOINTS ============

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Liste de tous les événements' })
  @ApiResponse({ status: 200, description: 'Liste complète des événements' })
  async findAllAdmin() {
    return this.eventsService.findAllAdmin();
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Créer un événement' })
  @ApiResponse({ status: 201, description: 'Événement créé' })
  async create(@Body() createEventDto: CreateEventDto, @Request() req) {
    return this.eventsService.create(createEventDto, req.user.id);
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Modifier un événement' })
  @ApiParam({ name: 'id', description: 'ID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Événement modifié' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateEventDto: UpdateEventDto) {
    return this.eventsService.update(id, updateEventDto);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Supprimer un événement' })
  @ApiParam({ name: 'id', description: 'ID de l\'événement' })
  @ApiResponse({ status: 200, description: 'Événement supprimé' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.remove(id);
  }

  // Category management
  @Post('admin/:eventId/categories')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Ajouter une catégorie' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement' })
  @ApiResponse({ status: 201, description: 'Catégorie ajoutée' })
  async addCategory(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() categoryDto: CreateCategoryDto,
  ) {
    return this.eventsService.addCategory(eventId, categoryDto);
  }

  @Patch('admin/categories/:categoryId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Modifier une catégorie' })
  @ApiParam({ name: 'categoryId', description: 'ID de la catégorie' })
  @ApiResponse({ status: 200, description: 'Catégorie modifiée' })
  async updateCategory(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() categoryDto: Partial<CreateCategoryDto>,
  ) {
    return this.eventsService.updateCategory(categoryId, categoryDto);
  }

  @Delete('admin/categories/:categoryId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Supprimer une catégorie' })
  @ApiParam({ name: 'categoryId', description: 'ID de la catégorie' })
  @ApiResponse({ status: 200, description: 'Catégorie supprimée' })
  async removeCategory(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.eventsService.removeCategory(categoryId);
  }

  // Nominee management
  @Post('admin/categories/:categoryId/nominees')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Ajouter un nominé' })
  @ApiParam({ name: 'categoryId', description: 'ID de la catégorie' })
  @ApiResponse({ status: 201, description: 'Nominé ajouté' })
  async addNominee(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() nomineeDto: CreateNomineeDto,
  ) {
    return this.eventsService.addNominee(categoryId, nomineeDto);
  }

  @Delete('admin/nominees/:nomineeId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Supprimer un nominé' })
  @ApiParam({ name: 'nomineeId', description: 'ID du nominé' })
  @ApiResponse({ status: 200, description: 'Nominé supprimé' })
  async removeNominee(@Param('nomineeId', ParseIntPipe) nomineeId: number) {
    return this.eventsService.removeNominee(nomineeId);
  }

  // Cron endpoint for status updates
  @Post('admin/update-statuses')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Mettre à jour les statuts des événements' })
  @ApiResponse({ status: 200, description: 'Statuts mis à jour' })
  async updateStatuses() {
    return this.eventsService.updateEventStatuses();
  }
}
