import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { DemoController, MockDealWebhookController } from './demo.controller';
import { DemoService } from './demo.service';
import { BullModule } from '@nestjs/bullmq';
import { ReportCacheService } from './report-cache.service';
import { AutomationService } from './automation.service';
import { AdminSessionService } from './admin-session.service';
import { AdminSessionController } from './demo.controller';
import { MockBitrixClient } from '../webhooks/mock-bitrix.client';
import { BitrixModule } from '../bitrix/bitrix.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'leads' }), BitrixModule],
  controllers: [DemoController, MockDealWebhookController, AdminSessionController],
  providers: [DemoService, AdminGuard, ReportCacheService, AutomationService, AdminSessionService, MockBitrixClient],
  exports: [DemoService],
})
export class DemoModule {}
