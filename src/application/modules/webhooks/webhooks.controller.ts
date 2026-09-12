import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { PollarWebhookDto } from './dto/pollar-webhook.dto';

@Controller('api/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('pollar')
  @HttpCode(HttpStatus.OK)
  async handlePollarWebhook(
    @Headers('x-pollar-signature') signature: string,
    @Body() dto: PollarWebhookDto,
    @Req() req: any,
  ) {
    const rawPayload = JSON.stringify(req.body);
    return this.webhooksService.handlePollarWebhook(signature, rawPayload, dto);
  }
}
