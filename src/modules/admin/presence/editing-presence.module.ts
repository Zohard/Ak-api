import { Module } from '@nestjs/common';
import { EditingPresenceController } from './editing-presence.controller';
import { EditingPresenceService } from './editing-presence.service';
import { CacheService } from '../../../shared/services/cache.service';

@Module({
  controllers: [EditingPresenceController],
  providers: [EditingPresenceService, CacheService],
})
export class EditingPresenceModule {}
