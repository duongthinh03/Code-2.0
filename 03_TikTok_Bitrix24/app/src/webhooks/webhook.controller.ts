import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';

@Controller('webhooks/tiktok/leads')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post()
  @HttpCode(202)
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-mock-tiktok-timestamp') timestamp?: string,
    @Headers('x-mock-tiktok-signature') signature?: string,
  ) {
    return this.webhooks.receive(request.rawBody, timestamp, signature);
  }
}
