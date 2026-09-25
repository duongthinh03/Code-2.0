import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class ReportCacheService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: Number(config.getOrThrow<string>('REDIS_PORT')),
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      lazyConnect: true,
    });
    this.redis.on('error', () => undefined);
  }

  async remember<T>(key: string, fetchValue: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.redis.get(`demo-report:${key}`);
      if (cached) return JSON.parse(cached) as T;
    } catch { /* Report remains available from PostgreSQL. */ }
    const value = await fetchValue();
    try { await this.redis.set(`demo-report:${key}`, JSON.stringify(value), 'EX', 5); }
    catch { /* Cache is optional. */ }
    return value;
  }

  async invalidate(): Promise<void> {
    try { await this.redis.del('demo-report:conversion', 'demo-report:campaigns'); }
    catch { /* TTL bounds staleness even if invalidation fails. */ }
  }

  async onModuleDestroy() { this.redis.disconnect(); }
}
