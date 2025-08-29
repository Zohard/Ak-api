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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Liste des utilisateurs (avec pagination et recherche)',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs avec pagination',
  })
  async findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Créer un nouvel utilisateur (Admin seulement)' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 403, description: 'Accès refusé - Admin requis' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get('me')
  @ApiOperation({ summary: "Récupérer le profil de l'utilisateur connecté" })
  @ApiResponse({ status: 200, description: "Profil de l'utilisateur connecté" })
  async getProfile(@Request() req) {
    return this.usersService.findOne(req.user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: "Mettre à jour le profil de l'utilisateur connecté",
  })
  @ApiResponse({ status: 200, description: 'Profil mis à jour avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.update(
      req.user.id,
      updateProfileDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un utilisateur par ID' })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Données de l'utilisateur" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Mettre à jour un utilisateur (Admin ou propriétaire seulement)',
  })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Utilisateur mis à jour avec succès',
  })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProfileDto: UpdateProfileDto,
    @Request() req,
  ) {
    return this.usersService.update(
      id,
      updateProfileDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer un utilisateur (Admin ou propriétaire seulement)',
  })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 204, description: 'Utilisateur supprimé avec succès' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.usersService.remove(id, req.user.id, req.user.isAdmin);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: "Statistiques détaillées d'un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Statistiques de l'utilisateur" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserStats(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserStats(id);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: "Activité récente d'un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Activité récente de l'utilisateur" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserActivity(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getUserActivity(id, limit || 10);
  }

  @Get(':id/recommendations')
  @ApiOperation({ summary: "Recommandations personnalisées pour un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Recommandations personnalisées" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserRecommendations(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getUserRecommendations(id, limit || 12);
  }
}
