import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminSessionService } from './admin-session.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly sessions: AdminSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const supplied = request.header('x-admin-key') ?? '';
    if (supplied && this.sessions.validKey(supplied)) return true;
    const authorization = request.header('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization);
    if (!match || !await this.sessions.validToken(match[1])) throw new UnauthorizedException('Invalid admin credentials');
    return true;
  }
}
