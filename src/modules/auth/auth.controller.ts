import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token to revoke' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  @Post('register')
  @ApiOperation({ summary: "Inscription d'un nouvel utilisateur" })
  @ApiHeader({
    name: 'user-agent',
    description: 'User agent string',
    required: false,
    schema: {
      default:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    },
  })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({
    status: 400,
    description: 'Données invalides ou utilisateur existant',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.register(
      registerDto,
      ip,
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion utilisateur' })
  @ApiHeader({
    name: 'user-agent',
    description: 'User agent string',
    required: false,
    schema: {
      default:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    },
  })
  @ApiResponse({ status: 200, description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants incorrects' })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(
      loginDto,
      ip,
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rafraîchissement du token d'accès" })
  @ApiHeader({
    name: 'user-agent',
    description: 'User agent string',
    required: false,
    schema: {
      default:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    },
  })
  @ApiResponse({ status: 200, description: 'Token rafraîchi avec succès' })
  @ApiResponse({
    status: 401,
    description: 'Token de rafraîchissement invalide',
  })
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.refreshToken(
      refreshTokenDto.refreshToken,
      ip,
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    );
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demande de réinitialisation de mot de passe' })
  @ApiHeader({
    name: 'user-agent',
    description: 'User agent string',
    required: false,
    schema: {
      default:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    },
  })
  @ApiResponse({ status: 200, description: 'Email de réinitialisation envoyé' })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.forgotPassword(
      forgotPasswordDto,
      ip,
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialisation du mot de passe' })
  @ApiResponse({
    status: 200,
    description: 'Mot de passe réinitialisé avec succès',
  })
  @ApiResponse({ status: 400, description: 'Token invalide ou expiré' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérification de l\'adresse email' })
  @ApiResponse({
    status: 200,
    description: 'Email vérifié avec succès',
  })
  @ApiResponse({ status: 400, description: 'Token invalide ou expiré' })
  async verifyEmail(
    @Body('token') token: string,
    @Ip() ip: string,
  ) {
    return this.authService.verifyEmail(token, ip);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renvoyer l\'email de vérification' })
  @ApiHeader({
    name: 'user-agent',
    description: 'User agent string',
    required: false,
    schema: {
      default:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Email de vérification envoyé',
  })
  @ApiResponse({ status: 400, description: 'Email déjà vérifié ou utilisateur introuvable' })
  async resendVerification(
    @Body('email') email: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.resendVerificationEmail(
      email,
      ip,
      userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
    );
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupération du profil utilisateur authentifié' })
  @ApiResponse({ status: 200, description: 'Profil utilisateur' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  async getProfile(@Request() req) {
    return { user: req.user };
  }

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérification de la validité du token JWT' })
  @ApiResponse({ status: 200, description: 'Token valide' })
  @ApiResponse({ status: 401, description: 'Token invalide' })
  async verifyToken(@Request() req) {
    return { valid: true, user: req.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion utilisateur' })
  @ApiResponse({ status: 200, description: 'Déconnexion réussie' })
  @ApiResponse({ status: 400, description: 'Échec de la déconnexion' })
  async logout(@Body() logoutDto: LogoutDto) {
    return this.authService.logout(logoutDto.refreshToken);
  }

  // --- Google OAuth ---

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google for authentication' })
  async googleLogin() {
    // Redirects automatically via Passport Google strategy
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  async googleLoginCallback(@Request() req, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Res() res?: any) {
    const result = await this.authService.validateGoogleUser(req.user, ip, userAgent);

    // Redirect back to frontend with tokens
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`;

    if (res) {
      return res.redirect(redirectUrl);
    }
    return { redirect: redirectUrl };
  }
}
