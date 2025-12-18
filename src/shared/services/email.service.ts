import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const port = parseInt(this.configService.get<string>('MAILTRAP_PORT') || '587', 10);
    const smtpConfig: nodemailer.TransportOptions = {
      host: this.configService.get<string>('MAILTRAP_HOST'),
      port: port,
      secure: port === 465, // Use SSL/TLS for port 465, STARTTLS for port 587
      auth: {
        user: this.configService.get<string>('MAILTRAP_USER'),
        pass: this.configService.get<string>('MAILTRAP_PASS'),
      },
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2', // Resend requires TLS 1.2 or higher
      },
      requireTls: true, // Fixed: changed from requireTLS to requireTls
    };

    console.log('📧 Initializing email service with Resend SMTP:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.auth.user,
      from: this.configService.get<string>('MAILTRAP_FROM'),
    });

    this.transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ SMTP connection error:', error);
      } else {
        console.log('✅ SMTP server is ready to send emails');
      }
    });
  }

  async sendEmailVerification(email: string, username: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: this.configService.get<string>('MAILTRAP_FROM'),
      to: email,
      subject: 'Confirmez votre adresse email - Anime-Kun',
      html: this.getEmailVerificationTemplate(username, verificationUrl),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Verification email sent to ${email} (Message ID: ${info.messageId})`);
    } catch (error) {
      console.error('❌ Error sending verification email to', email, ':', error);
      throw error;
    }
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
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${email} (Message ID: ${info.messageId})`);
    } catch (error) {
      console.error('❌ Error sending password reset email to', email, ':', error);
      throw error;
    }
  }

  async sendPrivateMessageNotification(
    recipientEmail: string,
    recipientUsername: string,
    senderName: string,
    subject: string,
    messagePreview: string,
  ): Promise<void> {
    const messagesUrl = `${this.configService.get('FRONTEND_URL')}/messages`;

    const mailOptions = {
      from: this.configService.get<string>('MAILTRAP_FROM'),
      to: recipientEmail,
      subject: `Nouveau message privé de ${senderName} - Anime-Kun`,
      html: this.getPrivateMessageTemplate(recipientUsername, senderName, subject, messagePreview, messagesUrl),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ PM notification email sent to ${recipientEmail} (Message ID: ${info.messageId})`);
    } catch (error) {
      console.error('❌ Error sending PM notification email to', recipientEmail, ':', error);
      // Don't throw - we don't want to fail the PM send if email fails
    }
  }

  async sendReviewRejectionEmail(
    recipientEmail: string,
    recipientUsername: string,
    reviewTitle: string,
    reason: string,
    contentTitle: string,
  ): Promise<void> {
    const reviewsUrl = `${this.configService.get('FRONTEND_URL')}/profile#critiques`;

    const mailOptions = {
      from: this.configService.get<string>('MAILTRAP_FROM'),
      to: recipientEmail,
      subject: `Votre critique a été rejetée - Anime-Kun`,
      html: this.getReviewRejectionTemplate(recipientUsername, reviewTitle, reason, contentTitle, reviewsUrl),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Review rejection email sent to ${recipientEmail} (Message ID: ${info.messageId})`);
    } catch (error) {
      console.error('❌ Error sending review rejection email to', recipientEmail, ':', error);
      // Don't throw - we don't want to fail the moderation if email fails
    }
  }

  private getEmailVerificationTemplate(username: string, verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Confirmez votre adresse email</title>
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
            color: white !important;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
          }
          .info {
            background-color: #dbeafe;
            border: 1px solid #3b82f6;
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
          <h2>Bienvenue sur Anime-Kun !</h2>
        </div>
        <div class="content">
          <p>Bonjour <strong>${username}</strong>,</p>

          <p>Merci de vous être inscrit sur Anime-Kun ! Pour compléter votre inscription et accéder à toutes les fonctionnalités de la plateforme, veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous :</p>

          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Confirmer mon adresse email</a>
          </div>

          <p>Ou copiez et collez ce lien dans votre navigateur :</p>
          <p style="word-break: break-all; background-color: #e5e7eb; padding: 10px; border-radius: 4px;">
            ${verificationUrl}
          </p>

          <div class="info">
            <strong>📌 À savoir :</strong>
            <ul>
              <li>Ce lien expire dans 24 heures</li>
              <li>Votre compte ne sera pleinement actif qu'après validation</li>
              <li>Si vous n'avez pas créé de compte, ignorez cet email</li>
            </ul>
          </div>

          <p>Une fois votre email confirmé, vous pourrez :</p>
          <ul>
            <li>✍️ Rédiger des critiques d'animes et mangas</li>
            <li>💬 Participer aux forums de discussion</li>
            <li>📚 Gérer votre collection personnelle</li>
            <li>⭐ Noter et suivre vos œuvres préférées</li>
          </ul>

          <div class="footer">
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p><strong>L'équipe Anime-Kun</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;
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
            color: white !important;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
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

  private getPrivateMessageTemplate(
    recipientUsername: string,
    senderName: string,
    subject: string,
    messagePreview: string,
    messagesUrl: string,
  ): string {
    // Truncate message preview to 200 characters
    const truncatedMessage = messagePreview.length > 200
      ? messagePreview.substring(0, 200) + '...'
      : messagePreview;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Nouveau message privé</title>
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
          .message-preview {
            background-color: white;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .sender-info {
            background-color: #ede9fe;
            border: 1px solid #c4b5fd;
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
          <h1>💌 Anime-Kun</h1>
          <h2>Nouveau message privé</h2>
        </div>
        <div class="content">
          <p>Bonjour <strong>${recipientUsername}</strong>,</p>

          <p>Vous avez reçu un nouveau message privé de <strong>${senderName}</strong> !</p>

          <div class="sender-info">
            <strong>📧 De :</strong> ${senderName}<br>
            <strong>📝 Sujet :</strong> ${subject}
          </div>

          <div class="message-preview">
            <strong>Aperçu du message :</strong>
            <p style="margin: 10px 0 0 0; color: #1f2937;">${truncatedMessage}</p>
          </div>

          <p>Pour lire et répondre à ce message, cliquez sur le bouton ci-dessous :</p>

          <div style="text-align: center;">
            <a href="${messagesUrl}" class="button">📨 Lire mon message</a>
          </div>

          <p style="text-align: center; color: #6b7280; font-size: 14px;">
            Ou copiez ce lien : <a href="${messagesUrl}">${messagesUrl}</a>
          </p>

          <div class="footer">
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p><strong>L'équipe Anime-Kun</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getReviewRejectionTemplate(
    recipientUsername: string,
    reviewTitle: string,
    reason: string,
    contentTitle: string,
    reviewsUrl: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Critique rejetée</title>
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
            background-color: #dc2626;
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
            color: white !important;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
          }
          .warning {
            background-color: #fef2f2;
            border: 2px solid #dc2626;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
          }
          .reason-box {
            background-color: #fff7ed;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            border-radius: 4px;
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
          <h2>Modération de critique</h2>
        </div>
        <div class="content">
          <p>Bonjour <strong>${recipientUsername}</strong>,</p>

          <div class="warning">
            <strong>⚠️ Votre critique a été rejetée</strong>
            <p style="margin: 10px 0 0 0;">Votre critique "${reviewTitle}" concernant "${contentTitle}" n'a pas été approuvée par notre équipe de modération.</p>
          </div>

          <div class="reason-box">
            <strong>📋 Raison du rejet :</strong>
            <p style="margin: 10px 0 0 0; color: #1f2937;">${reason}</p>
          </div>

          <p>Nous vous invitons à :</p>
          <ul>
            <li>Prendre connaissance de nos règles communautaires</li>
            <li>Modifier votre critique pour qu'elle soit conforme</li>
            <li>Soumettre une nouvelle critique respectant nos standards</li>
          </ul>

          <div style="text-align: center;">
            <a href="${reviewsUrl}" class="button">Voir mes critiques</a>
          </div>

          <p style="text-align: center; color: #6b7280; font-size: 14px;">
            Ou copiez ce lien : <a href="${reviewsUrl}">${reviewsUrl}</a>
          </p>

          <div class="footer">
            <p>Si vous avez des questions concernant cette décision, n'hésitez pas à contacter notre équipe de modération.</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p><strong>L'équipe Anime-Kun</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}