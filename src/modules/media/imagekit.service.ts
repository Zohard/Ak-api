import { Injectable } from '@nestjs/common';
import ImageKit from 'imagekit';

@Injectable()
export class ImageKitService {
  private imagekit: ImageKit;

  constructor() {
    this.imagekit = new ImageKit({
      publicKey: 'public_pjoQrRTPxVOD7iy9kWQVSXWcXCU=',
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
      urlEndpoint: 'https://ik.imagekit.io/akimages',
    });
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

  async uploadImage(file: any, fileName: string, folder: string = ''): Promise<any> {
    try {
      const result = await this.imagekit.upload({
        file: file,
        fileName: fileName,
        folder: folder,
        useUniqueFileName: true,
        transformation: {
          pre: 'l-text,i-Watermark,fs-50,l-end',
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
      // Use advanced search to fetch file by name and folder path
      const files = await this.imagekit.listFiles({
        searchQuery: `name = \"${parsed.name}\" AND folderPath = \"${parsed.folderPath}\"`,
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

      // Fetch the image from the URL using fetch with AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AK-Scraper/1.0)',
          'Accept': 'image/*',
          'Referer': new URL(imageUrl).origin
        },
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

      // Upload to ImageKit
      const result = await this.imagekit.upload({
        file: buffer,
        fileName: fullFileName,
        folder: folder,
        useUniqueFileName: true,
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
