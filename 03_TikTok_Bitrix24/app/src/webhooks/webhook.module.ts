import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from './webhook.controller';
import { WebhookEvent } from './webhook-event.entity';
import { WebhookService } from './webhook.service';
import { LeadProcessor } from './lead.processor';
import { MockBitrixClient } from './mock-bitrix.client';
import { DemoModule } from '../demo/demo.module';
import { BitrixModule } from '../bitrix/bitrix.module';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent]), BullModule.registerQueue({ name: 'leads' }), DemoModule, BitrixModule],
  controllers: [WebhookController],
  providers: [WebhookService, LeadProcessor, MockBitrixClient],
})
export class WebhookModule {}
