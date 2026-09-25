import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Request } from 'express';

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === '/health' || request.path === '/openapi.json') return true;
    const limit = request.path.startsWith('/webhooks/tiktok/') ? 120 : 240;
    const key = `rate:${request.ip ?? 'unknown'}:${request.path}`;
    let count: number;
    try {
      count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, 60);
    } catch {
      throw new ServiceUnavailableException('Rate limiter unavailable');
    }
    if (count > limit) throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }

  async onModuleDestroy() { this.redis.disconnect(); }
}
