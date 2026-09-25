import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

@Injectable()
export class HttpLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLogInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = Date.now();
    return next.handle().pipe(tap({
      next: () => this.logger.log(`${request.method} ${request.path} ${response.statusCode} ${Date.now() - start}ms`),
      error: () => this.logger.warn(`${request.method} ${request.path} failed ${Date.now() - start}ms`),
    }));
  }
}
