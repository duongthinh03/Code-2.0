import { Module } from '@nestjs/common';
import { BitrixSyncService } from './bitrix-sync.service';

@Module({ providers: [BitrixSyncService], exports: [BitrixSyncService] })
export class BitrixModule {}
