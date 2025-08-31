import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Anime-Kun API')
    .setDescription(
      "API REST pour la base de données d'animes et mangas avec NestJS et PostgreSQL",
    )
    .setVersion('3.0.0')
    .setContact(
      'Anime-Kun Team',
      'https://anime-kun.com',
      'contact@anime-kun.com',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(
      `http://localhost:${process.env.PORT || 3003}`,
      'Development server',
    )
    .addServer('http://localhost:3001', 'Docker Legacy API (port 3001)')
    .addServer('http://localhost:3003', 'Docker NestJS API (port 3003)')
    .addServer('https://api.anime-kun.com', 'Production server')
    .addBearerAuth()
    .addTag('Authentication', "Endpoints d'authentification")
    .addTag('Users', 'Gestion des utilisateurs')
    .addTag('Animes', 'Gestion des animes')
    .addTag('Mangas', 'Gestion des mangas')
    .addTag('Reviews', 'Gestion des critiques')
    .addTag('Admin', 'Administration')
    .addTag('Business', 'Studios et entreprises')
    .addTag('Search', 'Recherche avancée et recommandations')
    .addTag('Media', 'Gestion des médias et images')
    .addTag('Notifications', 'Système de notifications')
    .addTag('General', 'Endpoints généraux')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Anime-Kun API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
    },
    customfavIcon: '/favicon.ico',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
    ],
    customCssUrl: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    ],
  });
}
