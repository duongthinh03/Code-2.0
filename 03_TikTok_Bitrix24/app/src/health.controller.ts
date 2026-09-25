import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue('leads') private readonly queue: Queue,
  ) {}

  @Get()
  async check(): Promise<{ status: string; postgres: string; redis: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      await this.queue.getJobCounts();
      return { status: 'ok', postgres: 'ok', redis: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database or Redis is unavailable');
    }
  }
}
