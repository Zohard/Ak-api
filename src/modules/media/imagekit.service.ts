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
}
