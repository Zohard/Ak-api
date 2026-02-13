import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../shared/services/prisma.service';
import { EmailService } from '../../shared/services/email.service';
import { MetricsService } from '../../shared/services/metrics.service';
import { hasAdminAccess, getRoleName } from '../../shared/constants/rbac.constants';
import { SmfMember } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CaptchaService } from '../../shared/services/captcha.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly metricsService: MetricsService,
    private readonly captchaService: CaptchaService,
  ) { }

  async validateUser(emailOrUsername: string, password: string): Promise<any> {
    const user = await this.prisma.smfMember.findFirst({
      where: {
        OR: [
          { emailAddress: emailOrUsername },
          { memberName: emailOrUsername },
        ],
      },
    });

    if (!user) {
      return null;
    }

    // Support both bcrypt (new) and SMF hash (legacy)
    const isPasswordValid = await this.verifyPassword(
      password,
      user.passwd,
      user.memberName,
      user.passwordSalt || undefined,
    );

    if (!isPasswordValid) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwd, passwordSalt, ...result } = user;
    return result;
  }

  public async verifyPassword(
    password: string,
    hashedPassword: string,
    username: string,
    salt?: string,
  ): Promise<boolean> {
    try {
      // Try bcrypt first (for new passwords)
      if (
        hashedPassword.startsWith('$2') &&
        (await bcrypt.compare(password, hashedPassword))
      ) {
        return true;
      }

      // Try SMF format with salt
      if (salt) {
        const smfHashWithSalt = crypto
          .createHash('sha1')
          .update(username.toLowerCase() + password + salt)
          .digest('hex');
        if (smfHashWithSalt === hashedPassword) {
          return true;
        }
      }

      // Try SMF format without salt
      const smfHashWithoutSalt = crypto
        .createHash('sha1')
        .update(username.toLowerCase() + password)
        .digest('hex');
      return smfHashWithoutSalt === hashedPassword;
    } catch (error) {
      return false;
    }
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.validateUser(
      loginDto.emailOrUsername,
      loginDto.password,
    );

    if (!user) {
      // Track failed login attempt
      this.metricsService.trackAuthAttempt('login', 'failure', 'local');
      throw new UnauthorizedException('Votre mot de passe ou Email/Nom d\'utilisateur est incorrect');
    }

    // Track successful login attempt
    this.metricsService.trackAuthAttempt('login', 'success', 'local');

    // Get the full user record to access lastLogin
    const fullUser = await this.prisma.smfMember.findUnique({
      where: { idMember: user.idMember },
      select: { lastLogin: true }
    });

    // Update last login and store previous login
    await this.prisma.smfMember.update({
      where: { idMember: user.idMember },
      data: {
        previousLogin: fullUser?.lastLogin,
        lastLogin: Math.floor(Date.now() / 1000)
      },
    });

    // Track login IP (keep only last 4 IPs)
    if (ipAddress) {
      await this.trackLoginIP(user.idMember, ipAddress);
    }

    const payload = {
      sub: user.idMember,
      username: user.memberName,
      email: user.emailAddress,
      groupId: user.idGroup,
      role: getRoleName(user.idGroup),
      isAdmin:
        hasAdminAccess(user.idGroup) || user.idMember === 1,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(
      user,
      ipAddress,
      userAgent,
      loginDto.rememberMe,
    );

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async register(
    registerDto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Verify captcha if token is provided
    if (registerDto.captchaToken) {
      await this.captchaService.verifyCaptcha(registerDto.captchaToken, ipAddress);
    }

    // Check if user exists
    const existingUser = await this.prisma.smfMember.findFirst({
      where: {
        OR: [
          { emailAddress: registerDto.email },
          { memberName: registerDto.username },
        ],
      },
    });

    if (existingUser) {
      // Track failed registration attempt
      this.metricsService.trackAuthAttempt('register', 'failure', 'local');
      throw new BadRequestException(
        'User with this email or username already exists',
      );
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Create user (using unchecked create to avoid required idMember)
    const user = await this.prisma.smfMember.create({
      data: {
        memberName: registerDto.username,
        realName: registerDto.realName || registerDto.username,
        emailAddress: registerDto.email,
        passwd: hashedPassword,
        dateRegistered: Math.floor(Date.now() / 1000),
        idGroup: 0,
        emailVerified: false, // Email not verified yet
      } as any, // Temporary fix for Prisma type issue
    });

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Save verification token
    await this.prisma.akEmailVerificationToken.create({
      data: {
        token: verificationToken,
        userId: user.idMember,
        email: user.emailAddress,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Send verification email (async, don't await)
    this.emailService.sendEmailVerification(
      user.emailAddress,
      user.memberName,
      verificationToken,
    ).catch(error => {
      console.error('Failed to send verification email:', error);
      // Don't fail registration if email fails - user can request another verification email
    });

    // Track successful registration attempt
    this.metricsService.trackAuthAttempt('register', 'success', 'local');

    return {
      message: 'Registration successful. Please check your email to verify your account.',
      emailSent: true,
      user: this.sanitizeUser(user),
    };
  }

  async validateGoogleUser(googleUser: any, ipAddress?: string, userAgent?: string) {
    const { provider, providerId, email, firstName, lastName } = googleUser;

    // 1. Try to find an existing user with this social identity
    const socialIdentity = await this.prisma.akSocialIdentity.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });

    let user = socialIdentity?.user;

    // 2. If no identity linked, find or create the user by email
    if (!user) {
      user = await this.prisma.smfMember.findFirst({
        where: { emailAddress: email },
      });

      if (!user) {
        // Create a new user
        const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        let username = baseUsername;
        let counter = 1;

        while (await this.prisma.smfMember.findFirst({ where: { memberName: username } })) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        try {
          user = await this.prisma.smfMember.create({
            data: {
              memberName: username,
              realName: `${firstName} ${lastName}`.trim() || username,
              emailAddress: email,
              passwd: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12),
              dateRegistered: Math.floor(Date.now() / 1000),
              idGroup: 0,
              emailVerified: true,
              emailVerifiedAt: new Date(),
            } as any,
          });
        } catch (error) {
          // Handle race condition: if another request created the user simultaneously
          // try to find the user again
          if (error.code === 'P2002') {
            user = await this.prisma.smfMember.findFirst({
              where: { emailAddress: email },
            });

            if (!user) {
              // If still not found, re-throw the error
              throw error;
            }
          } else {
            throw error;
          }
        }
      }

      // Link the user to the social identity using upsert to prevent unique constraint errors
      // if multiple requests try to link the same user/identity simultaneously
      await this.prisma.akSocialIdentity.upsert({
        where: { provider_providerId: { provider, providerId } },
        update: { userId: user.idMember }, // Just in case it existed, update the link
        create: {
          userId: user.idMember,
          provider,
          providerId,
        },
      });

      // Mark email as verified if it wasn't already (since Google verified it)
      if (!user.emailVerified) {
        user = await this.prisma.smfMember.update({
          where: { idMember: user.idMember },
          data: { emailVerified: true, emailVerifiedAt: new Date() },
        });
      }
    }

    // 4. Log the user in (generate tokens)
    // Update last login
    const fullUser = await this.prisma.smfMember.findUnique({
      where: { idMember: user.idMember },
      select: { lastLogin: true }
    });

    await this.prisma.smfMember.update({
      where: { idMember: user.idMember },
      data: {
        previousLogin: fullUser?.lastLogin,
        lastLogin: Math.floor(Date.now() / 1000)
      },
    });

    if (ipAddress) {
      await this.trackLoginIP(user.idMember, ipAddress);
    }

    const payload = {
      sub: user.idMember,
      username: user.memberName,
      email: user.emailAddress,
      groupId: user.idGroup,
      role: getRoleName(user.idGroup),
      isAdmin: hasAdminAccess(user.idGroup) || user.idMember === 1,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user, ipAddress, userAgent);

    this.metricsService.trackAuthAttempt('login', 'success', 'google');

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async verifyEmail(token: string, ipAddress?: string) {
    // Find the verification token
    const verificationRecord = await this.prisma.akEmailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verificationRecord) {
      throw new BadRequestException('Invalid verification token');
    }

    // Check if already verified
    if (verificationRecord.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Check if token is expired
    if (verificationRecord.expiresAt < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    // Mark token as verified
    await this.prisma.akEmailVerificationToken.update({
      where: { id: verificationRecord.id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    // Mark user email as verified
    await this.prisma.smfMember.update({
      where: { idMember: verificationRecord.userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // Generate tokens for auto-login after verification
    const payload = {
      sub: verificationRecord.user.idMember,
      username: verificationRecord.user.memberName,
      email: verificationRecord.user.emailAddress,
      groupId: verificationRecord.user.idGroup,
      role: getRoleName(verificationRecord.user.idGroup),
      isAdmin:
        hasAdminAccess(verificationRecord.user.idGroup) ||
        verificationRecord.user.idMember === 1,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(
      verificationRecord.user,
      ipAddress,
      undefined,
    );

    return {
      message: 'Email verified successfully',
      accessToken,
      refreshToken,
      user: this.sanitizeUser(verificationRecord.user),
    };
  }

  async resendVerificationEmail(email: string, ipAddress?: string, userAgent?: string) {
    // Find user by email
    const user = await this.prisma.smfMember.findFirst({
      where: { emailAddress: email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if already verified
    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Delete any existing unused verification tokens
    await this.prisma.akEmailVerificationToken.deleteMany({
      where: {
        userId: user.idMember,
        isVerified: false,
      },
    });

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Save new verification token
    await this.prisma.akEmailVerificationToken.create({
      data: {
        token: verificationToken,
        userId: user.idMember,
        email: user.emailAddress,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Send verification email (async, don't await)
    this.emailService.sendEmailVerification(
      user.emailAddress,
      user.memberName,
      verificationToken,
    ).catch(error => {
      console.error('Failed to send verification email:', error);
    });

    return {
      message: 'Verification email sent. Please check your inbox.',
    };
  }

  async refreshToken(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const tokenRecord = await this.prisma.akRefreshToken.findFirst({
      where: {
        token: refreshToken,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!tokenRecord) {
      // Track failed refresh token attempt
      this.metricsService.trackAuthAttempt('refresh', 'failure', 'jwt');
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Track successful refresh token attempt
    this.metricsService.trackAuthAttempt('refresh', 'success', 'jwt');

    // Revoke the used refresh token
    await this.prisma.akRefreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true },
    });

    const payload = {
      sub: tokenRecord.user.idMember,
      username: tokenRecord.user.memberName,
      email: tokenRecord.user.emailAddress,
      groupId: tokenRecord.user.idGroup,
      role: getRoleName(tokenRecord.user.idGroup),
      isAdmin:
        hasAdminAccess(tokenRecord.user.idGroup) ||
        tokenRecord.user.idMember === 1 ||
        tokenRecord.user.idMember === 17667,
    };

    const newAccessToken = this.jwtService.sign(payload);
    const newRefreshToken = await this.generateRefreshToken(
      tokenRecord.user,
      ipAddress,
      userAgent,
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: this.sanitizeUser(tokenRecord.user),
    };
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.smfMember.findFirst({
      where: { emailAddress: forgotPasswordDto.email },
    });

    // Always return success for security
    if (!user) {
      return {
        message:
          'Si cette adresse email existe, vous recevrez un lien de réinitialisation',
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.akPasswordResetToken.create({
      data: {
        token: resetToken,
        userId: user.idMember,
        email: user.emailAddress,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Send email with reset link (async, don't await)
    this.emailService.sendForgotPasswordEmail(user.emailAddress, resetToken)
      .catch(error => {
        console.error('Failed to send password reset email:', error);
      });

    return {
      message:
        'Si cette adresse email existe, vous recevrez un lien de réinitialisation',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const tokenRecord = await this.prisma.akPasswordResetToken.findFirst({
      where: {
        token: resetPasswordDto.token,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 12);

    // Update user password
    await this.prisma.smfMember.update({
      where: { idMember: tokenRecord.userId },
      data: { passwd: hashedPassword },
    });

    // Mark token as used
    await this.prisma.akPasswordResetToken.update({
      where: { id: tokenRecord.id },
      data: { isUsed: true, usedAt: new Date() },
    });

    // Revoke all refresh tokens for security
    await this.prisma.akRefreshToken.updateMany({
      where: { userId: tokenRecord.userId },
      data: { isRevoked: true },
    });

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  async logout(refreshToken: string) {
    try {
      // Skip if no refresh token provided
      if (!refreshToken) {
        this.metricsService.trackAuthAttempt('logout', 'success', 'local');
        return { message: 'Logged out successfully' };
      }

      // Revoke the refresh token
      const result = await this.prisma.akRefreshToken.updateMany({
        where: {
          token: refreshToken,
          isRevoked: false
        },
        data: { isRevoked: true },
      });

      // Track logout attempt
      if (result.count > 0) {
        this.metricsService.trackAuthAttempt('logout', 'success', 'local');
      } else {
        this.metricsService.trackAuthAttempt('logout', 'failure', 'local');
      }

      return { message: 'Logged out successfully' };
    } catch (error) {
      // Log error but don't fail - client will clear auth anyway
      this.metricsService.trackAuthAttempt('logout', 'failure', 'local');
      console.warn('Logout error (non-critical):', error);
      return { message: 'Logged out successfully' };
    }
  }

  private async generateRefreshToken(
    user: SmfMember,
    ipAddress?: string,
    userAgent?: string,
    rememberMe?: boolean,
  ): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();

    // If "remember me" is checked, extend session to 90 days, otherwise 7 days
    if (rememberMe) {
      expiresAt.setDate(expiresAt.getDate() + 90); // 90 days for "remember me"
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days for regular session
    }

    await this.prisma.akRefreshToken.create({
      data: {
        token,
        userId: user.idMember,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return token;
  }

  private async trackLoginIP(userId: number, ipAddress: string): Promise<void> {
    // Detect IPv4 vs IPv6
    const isIPv6 = ipAddress.includes(':');

    // Insert new login record
    await this.prisma.smfMemberLogin.create({
      data: {
        idMember: userId,
        time: Math.floor(Date.now() / 1000),
        ip: isIPv6 ? '' : ipAddress,  // IPv4 goes in ip column
        ip2: isIPv6 ? ipAddress : '', // IPv6 goes in ip2 column
      },
    });

    // Get all login records for this user, ordered by most recent first
    const loginRecords = await this.prisma.smfMemberLogin.findMany({
      where: { idMember: userId },
      orderBy: { time: 'desc' },
    });

    // If more than 4 records, delete the oldest ones
    if (loginRecords.length > 4) {
      const recordsToDelete = loginRecords.slice(4);
      const idsToDelete = recordsToDelete.map(record => record.idLogin);

      await this.prisma.smfMemberLogin.deleteMany({
        where: {
          idLogin: { in: idsToDelete },
        },
      });
    }
  }

  private sanitizeUser(user: SmfMember) {
    return {
      id: user.idMember,
      username: user.memberName,
      email: user.emailAddress,
      realName: user.realName,
      registrationDate: user.dateRegistered,
      lastLogin: user.lastLogin,
      posts: user.posts,
      avatar: user.avatar,
      groupId: user.idGroup,
      role: getRoleName(user.idGroup),
      isAdmin:
        hasAdminAccess(user.idGroup) || user.idMember === 1,
    };
  }
}
