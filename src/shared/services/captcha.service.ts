import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CaptchaService {
  private readonly recaptchaSecretKey: string | undefined;
  private readonly recaptchaVerifyUrl = 'https://www.google.com/recaptcha/api/siteverify';

  constructor(private readonly configService: ConfigService) {
    this.recaptchaSecretKey = this.configService.get<string>('RECAPTCHA_SECRET_KEY');
  }

  async verifyCaptcha(token: string, remoteIp?: string): Promise<boolean> {
    // Allow dev bypass in development
    if (token === 'dev-bypass' && process.env.NODE_ENV === 'development') {
      console.warn('Using dev-bypass for reCAPTCHA in development mode');
      return true;
    }

    if (!this.recaptchaSecretKey) {
      console.warn('reCAPTCHA secret key not configured, skipping verification');
      return true; // Skip verification if not configured (dev mode)
    }

    if (!token) {
      throw new BadRequestException('Captcha token is required');
    }

    try {
      const params = new URLSearchParams({
        secret: this.recaptchaSecretKey,
        response: token,
        ...(remoteIp && { remoteip: remoteIp }),
      });

      const response = await fetch(this.recaptchaVerifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await response.json();

      if (!data.success) {
        console.error('reCAPTCHA verification failed:', data['error-codes']);
        throw new BadRequestException('Captcha verification failed. Please try again.');
      }

      // Optional: Check score for reCAPTCHA v3 (score between 0.0 and 1.0)
      // if (data.score && data.score < 0.5) {
      //   throw new BadRequestException('Captcha verification failed. Please try again.');
      // }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error verifying captcha:', error);
      throw new BadRequestException('Failed to verify captcha');
    }
  }
}
