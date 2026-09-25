import { Injectable, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import Redis from 'ioredis';

@Injectable()
export class AdminSessionService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly expected: string;

  constructor(config: ConfigService) {
    this.expected = config.get<string>('ADMIN_API_KEY') ?? '';
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: Number(config.getOrThrow<string>('REDIS_PORT')),
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      lazyConnect: true,
    });
    this.redis.on('error', () => undefined);
  }

  validKey(supplied: string): boolean {
    if (this.expected.length < 16) throw new ServiceUnavailableException('ADMIN_API_KEY is not configured');
    const a = Buffer.from(supplied);
    const b = Buffer.from(this.expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async create(suppliedKey: string) {
    if (!this.validKey(suppliedKey)) throw new UnauthorizedException('Invalid admin key');
    const token = randomBytes(32).toString('base64url');
    try { await this.redis.set(this.sessionKey(token), 'admin', 'EX', 8 * 60 * 60); }
    catch { throw new ServiceUnavailableException('Session store unavailable'); }
    return { accessToken: token, tokenType: 'Bearer', expiresInSeconds: 8 * 60 * 60 };
  }

  async validToken(token: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    try { return await this.redis.get(this.sessionKey(token)) === 'admin'; }
    catch { throw new ServiceUnavailableException('Session store unavailable'); }
  }

  async revoke(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Invalid session');
    try { await this.redis.del(this.sessionKey(token)); }
    catch { throw new ServiceUnavailableException('Session store unavailable'); }
    return { revoked: true };
  }

  private sessionKey(token: string) {
    return `admin-session:${createHash('sha256').update(token).digest('hex')}`;
  }

  onModuleDestroy() { this.redis.disconnect(); }
}
