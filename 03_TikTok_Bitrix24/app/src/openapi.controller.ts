import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';

@Controller()
export class OpenApiController {
  @Get('openapi.json')
  get(@Res() response: Response) {
    return response.sendFile(join(process.cwd(), 'docs', 'openapi.json'));
  }
}
