import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('api/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('pollar')
  @HttpCode(HttpStatus.OK)
  handlePollarWebhook(
    @Headers('x-pollar-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawPayload = req.rawBody?.toString('utf8') || '';
    return this.webhooksService.handlePollarWebhook(signature, rawPayload);
  }
}
