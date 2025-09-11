import { Injectable } from '@nestjs/common';
import ImageKit from 'imagekit';

@Injectable()
export class ImageKitService {
  private imagekit: ImageKit;

  constructor() {
    this.imagekit = new ImageKit({
      publicKey: 'public_pjoQrRTPxVOD7iy9kWQVSXWcXCU=',
      privateKey: 'private_pNuDmT4Q+ifvjfiUmu5NYY+aM30=',
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

  getImageUrl(path: string, transformations: any[] = []) {
    const url = this.imagekit.url({
      path: path,
      transformation: transformations
    });
    return url;
  }
}