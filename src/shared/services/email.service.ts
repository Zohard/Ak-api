import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { parseBBCode } from '../utils/bbcode.util';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    this.fromEmail = this.configService.get<string>('FROM_EMAIL') || `Anime-Kun <${smtpUser}>`;

    if (!smtpUser || !smtpPass) {
      console.warn('⚠️ SMTP_USER/SMTP_PASS not configured - email sending disabled');
      return;
    }

    const smtpHost = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = parseInt(this.configService.get<string>('SMTP_PORT') || '465', 10);
    console.log(`📧 EmailService: host=${smtpHost} port=${smtpPort} user=${smtpUser} from=${this.fromEmail}`);

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  private ensureTransporter() {
    if (!this.transporter) {
      throw new Error('Email service not configured (SMTP_USER/SMTP_PASS missing)');
    }
    return this.transporter;
  }

  async sendEmailVerification(email: string, username: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${verificationToken}`;

    try {
      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: email,
        subject: 'Confirmez votre adresse email - Anime-Kun',
        html: this.getEmailVerificationTemplate(username, verificationUrl),
      });
    } catch (error) {
      console.error('❌ Error sending verification email to', email, ':', error);
      throw error;
    }
  }

  async sendForgotPasswordEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;

    try {
      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: email,
        subject: 'Réinitialisation de votre mot de passe - Anime-Kun',
        html: this.getForgotPasswordTemplate(resetUrl),
      });
    } catch (error) {
      console.error('❌ Error sending password reset email to', email, ':', error);
      throw error;
    }
  }

  async sendRawEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    try {
      const result = await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to,
        subject,
        html,
        text,
      });
      console.log(`✅ sendRawEmail OK to=${to} subject="${subject}" messageId=${result.messageId}`);
    } catch (error) {
      console.error(`❌ sendRawEmail FAILED to=${to} subject="${subject}":`, error.message);
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

    try {
      const parsedMessage = parseBBCode(messagePreview);

      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: recipientEmail,
        subject: `Nouveau message privé de ${senderName} - Anime-Kun`,
        html: this.getPrivateMessageTemplate(recipientUsername, senderName, subject, parsedMessage, messagesUrl),
      });
    } catch (error) {
      console.error('❌ Error sending PM notification email to', recipientEmail, ':', error);
      // Don't throw - we don't want to fail the PM send if email fails
    }
  }

  async sendContactEmail(name: string, email: string, message: string): Promise<void> {
    const contactEmail = this.configService.get<string>('CONTACT_EMAIL') || 'contact@anime-kun.fr';

    try {
      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: contactEmail,
        replyTo: email,
        subject: `Nouveau message de contact de ${name} - Anime-Kun`,
        html: this.getContactEmailTemplate(name, email, message),
      });
    } catch (error) {
      console.error('❌ Error sending contact email:', error);
      throw error;
    }
  }

  async sendContactReply(
    name: string,
    email: string,
    originalMessage: string,
    response: string,
  ): Promise<void> {
    try {
      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: email,
        subject: `Réponse à votre message - Anime-Kun`,
        html: this.getContactReplyTemplate(name, originalMessage, response),
      });

      console.log('✅ Contact reply sent to', email);
    } catch (error) {
      console.error('❌ Error sending contact reply:', error);
      throw error;
    }
  }

  async sendReviewRejectionEmail(
    recipientEmail: string,
    recipientUsername: string,
    reviewTitle: string,
    reason: string,
    contentTitle: string,
  ): Promise<void> {
    const reviewsUrl = `${this.configService.get('FRONTEND_URL')}/reviews/my-reviews`;

    try {
      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: recipientEmail,
        subject: `Votre critique a été rejetée - Anime-Kun`,
        html: this.getReviewRejectionTemplate(recipientUsername, reviewTitle, reason, contentTitle, reviewsUrl),
      });
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

  async sendImportSummaryEmail(
    recipientEmail: string,
    username: string,
    summary: {
      imported: number;
      failed: number;
      notFound: number;
      total: number;
      failedItems?: Array<{ title: string; reason?: string }>;
    }
  ): Promise<void> {
    const profileUrl = `${this.configService.get('FRONTEND_URL')}/profile`;

    try {
      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: recipientEmail,
        subject: 'Import MAL terminé - Anime-Kun',
        html: this.getImportSummaryTemplate(username, summary, profileUrl),
      });
    } catch (error) {
      console.error('Error sending import summary email to', recipientEmail, ':', error);
      throw error;
    }
  }

  async sendImportFailureEmail(
    recipientEmail: string,
    username: string,
    errorMessage: string
  ): Promise<void> {
    const profileUrl = `${this.configService.get('FRONTEND_URL')}/profile/import`;

    try {
      await this.ensureTransporter().sendMail({
        from: this.fromEmail,
        to: recipientEmail,
        subject: 'Erreur lors de l\'import MAL - Anime-Kun',
        html: this.getImportFailureTemplate(username, errorMessage, profileUrl),
      });
    } catch (error) {
      console.error('Error sending import failure email to', recipientEmail, ':', error);
      throw error;
    }
  }

  private getImportSummaryTemplate(
    username: string,
    summary: {
      imported: number;
      failed: number;
      notFound: number;
      total: number;
      failedItems?: Array<{ title: string; reason?: string }>;
    },
    profileUrl: string
  ): string {
    const successRate = summary.total > 0 ? Math.round((summary.imported / summary.total) * 100) : 0;
    const failedItems = summary.failedItems || [];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Import MAL terminé</title>
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
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin: 20px 0;
          }
          .stat-box {
            background-color: white;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .stat-number {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .stat-label {
            font-size: 14px;
            color: #6b7280;
          }
          .success { color: #10b981; }
          .warning { color: #f59e0b; }
          .error { color: #ef4444; }
          .neutral { color: #6b7280; }
          .progress-bar {
            background-color: #e5e7eb;
            border-radius: 10px;
            height: 20px;
            overflow: hidden;
            margin: 15px 0;
          }
          .progress-fill {
            background: linear-gradient(90deg, #10b981, #34d399);
            height: 100%;
            border-radius: 10px;
            transition: width 0.3s ease;
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
          <h1>Import terminé</h1>
          <h2>Anime-Kun</h2>
        </div>
        <div class="content">
          <p>Bonjour <strong>${username}</strong>,</p>

          <p>Votre import MyAnimeList est terminé ! Voici le résumé :</p>

          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-number success">${summary.imported}</div>
              <div class="stat-label">Importés avec succès</div>
            </div>
            <div class="stat-box">
              <div class="stat-number neutral">${summary.total}</div>
              <div class="stat-label">Total traités</div>
            </div>
            <div class="stat-box">
              <div class="stat-number warning">${summary.notFound}</div>
              <div class="stat-label">Non trouvés</div>
            </div>
            <div class="stat-box">
              <div class="stat-number error">${summary.failed}</div>
              <div class="stat-label">Échecs</div>
            </div>
          </div>

          <p><strong>Taux de réussite :</strong> ${successRate}%</p>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${successRate}%"></div>
          </div>

          ${failedItems.length > 0 ? `
          <div style="margin-top: 20px; padding: 15px; background-color: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #991b1b;">
              Titres non importés (${failedItems.length}) :
            </p>
            <ul style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 14px;">
              ${failedItems.slice(0, 20).map(item => `
                <li style="margin-bottom: 4px;">${item.title}${item.reason ? ` <span style="color: #9ca3af;">(${item.reason})</span>` : ''}</li>
              `).join('')}
              ${failedItems.length > 20 ? `<li style="color: #6b7280; font-style: italic;">... et ${failedItems.length - 20} autres</li>` : ''}
            </ul>
          </div>
          ` : ''}

          ${summary.notFound > 0 ? `
          <p style="color: #6b7280; font-size: 14px; margin-top: 15px;">
            <strong>Note :</strong> Les entrées "non trouvées" correspondent à des animes/mangas
            qui ne sont pas encore dans notre base de données. Ces titres seront peut-être
            ajoutés ultérieurement.
          </p>
          ` : ''}

          <div style="text-align: center;">
            <a href="${profileUrl}" class="button">Voir ma collection</a>
          </div>

          <div class="footer">
            <p>Merci d'utiliser Anime-Kun pour gérer votre collection !</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            <p><strong>L'équipe Anime-Kun</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getImportFailureTemplate(
    username: string,
    errorMessage: string,
    profileUrl: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Erreur lors de l'import MAL</title>
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
          .error-box {
            background-color: #fef2f2;
            border: 2px solid #dc2626;
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
          <h1>Erreur lors de l'import</h1>
          <h2>Anime-Kun</h2>
        </div>
        <div class="content">
          <p>Bonjour <strong>${username}</strong>,</p>

          <p>Une erreur s'est produite lors de votre import MyAnimeList.</p>

          <div class="error-box">
            <strong>Détail de l'erreur :</strong>
            <p style="margin: 10px 0 0 0; color: #1f2937;">${errorMessage}</p>
          </div>

          <p>Vous pouvez réessayer l'import depuis votre profil. Si le problème persiste,
          n'hésitez pas à nous contacter.</p>

          <div style="text-align: center;">
            <a href="${profileUrl}" class="button">Réessayer l'import</a>
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

  private getContactEmailTemplate(name: string, email: string, message: string): string {
    const escapedName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedEmail = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Nouveau message de contact</title>
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
          .sender-info {
            background-color: #dbeafe;
            border: 1px solid #3b82f6;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
          }
          .message-box {
            background-color: white;
            border-left: 4px solid #2563eb;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
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
          <h2>Nouveau message de contact</h2>
        </div>
        <div class="content">
          <p>Un nouveau message a été envoyé via le formulaire de contact.</p>

          <div class="sender-info">
            <strong>👤 Nom :</strong> ${escapedName}<br>
            <strong>📧 Email :</strong> <a href="mailto:${escapedEmail}">${escapedEmail}</a>
          </div>

          <div class="message-box">
            <strong>📝 Message :</strong>
            <p style="margin: 10px 0 0 0; color: #1f2937;">${escapedMessage}</p>
          </div>

          <p style="color: #6b7280; font-size: 14px;">Vous pouvez répondre directement à cet email pour contacter l'expéditeur.</p>

          <div class="footer">
            <p>Ce message a été envoyé depuis le formulaire de contact d'Anime-Kun.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getContactReplyTemplate(
    name: string,
    originalMessage: string,
    response: string,
  ): string {
    const escapedName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedOriginalMessage = originalMessage
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    const escapedResponse = response
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Réponse à votre message - Anime-Kun</title>
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
          .response-box {
            background-color: white;
            border-left: 4px solid #10b981;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          .original-message-box {
            background-color: #f3f4f6;
            border-left: 4px solid #6b7280;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 14px;
            color: #6b7280;
          }
          h3 {
            color: #1f2937;
            margin-top: 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎌 Anime-Kun</h1>
          <h2>Réponse à votre message</h2>
        </div>
        <div class="content">
          <p>Bonjour ${escapedName},</p>
          <p>Merci de nous avoir contactés. Voici notre réponse à votre message :</p>

          <div class="response-box">
            <h3>💬 Notre réponse :</h3>
            <p style="margin: 10px 0 0 0; color: #1f2937;">${escapedResponse}</p>
          </div>

          <div class="original-message-box">
            <h3 style="font-size: 14px; color: #6b7280;">📩 Votre message original :</h3>
            <p style="margin: 10px 0 0 0; color: #4b5563;">${escapedOriginalMessage}</p>
          </div>

          <p>Si vous avez d'autres questions, n'hésitez pas à nous contacter à nouveau.</p>

          <div class="footer">
            <p><strong>Cordialement,</strong><br>L'équipe Anime-Kun</p>
            <p>Pour nous contacter : <a href="https://www.anime-kun.net/contact">https://www.anime-kun.net/contact</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}