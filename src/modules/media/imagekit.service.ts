import { Injectable } from '@nestjs/common';
import ImageKit from 'imagekit';

export type MediaType = 'anime' | 'manga' | 'jeu-video' | 'business' | 'article';

@Injectable()
export class ImageKitService {
  private imagekit: ImageKit;

  // Folder structure for different media types
  public static readonly FOLDERS = {
    anime: 'images/animes',
    manga: 'images/mangas',
    'jeu-video': 'images/jeux-video',
    business: 'images/business',
    article: 'images/articles',
  };

  constructor() {
    this.imagekit = new ImageKit({
      publicKey: 'public_pjoQrRTPxVOD7iy9kWQVSXWcXCU=',
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
      urlEndpoint: 'https://ik.imagekit.io/akimages',
    });
  }

  /**
   * Create a safe, SEO-friendly filename from title + timestamp
   * @param title - The title of the media (e.g., anime name, manga name)
   * @param mediaType - Type of media (anime, manga, jeu-video, business, article)
   * @returns Sanitized filename without extension (extension added during upload)
   * @example
   * createSafeFileName('One Piece', 'anime') → 'one-piece-1702345678901'
   * createSafeFileName('Naruto Shippūden', 'manga') → 'naruto-shippuden-1702345678902'
   */
  createSafeFileName(title: string, mediaType?: MediaType): string {
    if (!title || title.trim().length === 0) {
      // Fallback to media type + timestamp if title is empty
      const prefix = mediaType || 'media';
      return `${prefix}-${Date.now()}`;
    }

    // 1. Sanitize title: remove special characters, lowercase, replace spaces with hyphens
    const sanitizedTitle = title
      .toLowerCase()
      .normalize('NFD') // Decompose accented characters (é → e + ´)
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (´ ` ^ etc.)
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars (keep only letters, numbers, spaces, hyphens)
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .substring(0, 50); // Limit length to 50 chars for readability

    // 2. Add timestamp for uniqueness
    const timestamp = Date.now();

    // 3. Combine them
    return `${sanitizedTitle}-${timestamp}`;
  }

  /**
   * Get the folder path for a specific media type
   * @param mediaType - Type of media
   * @returns Folder path in ImageKit
   */
  getFolderForMediaType(mediaType: MediaType): string {
    return ImageKitService.FOLDERS[mediaType] || 'images';
  }

  getAuthenticationParameters() {
    const authenticationParameters = this.imagekit.getAuthenticationParameters();
    return authenticationParameters;
  }

  getPublicConfig() {
    return {
      publicKey: 'public_pjoQrRTPxVOD7iy9kWQVSXWcXCU=',
      urlEndpoint: 'https://ik.imagekit.io/akimages',
      transformationPosition: 'path'
    };
  }

  private extractFilePathFromUrl(urlStr: string): { folderPath: string; name: string } | null {
    try {
      const u = new URL(urlStr);
      // Path could look like: /akimages/tr:.../folder/file.jpg OR /akimages/folder/file.jpg
      let pathname = u.pathname || '';
      // Strip leading /akimages/
      pathname = pathname.replace(/^\/akimages\//, '');
      // Strip leading transformation segment if present
      pathname = pathname.replace(/^tr:[^/]+\//, '');
      // Ensure no leading slash
      pathname = pathname.replace(/^\//, '');
      if (!pathname) return null;

      const lastSlash = pathname.lastIndexOf('/');
      const name = lastSlash >= 0 ? pathname.substring(lastSlash + 1) : pathname;
      const folderPathRaw = lastSlash >= 0 ? pathname.substring(0, lastSlash) : '';
      // folderPath in ImageKit search queries should start and end with '/'
      const folderPath = `/${folderPathRaw}/`;
      return { folderPath, name };
    } catch {
      return null;
    }
  }

  private async deleteExistingImage(fileName: string, folder: string): Promise<void> {
    try {
      // Search for existing file with the same name
      // Note: ImageKit's search API has changed, folderPath is no longer supported in searchQuery
      // We'll use path parameter and name filter instead
      const files = await this.imagekit.listFiles({
        searchQuery: `name = \"${fileName}\"`,
        path: folder || undefined,
        limit: 1,
      } as any);

      if (Array.isArray(files) && files.length > 0 && (files[0] as any).fileId) {
        await this.imagekit.deleteFile((files[0] as any).fileId);
        console.log(`Deleted existing image: ${fileName} from folder: ${folder}`);
      }
    } catch (error) {
      // Log the error but don't throw - we want the upload to continue even if delete fails
      console.warn(`Failed to delete existing image ${fileName}:`, error.message);
    }
  }

  async uploadImage(file: any, fileName: string, folder: string = '', replaceExisting: boolean = true): Promise<any> {
    try {
      // If replaceExisting is true, try to delete any existing image with the same name
      if (replaceExisting) {
        await this.deleteExistingImage(fileName, folder);
      }

      const result = await this.imagekit.upload({
        file: file,
        fileName: fileName,
        folder: folder,
        useUniqueFileName: !replaceExisting, // Don't use unique filename if we're replacing
        transformation: {
          post: [
            {
              type: 'transformation',
              value: 'w-300,h-300,c-maintain_ratio'
            }
          ]
        }
      });

      return result;
    } catch (error) {
      throw new Error(`ImageKit upload failed: ${error.message}`);
    }
  }

  async deleteImage(fileId: string) {
    try {
      await this.imagekit.deleteFile(fileId);
      return { success: true };
    } catch (error) {
      throw new Error(`ImageKit delete failed: ${error.message}`);
    }
  }

  async deleteImageByUrl(url: string) {
    const parsed = this.extractFilePathFromUrl(url);
    if (!parsed) {
      return { success: false, reason: 'unrecognizable_url' };
    }

    try {
      // Extract folder path without leading/trailing slashes for path parameter
      const folderPath = parsed.folderPath.replace(/^\/|\/$/g, '');

      // Use search by name only, with path parameter
      const files = await this.imagekit.listFiles({
        searchQuery: `name = \"${parsed.name}\"`,
        path: folderPath || undefined,
        limit: 1,
      } as any);

      if (Array.isArray(files) && files.length > 0 && (files[0] as any).fileId) {
        await this.imagekit.deleteFile((files[0] as any).fileId);
        return { success: true };
      }

      return { success: false, reason: 'not_found' };
    } catch (error) {
      return { success: false, reason: 'api_error', message: (error as Error).message };
    }
  }

  getImageUrl(path: string, transformations: any[] = []) {
    const url = this.imagekit.url({
      path: path,
      transformation: transformations
    });
    return url;
  }

  async uploadImageFromUrl(imageUrl: string, fileName: string, folder: string = 'images/animes'): Promise<any> {
    try {
      if (!imageUrl || !imageUrl.trim()) {
        throw new Error('Image URL is required');
      }

      console.log(`Starting image upload from URL: ${imageUrl}`);

      // Build headers based on the image URL domain
      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
      };

      // Add Referer header for CDNs that require it (like BookNode)
      try {
        const urlObj = new URL(imageUrl);
        if (urlObj.hostname.includes('booknode.com')) {
          headers['Referer'] = 'https://booknode.com/';
        } else if (urlObj.hostname.includes('babelio.com')) {
          headers['Referer'] = 'https://www.babelio.com/';
        } else if (urlObj.hostname.includes('fnac.com')) {
          headers['Referer'] = 'https://www.fnac.com/';
        } else {
          // For other URLs, use the origin as fallback
          headers['Referer'] = urlObj.origin;
        }
      } catch (e) {
        // If URL parsing fails, continue without Referer
        console.warn('Failed to parse image URL for Referer header:', e.message);
      }

      // Fetch the image from the URL using fetch with AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(imageUrl, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText} from ${imageUrl}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Image too large (>10MB)');
      }

      // Get the image as buffer
      const imageBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(imageBuffer);

      // Validate that we actually received image data
      if (buffer.length === 0) {
        throw new Error('No image data received');
      }

      if (buffer.length < 100) {
        throw new Error('Image data too small, likely not a valid image');
      }

      console.log(`Downloaded image: ${buffer.length} bytes`);

      // Extract file extension from URL or content type
      let fileExtension = '';
      const urlPath = new URL(imageUrl).pathname;
      const urlExtension = urlPath.split('.').pop()?.toLowerCase();

      if (urlExtension && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExtension)) {
        fileExtension = urlExtension;
      } else {
        // Try to get extension from content type
        const contentType = response.headers.get('content-type') || '';
        console.log(`Content type: ${contentType}`);

        if (contentType.includes('jpeg') || contentType.includes('jpg')) {
          fileExtension = 'jpg';
        } else if (contentType.includes('png')) {
          fileExtension = 'png';
        } else if (contentType.includes('gif')) {
          fileExtension = 'gif';
        } else if (contentType.includes('webp')) {
          fileExtension = 'webp';
        } else {
          // Check image signature in buffer
          const signature = buffer.subarray(0, 4);
          if (signature[0] === 0xFF && signature[1] === 0xD8) {
            fileExtension = 'jpg';
          } else if (signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4E && signature[3] === 0x47) {
            fileExtension = 'png';
          } else if (signature[0] === 0x47 && signature[1] === 0x49 && signature[2] === 0x46) {
            fileExtension = 'gif';
          } else {
            fileExtension = 'jpg'; // Default fallback
          }
        }
      }

      // Ensure filename has proper extension
      const cleanFileName = fileName.replace(/\.[^/.]+$/, ''); // Remove existing extension
      const fullFileName = `${cleanFileName}.${fileExtension}`;

      console.log(`Uploading to ImageKit: ${fullFileName} (${buffer.length} bytes) to folder: ${folder}`);

      // Delete existing image with the same name before uploading
      await this.deleteExistingImage(fullFileName, folder);

      // Upload to ImageKit
      const result = await this.imagekit.upload({
        file: buffer,
        fileName: fullFileName,
        folder: folder,
        useUniqueFileName: false, // Changed to false since we're deleting existing files
        tags: ['import', 'anime', 'scraped']
        // Note: Removing transformation watermark for now as it might cause issues during import
      });

      console.log(`Successfully uploaded to ImageKit: ${result.url}`);

      return {
        ...result,
        // Store just the filename for database storage (without full ImageKit URL)
        filename: result.name,
        originalUrl: imageUrl,
        size: buffer.length,
        fileExtension,
        folder
      };
    } catch (error) {
      console.error(`ImageKit upload from URL failed for ${imageUrl}:`, error);
      throw new Error(`ImageKit upload from URL failed: ${error.message}`);
    }
  }
}
