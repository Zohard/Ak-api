import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

@Injectable()
export class MySqlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MySqlService.name);
  private connection: mysql.Connection | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      this.connection = await mysql.createConnection({
        host: 'db',
        user: 'animekunnet',
        password: 'animekun77',
        database: 'animekunnet',
        charset: 'utf8mb4',
        timezone: '+00:00',
      });

      this.logger.log('MySQL connection established successfully');
    } catch (error) {
      this.logger.error('Failed to connect to MySQL:', error.message);
      throw error;
    }
  }

  private async disconnect() {
    if (this.connection) {
      try {
        await this.connection.end();
        this.logger.log('MySQL connection closed');
      } catch (error) {
        this.logger.error('Error closing MySQL connection:', error.message);
      }
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.connection) {
      await this.connect();
    }

    try {
      const [rows] = await this.connection.execute(sql, params);
      return rows as T[];
    } catch (error) {
      this.logger.error('MySQL query failed:', error.message);

      // Try to reconnect if connection was lost
      if (error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNRESET') {
        this.logger.warn('Connection lost, attempting to reconnect...');
        await this.connect();

        // Retry the query once
        try {
          const [rows] = await this.connection.execute(sql, params);
          return rows as T[];
        } catch (retryError) {
          this.logger.error('Retry query failed:', retryError.message);
          throw retryError;
        }
      }

      throw error;
    }
  }

  async transaction<T>(callback: (connection: mysql.Connection) => Promise<T>): Promise<T> {
    if (!this.connection) {
      await this.connect();
    }

    await this.connection.beginTransaction();

    try {
      const result = await callback(this.connection);
      await this.connection.commit();
      return result;
    } catch (error) {
      await this.connection.rollback();
      this.logger.error('Transaction failed, rolled back:', error.message);
      throw error;
    }
  }

  async ensureConnection(): Promise<void> {
    if (!this.connection) {
      await this.connect();
    }

    try {
      await this.connection.ping();
    } catch (error) {
      this.logger.warn('Connection ping failed, reconnecting...');
      await this.connect();
    }
  }
}