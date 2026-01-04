import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Encryption Service for securing sensitive data (e.g., private messages)
 * Uses AES-256-GCM for authenticated encryption
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 16; // 128 bits for GCM
  private readonly saltLength = 64;
  private readonly tagLength = 16;
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');

    if (!key) {
      this.logger.error('ENCRYPTION_KEY not found in environment variables!');
      throw new Error('ENCRYPTION_KEY must be set in environment variables');
    }

    // Derive a 32-byte key from the environment variable
    this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   * Returns base64-encoded string: iv:encrypted:authTag
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      return plaintext;
    }

    try {
      // Generate random IV (Initialization Vector)
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      // Encrypt the data
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Get the auth tag (for GCM mode)
      const authTag = cipher.getAuthTag();

      // Combine IV, encrypted data, and auth tag (all base64 encoded)
      const result = `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;

      this.logger.debug('Data encrypted successfully');
      return result;
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt encrypted string (format: iv:encrypted:authTag)
   * Returns original plaintext
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      return encryptedData;
    }

    try {
      // Split the encrypted data into its components
      const parts = encryptedData.split(':');

      // Handle legacy unencrypted messages (no colons in format)
      if (parts.length !== 3) {
        this.logger.warn('Attempting to decrypt data that appears to be unencrypted (legacy format)');
        return encryptedData; // Return as-is for backward compatibility
      }

      const iv = Buffer.from(parts[0], 'base64');
      const encrypted = parts[1];
      const authTag = Buffer.from(parts[2], 'base64');

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      this.logger.debug('Data decrypted successfully');
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      // For backward compatibility, if decryption fails, assume it's legacy unencrypted data
      this.logger.warn('Returning original data (possibly legacy unencrypted message)');
      return encryptedData;
    }
  }

  /**
   * Check if data appears to be encrypted (has the expected format)
   */
  isEncrypted(data: string): boolean {
    if (!data) return false;

    const parts = data.split(':');
    return parts.length === 3;
  }

  /**
   * Generate a secure random encryption key (for initial setup)
   * Run this once and store the result in your .env file
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }
}
