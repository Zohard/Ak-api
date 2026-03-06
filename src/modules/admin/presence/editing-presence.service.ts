import { Injectable, BadRequestException } from '@nestjs/common';
import { CacheService } from '../../../shared/services/cache.service';

const VALID_TYPES = ['anime', 'manga', 'business', 'jeux-video'];
const KEY_PREFIX = 'editing_presence';
const TTL_SECONDS = 90;

export interface EditorInfo {
  userId: number;
  username: string;
  since: string;
}

@Injectable()
export class EditingPresenceService {
  constructor(private readonly cache: CacheService) {}

  private validateType(type: string): void {
    if (!VALID_TYPES.includes(type)) {
      throw new BadRequestException(`Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}`);
    }
  }

  private getKey(type: string, id: string, userId: number): string {
    return `${KEY_PREFIX}:${type}:${id}:${userId}`;
  }

  async heartbeat(type: string, id: string, userId: number, username: string): Promise<void> {
    this.validateType(type);
    const key = this.getKey(type, id, userId);

    // Preserve original "since" timestamp if key already exists
    const existing = await this.cache.get<EditorInfo>(key);
    const since = existing?.since || new Date().toISOString();

    await this.cache.set<EditorInfo>(key, { userId, username, since }, TTL_SECONDS);
  }

  async getEditors(type: string, id: string, currentUserId: number): Promise<EditorInfo[]> {
    this.validateType(type);
    const pattern = `${KEY_PREFIX}:${type}:${id}:*`;
    const keys = await this.cache.getAllKeys(pattern);

    const editors: EditorInfo[] = [];
    for (const key of keys) {
      const info = await this.cache.get<EditorInfo>(key);
      if (info && info.userId !== currentUserId) {
        editors.push(info);
      }
    }

    return editors;
  }

  async release(type: string, id: string, userId: number): Promise<void> {
    this.validateType(type);
    const key = this.getKey(type, id, userId);
    await this.cache.del(key);
  }
}
