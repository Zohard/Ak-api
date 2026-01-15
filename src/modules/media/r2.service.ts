import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { MediaType } from './imagekit.service';

export { MediaType };

@Injectable()
export class R2Service {
  private r2Client: S3Client;
  private bucketName: string;
  public publicUrl: string;
  private readonly logger = new Logger(R2Service.name);

  // Folder structure for different media types (same as ImageKit)
  public static readonly FOLDERS = {
    anime: 'images/animes',
    manga: 'images/mangas',
    'jeu-video': 'images/jeux-video',
    business: 'images/business',
    article: 'images/articles',
  };

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID || '';
    this.bucketName = process.env.R2_BUCKET_NAME || '';
    this.publicUrl = process.env.R2_PUBLIC_URL || 'https://pub-b37473d0af014d50941768d98a9ec79d.r2.dev/';

    this.r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * Create a safe, SEO-friendly filename from title + timestamp
   * (Same logic as ImageKit service for compatibility)
   */
  createSafeFileName(title: string, mediaType?: MediaType): string {
    if (!title || title.trim().length === 0) {
      const prefix = mediaType || 'media';
      return `${prefix}-${Date.now()}`;
    }

    const sanitizedTitle = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);

    const timestamp = Date.now();
    return `${sanitizedTitle}-${timestamp}`;
  }

  /**
   * Get the folder path for a specific media type
   */
  getFolderForMediaType(mediaType: MediaType): string {
    return R2Service.FOLDERS[mediaType] || 'images';
  }

  /**
   * Upload a file to R2
   */
  async uploadImage(
    file: Buffer | string,
    fileName: string,
    folder: string = '',
    replaceExisting: boolean = true
  ): Promise<any> {
    try {
      // If replaceExisting is true, delete existing file
      if (replaceExisting) {
        await this.deleteExistingImage(fileName, folder);
      }

      // Prepare the file key (path in bucket)
      const fileKey = folder ? `${folder}/${fileName}` : fileName;

      // Determine content type from file extension
      const ext = fileName.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
      };
      const contentType = contentTypes[ext || ''] || 'application/octet-stream';

      // Convert file to Buffer if it's a string (base64)
      let fileBuffer: Buffer;
      if (typeof file === 'string') {
        fileBuffer = Buffer.from(file, 'base64');
      } else {
        fileBuffer = file;
      }

      // Upload to R2
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: contentType,
      });

      await this.r2Client.send(command);

      // Return result in ImageKit-compatible format
      return {
        fileId: fileKey, // Use path as ID
        name: fileName,
        filePath: `/${fileKey}`,
        url: `${this.publicUrl}${fileKey}`,
        thumbnailUrl: `${this.publicUrl}${fileKey}`, // R2 doesn't have built-in transformations
        size: fileBuffer.length,
      };
    } catch (error) {
      throw new Error(`R2 upload failed: ${error.message}`);
    }
  }

  /**
   * Delete existing image if it exists
   */
  async deleteExistingImage(fileName: string, folder: string): Promise<void> {
    try {
      const fileKey = folder ? `${folder}/${fileName}` : fileName;

      this.logger.debug('[R2Service] Deleting from R2:', {
        bucket: this.bucketName,
        fileKey,
        fileName,
        folder,
      });

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const result = await this.r2Client.send(command);
      this.logger.debug(`[R2Service] Successfully deleted from R2: ${fileKey}`, result);
    } catch (error) {
      // Ignore errors if file doesn't exist
      if (error.name !== 'NoSuchKey') {
        this.logger.error(`[R2Service] Failed to delete existing image:`, {
          fileName,
          folder,
          fileKey: folder ? `${folder}/${fileName}` : fileName,
          errorName: error.name,
          errorMessage: error.message,
          bucket: this.bucketName,
        });
        throw error;
      } else {
        this.logger.warn(`[R2Service] File not found in R2 (NoSuchKey): ${folder ? `${folder}/${fileName}` : fileName}`);
      }
    }
  }

  /**
   * Delete image by file path
   */
  async deleteImage(filePath: string): Promise<any> {
    try {
      // Remove leading slash if present
      const fileKey = filePath.replace(/^\//, '');

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.r2Client.send(command);

      return { success: true };
    } catch (error) {
      throw new Error(`R2 delete failed: ${error.message}`);
    }
  }

  /**
   * Delete image by URL (extracts path from R2 URL)
   */
  async deleteImageByUrl(imageUrl: string): Promise<any> {
    try {
      if (!imageUrl || !imageUrl.trim()) {
        this.logger.warn('No image URL provided for deletion');
        return { success: false, message: 'No URL provided' };
      }

      // If it's an R2 URL, extract the path
      if (imageUrl.includes(this.publicUrl)) {
        const filePath = imageUrl.replace(this.publicUrl, '');
        return this.deleteImage(filePath);
      }

      // If it's just a path (not a full URL), delete directly
      if (!imageUrl.startsWith('http')) {
        return this.deleteImage(imageUrl);
      }

      // If it's an external URL (e.g., ImageKit), we can't delete it
      this.logger.warn('Cannot delete external URL:', imageUrl);
      return { success: false, message: 'Cannot delete external URL' };
    } catch (error) {
      this.logger.error('Error deleting image by URL:', error);
      throw new Error(`R2 delete by URL failed: ${error.message}`);
    }
  }

  /**
   * Get image URL (for compatibility with ImageKit service)
   */
  getImageUrl(path: string, transformations: any[] = []): string {
    // Remove leading slash if present
    const cleanPath = path.replace(/^\//, '');

    // R2 doesn't have built-in transformations like ImageKit
    // You could implement Cloudflare Images integration here if needed
    // For now, just return the direct URL
    return `${this.publicUrl}${cleanPath}`;
  }

  /**
   * Upload image from URL
   */
  async uploadImageFromUrl(
    imageUrl: string,
    fileName: string,
    folder: string = 'images/animes'
  ): Promise<any> {
    try {
      if (!imageUrl || !imageUrl.trim()) {
        throw new Error('Image URL is required');
      }

      this.logger.debug(`Starting image upload from URL: ${imageUrl}`);

      // Build headers
      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
      };

      // Add Referer for specific domains
      try {
        const urlObj = new URL(imageUrl);
        if (urlObj.hostname.includes('booknode.com')) {
          headers['Referer'] = 'https://booknode.com/';
        } else if (urlObj.hostname.includes('babelio.com')) {
          headers['Referer'] = 'https://www.babelio.com/';
        } else if (urlObj.hostname.includes('fnac.com')) {
          headers['Referer'] = 'https://www.fnac.com/';
        } else {
          headers['Referer'] = urlObj.origin;
        }
      } catch (e) {
        this.logger.warn('Failed to parse image URL for Referer header:', e.message);
      }

      // Fetch the image
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(imageUrl, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
        throw new Error('Image too large (>10MB)');
      }

      // Get image as buffer
      const imageBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(imageBuffer);

      if (buffer.length === 0) {
        throw new Error('No image data received');
      }

      if (buffer.length < 100) {
        throw new Error('Image data too small, likely not a valid image');
      }

      this.logger.debug(`Downloaded image: ${buffer.length} bytes`);

      // Determine file extension
      let fileExtension = '';
      const urlPath = new URL(imageUrl).pathname;
      const urlExtension = urlPath.split('.').pop()?.toLowerCase();

      if (urlExtension && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExtension)) {
        fileExtension = urlExtension;
      } else {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('jpeg') || contentType.includes('jpg')) {
          fileExtension = 'jpg';
        } else if (contentType.includes('png')) {
          fileExtension = 'png';
        } else if (contentType.includes('gif')) {
          fileExtension = 'gif';
        } else if (contentType.includes('webp')) {
          fileExtension = 'webp';
        } else {
          // Check image signature
          const signature = buffer.subarray(0, 4);
          if (signature[0] === 0xFF && signature[1] === 0xD8) {
            fileExtension = 'jpg';
          } else if (signature[0] === 0x89 && signature[1] === 0x50) {
            fileExtension = 'png';
          } else if (signature[0] === 0x47 && signature[1] === 0x49) {
            fileExtension = 'gif';
          } else {
            fileExtension = 'jpg'; // Default fallback
          }
        }
      }

      const cleanFileName = fileName.replace(/\.[^/.]+$/, '');
      const fullFileName = `${cleanFileName}.${fileExtension}`;

      this.logger.debug(`Uploading to R2: ${fullFileName} to folder: ${folder}`);

      // Upload to R2
      const result = await this.uploadImage(buffer, fullFileName, folder, true);

      this.logger.debug(`Successfully uploaded to R2: ${result.url}`);

      return {
        ...result,
        filename: result.name,
        originalUrl: imageUrl,
        size: buffer.length,
        fileExtension,
        folder,
      };
    } catch (error) {
      this.logger.error(`R2 upload from URL failed for ${imageUrl}:`, error);
      throw new Error(`R2 upload from URL failed: ${error.message}`);
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folder: string = '', limit: number = 1000): Promise<any[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: folder,
        MaxKeys: limit,
      });

      const response = await this.r2Client.send(command);

      return (response.Contents || []).map((item) => ({
        fileId: item.Key,
        name: item.Key?.split('/').pop() || '',
        filePath: `/${item.Key}`,
        url: `${this.publicUrl}${item.Key}`,
        size: item.Size,
        lastModified: item.LastModified,
      }));
    } catch (error) {
      this.logger.error('Error listing R2 files:', error);
      return [];
    }
  }
}
