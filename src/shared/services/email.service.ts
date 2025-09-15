import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransporter({
      host: this.configService.get<string>('MAILTRAP_HOST'),
      port: this.configService.get<number>('MAILTRAP_PORT'),
      auth: {
        user: this.configService.get<string>('MAILTRAP_USER'),
        pass: this.configService.get<string>('MAILTRAP_PASS'),
      },
    });
  }

  async sendForgotPasswordEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: this.configService.get<string>('MAILTRAP_FROM'),
      to: email,
      subject: 'Réinitialisation de votre mot de passe - Anime-Kun',
      html: this.getForgotPasswordTemplate(resetUrl),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Password reset email sent to ${email}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  private getForgotPasswordTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Réinitialisation de mot de passe</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #2563eb;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .content {
            background-color: #f8fafc;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .button {
            display: inline-block;
            background-color: #2563eb;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
          .warning {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎌 Anime-Kun</h1>
          <h2>Réinitialisation de mot de passe</h2>
        </div>
        <div class="content">
          <p>Bonjour,</p>

          <p>Vous avez demandé la réinitialisation de votre mot de passe sur Anime-Kun. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>

          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
          </div>

          <p>Ou copiez et collez ce lien dans votre navigateur :</p>
          <p style="word-break: break-all; background-color: #e5e7eb; padding: 10px; border-radius: 4px;">
            ${resetUrl}
          </p>

          <div class="warning">
            <strong>⚠️ Important :</strong>
            <ul>
              <li>Ce lien expire dans 1 heure</li>
              <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
              <li>Ne partagez jamais ce lien avec personne</li>
            </ul>
          </div>

          <div class="footer">
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p><strong>L'équipe Anime-Kun</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}