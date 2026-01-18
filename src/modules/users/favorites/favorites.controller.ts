import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { ReorderFavoritesDto } from './dto/reorder-favorites.dto';
// Assuming JwtAuthGuard exists in shared/guards or auth module
import { AuthGuard } from '@nestjs/passport';

@Controller('favorites')
export class FavoritesController {
    constructor(private readonly favoritesService: FavoritesService) { }

    @Get()
    @UseGuards(AuthGuard('jwt'))
    getMyFavorites(@Req() req) {
        return this.favoritesService.getFavorites(req.user.idMember);
    }

    @Get('user/:userId')
    getUserFavorites(@Param('userId', ParseIntPipe) userId: number) {
        return this.favoritesService.getFavorites(userId);
    }

    @Post()
    @UseGuards(AuthGuard('jwt'))
    addFavorite(@Req() req, @Body() dto: CreateFavoriteDto) {
        return this.favoritesService.addFavorite(req.user.idMember, dto);
    }

    @Post('reorder')
    @UseGuards(AuthGuard('jwt'))
    reorderFavorites(@Req() req, @Body() dto: ReorderFavoritesDto) {
        return this.favoritesService.reorderFavorites(req.user.idMember, dto);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'))
    removeFavorite(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.favoritesService.removeFavorite(req.user.idMember, id);
    }
}
