#!/usr/bin/env node

/**
 * Database Migration Script
 * Handles migration from MySQL to PostgreSQL for Anime-Kun v3.0
 */

const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

class DatabaseMigrator {
  constructor() {
    this.prisma = new PrismaClient();
    this.mysqlConnection = null;
    this.migrationLog = [];
  }

  async connect() {
    try {
      // Connect to PostgreSQL
      await this.prisma.$connect();
      console.log('✅ Connected to PostgreSQL');

      // Connect to MySQL (source database)
      this.mysqlConnection = await mysql.createConnection({
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        charset: 'utf8mb4'
      });
      console.log('✅ Connected to MySQL source database');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
    if (this.mysqlConnection) {
      await this.mysqlConnection.end();
    }
    console.log('✅ Database connections closed');
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message };
    this.migrationLog.push(logEntry);
    
    const emoji = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  async migrateUsers() {
    this.log('Starting user migration...');
    
    try {
      const [mysqlUsers] = await this.mysqlConnection.execute(`
        SELECT 
          id_member,
          member_name,
          email_address,
          passwd,
          date_registered,
          is_activated,
          member_ip,
          posts,
          last_login
        FROM smf_members 
        WHERE is_activated = 1
        ORDER BY id_member
      `);

      let migratedCount = 0;
      let skippedCount = 0;

      for (const user of mysqlUsers) {
        try {
          // Check if user already exists
          const existingUser = await this.prisma.user.findUnique({
            where: { email: user.email_address }
          });

          if (existingUser) {
            skippedCount++;
            continue;
          }

          await this.prisma.user.create({
            data: {
              id: user.id_member,
              username: user.member_name,
              email: user.email_address,
              passwordHash: user.passwd, // Will need rehashing
              registeredAt: new Date(user.date_registered * 1000),
              isActive: user.is_activated === 1,
              lastLoginIp: user.member_ip,
              postCount: user.posts || 0,
              lastLoginAt: user.last_login ? new Date(user.last_login * 1000) : null,
            }
          });

          migratedCount++;
        } catch (error) {
          this.log(`Failed to migrate user ${user.member_name}: ${error.message}`, 'error');
        }
      }

      this.log(`User migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);
    } catch (error) {
      this.log(`User migration failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async migrateAnimes() {
    this.log('Starting anime migration...');
    
    try {
      const [mysqlAnimes] = await this.mysqlConnection.execute(`
        SELECT 
          id_anime,
          nom_anime,
          synopsis_anime,
          note_anime,
          genre_anime,
          statut_anime,
          date_debut_anime,
          date_fin_anime,
          nb_episodes,
          date_ajout
        FROM ak_anime
        ORDER BY id_anime
      `);

      let migratedCount = 0;

      for (const anime of mysqlAnimes) {
        try {
          await this.prisma.anime.create({
            data: {
              id: anime.id_anime,
              title: anime.nom_anime,
              synopsis: anime.synopsis_anime,
              rating: anime.note_anime || 0,
              genre: anime.genre_anime,
              status: anime.statut_anime,
              startDate: anime.date_debut_anime ? new Date(anime.date_debut_anime) : null,
              endDate: anime.date_fin_anime ? new Date(anime.date_fin_anime) : null,
              episodeCount: anime.nb_episodes || 0,
              createdAt: anime.date_ajout ? new Date(anime.date_ajout) : new Date(),
            }
          });

          migratedCount++;
        } catch (error) {
          this.log(`Failed to migrate anime ${anime.nom_anime}: ${error.message}`, 'error');
        }
      }

      this.log(`Anime migration completed: ${migratedCount} records migrated`);
    } catch (error) {
      this.log(`Anime migration failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async migrateMangas() {
    this.log('Starting manga migration...');
    
    try {
      const [mysqlMangas] = await this.mysqlConnection.execute(`
        SELECT 
          id_manga,
          nom_manga,
          synopsis_manga,
          note_manga,
          genre_manga,
          statut_manga,
          date_debut_manga,
          date_fin_manga,
          nb_chapitres,
          date_ajout
        FROM ak_manga
        ORDER BY id_manga
      `);

      let migratedCount = 0;

      for (const manga of mysqlMangas) {
        try {
          await this.prisma.manga.create({
            data: {
              id: manga.id_manga,
              title: manga.nom_manga,
              synopsis: manga.synopsis_manga,
              rating: manga.note_manga || 0,
              genre: manga.genre_manga,
              status: manga.statut_manga,
              startDate: manga.date_debut_manga ? new Date(manga.date_debut_manga) : null,
              endDate: manga.date_fin_manga ? new Date(manga.date_fin_manga) : null,
              chapterCount: manga.nb_chapitres || 0,
              createdAt: manga.date_ajout ? new Date(manga.date_ajout) : new Date(),
            }
          });

          migratedCount++;
        } catch (error) {
          this.log(`Failed to migrate manga ${manga.nom_manga}: ${error.message}`, 'error');
        }
      }

      this.log(`Manga migration completed: ${migratedCount} records migrated`);
    } catch (error) {
      this.log(`Manga migration failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async migrateReviews() {
    this.log('Starting review migration...');
    
    try {
      const [mysqlReviews] = await this.mysqlConnection.execute(`
        SELECT 
          id_review,
          id_membre,
          id_titre,
          type_titre,
          note_review,
          titre_review,
          contenu_review,
          date_review,
          statut_review
        FROM ak_reviews
        ORDER BY id_review
      `);

      let migratedCount = 0;

      for (const review of mysqlReviews) {
        try {
          await this.prisma.review.create({
            data: {
              id: review.id_review,
              userId: review.id_membre,
              contentId: review.id_titre,
              contentType: review.type_titre === 1 ? 'anime' : 'manga',
              rating: review.note_review,
              title: review.titre_review,
              content: review.contenu_review,
              status: review.statut_review === 1 ? 'approved' : 'pending',
              createdAt: review.date_review ? new Date(review.date_review) : new Date(),
            }
          });

          migratedCount++;
        } catch (error) {
          this.log(`Failed to migrate review ${review.id_review}: ${error.message}`, 'error');
        }
      }

      this.log(`Review migration completed: ${migratedCount} records migrated`);
    } catch (error) {
      this.log(`Review migration failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async migrateScreenshots() {
    this.log('Starting screenshot migration...');
    
    try {
      const [mysqlScreenshots] = await this.mysqlConnection.execute(`
        SELECT 
          id_screen,
          url_screen,
          id_titre,
          type,
          upload_date
        FROM ak_screenshots
        ORDER BY id_screen
      `);

      let migratedCount = 0;

      for (const screenshot of mysqlScreenshots) {
        try {
          await this.prisma.media.create({
            data: {
              id: screenshot.id_screen,
              filename: screenshot.url_screen,
              relatedId: screenshot.id_titre,
              type: screenshot.type === 1 ? 'anime' : 'manga',
              uploadDate: screenshot.upload_date ? new Date(screenshot.upload_date) : new Date(),
            }
          });

          migratedCount++;
        } catch (error) {
          this.log(`Failed to migrate screenshot ${screenshot.id_screen}: ${error.message}`, 'error');
        }
      }

      this.log(`Screenshot migration completed: ${migratedCount} records migrated`);
    } catch (error) {
      this.log(`Screenshot migration failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async generateReport() {
    const reportPath = path.join(__dirname, '..', 'migration-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      migrationLog: this.migrationLog,
      summary: {
        totalSteps: this.migrationLog.length,
        errors: this.migrationLog.filter(log => log.type === 'error').length,
        warnings: this.migrationLog.filter(log => log.type === 'warning').length,
      }
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    this.log(`Migration report saved to: ${reportPath}`);
  }

  async run() {
    const startTime = Date.now();
    this.log('🚀 Starting database migration...');

    try {
      await this.connect();

      // Run migrations in order
      await this.migrateUsers();
      await this.migrateAnimes();
      await this.migrateMangas();
      await this.migrateReviews();
      await this.migrateScreenshots();

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.log(`✅ Migration completed successfully in ${duration}s`);

    } catch (error) {
      this.log(`❌ Migration failed: ${error.message}`, 'error');
      throw error;
    } finally {
      await this.generateReport();
      await this.disconnect();
    }
  }
}

// CLI execution
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  
  migrator.run()
    .then(() => {
      console.log('🎉 Migration process completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseMigrator;