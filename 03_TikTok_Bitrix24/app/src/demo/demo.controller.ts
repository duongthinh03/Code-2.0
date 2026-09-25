import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from './admin.guard';
import { DemoService } from './demo.service';
import { AutomationService } from './automation.service';
import { AdminSessionService } from './admin-session.service';
import { Headers } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { BitrixSyncService } from '../bitrix/bitrix-sync.service';

function positiveInt(raw: string | undefined, fallback: number, max: number) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new BadRequestException(`Expected integer 1-${max}`);
  return value;
}

function csvCell(value: unknown): string {
  const cell = String(value ?? '');
  const safe = /^[=+@-]/.test(cell) ? `'${cell}` : cell;
  return `"${safe.replace(/"/g, '""')}"`;
}

@Controller('api/v1')
@UseGuards(AdminGuard)
export class DemoController {
  constructor(private readonly demo: DemoService, private readonly automation: AutomationService,
    private readonly bitrixSync: BitrixSyncService) {}

  @Get('config/mappings')
  mappings() { return this.demo.getMappings(); }

  @Put('config/mappings')
  putMappings(@Body() body: unknown) { return this.demo.putMappings(body); }

  @Get('config/rules')
  rules() { return this.demo.getRules(); }

  @Put('config/rules')
  putRules(@Body() body: unknown) { return this.demo.putRules(body); }

  @Get('leads')
  leads(@Query('page') page?: string, @Query('limit') limit?: string, @Query('source') source?: string) {
    if (source && source !== 'tiktok') throw new BadRequestException('Only tiktok source is available in mock');
    return this.demo.listLeads(positiveInt(page, 1, 1000000), positiveInt(limit, 10, 100));
  }

  @Post('leads')
  createLead(@Body() body: unknown) { return this.demo.createLead(body); }

  @Get('leads/:id')
  getLead(@Param('id') id: string) { return this.demo.getLead(id); }

  @Get('leads/:id/bitrix-sync')
  bitrixSyncState(@Param('id') id: string) { return this.bitrixSync.getState(id); }

  @Post('leads/:id/bitrix-sync')
  syncBitrixLead(@Param('id') id: string) { return this.bitrixSync.syncByMockLeadId(id); }

  @Patch('leads/:id')
  updateLead(@Param('id') id: string, @Body() body: unknown) { return this.demo.updateLead(id, body); }

  @Delete('leads/:id')
  archiveLead(@Param('id') id: string) { return this.demo.archiveLead(id); }

  @Get('deals')
  deals(@Query('status') status?: string, @Query('assigned_to') assignedTo?: string) {
    return this.demo.listDeals(status, assignedTo);
  }

  @Get('deals/:id')
  getDeal(@Param('id') id: string) { return this.demo.getDeal(id); }

  @Patch('deals/:id')
  updateDeal(@Param('id') id: string, @Body() body: unknown) { return this.demo.updateDeal(id, body); }

  @Delete('deals/:id')
  archiveDeal(@Param('id') id: string) { return this.demo.archiveDeal(id); }

  @Get('jobs/failed')
  failedJobs() { return this.demo.failedJobs(); }

  @Get('outbound-events')
  outboundEvents() { return this.demo.outboundEvents(); }

  @Get('outbound-receipts')
  outboundReceipts() { return this.automation.receipts(); }

  @Post('outbound-events/:id/replay')
  replayOutbound(@Param('id') id: string) { return this.automation.replay(id); }

  @Post('outbound-events/deliver-pending')
  deliverPending() { return this.automation.deliverPending(); }

  @Get('automation/reports')
  scheduledReports() { return this.automation.reports(); }

  @Get('automation/alerts')
  alerts() { return this.automation.alerts(); }

  @Post('automation/run-report')
  runReport() { return this.automation.runReport(); }

  @Post('jobs/:eventId/replay')
  replay(@Param('eventId') eventId: string) { return this.demo.replayFailed(eventId); }

  @Post('leads/:id/convert-to-deal')
  convert(@Param('id') id: string) { return this.demo.convertManual(id); }

  @Get('analytics/conversion-rates')
  conversionRates() { return this.demo.conversionRates(); }

  @Get('analytics/campaign-performance')
  campaignPerformance() { return this.demo.campaignPerformance(); }

  @Get('reports/export')
  async export(
    @Query('format') format: string | undefined,
    @Query('date_range') dateRange: string | undefined,
    @Res() response: Response,
  ) {
    if (format !== 'csv' && format !== 'json' && format !== 'xlsx') {
      throw new BadRequestException('format must be csv, xlsx or json');
    }
    const days = positiveInt((dateRange ?? '30d').replace(/d$/, ''), 30, 3650);
    const rows = await this.demo.exportLeads(days);
    if (format === 'json') return response.json({ source: 'mock', dateRangeDays: days, data: rows });
    const fields = ['id', 'external_lead_id', 'full_name', 'email', 'phone', 'campaign_id', 'status', 'created_at'];
    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('TikTok mock Leads');
      sheet.addRow(fields);
      for (const row of rows) sheet.addRow(fields.map((field) => {
        const value = row[field];
        return /^[=+@-]/.test(String(value ?? '')) ? `'${String(value)}` : String(value ?? '');
      }));
      const buffer = await workbook.xlsx.writeBuffer();
      response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      response.setHeader('Content-Disposition', 'attachment; filename="tiktok-leads.xlsx"');
      return response.send(Buffer.from(buffer));
    }
    const content = [fields.join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\r\n');
    response.type('text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="tiktok-leads.csv"');
    return response.send(`\uFEFF${content}\r\n`);
  }
}

@Controller('webhooks/bitrix24/deals')
@UseGuards(AdminGuard)
export class MockDealWebhookController {
  constructor(private readonly demo: DemoService) {}

  @Post()
  update(@Body() body: { deal_id?: unknown; status?: unknown; amount?: unknown }) {
    if (!body || (typeof body.deal_id !== 'string' && typeof body.deal_id !== 'number') ||
        typeof body.status !== 'string') throw new BadRequestException('deal_id and status are required');
    return this.demo.updateDealStatus(String(body.deal_id), body.status, body.amount);
  }
}

@Controller('api/v1/auth')
export class AdminSessionController {
  constructor(private readonly sessions: AdminSessionService) {}

  @Post('session')
  create(@Headers('x-admin-key') key?: string) { return this.sessions.create(key ?? ''); }

  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization ?? '')?.[1] ?? '';
    return this.sessions.revoke(token);
  }
}
