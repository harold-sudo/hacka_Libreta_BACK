import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PassportsService } from './passports.service';
import { VerifyKeyDto } from './dto/verify-key.dto';

@Controller('api/passports')
export class PassportsController {
  constructor(private readonly passportsService: PassportsService) {}

  @Get(':slug/summary')
  async getSummary(@Param('slug') slug: string) {
    return this.passportsService.getSummary(slug);
  }

  @Post(':slug/verify-key')
  @HttpCode(HttpStatus.OK)
  async verifyKey(@Param('slug') slug: string, @Body() dto: VerifyKeyDto) {
    return this.passportsService.verifyKey(slug, dto);
  }

  @Get(':slug/audit-dossier')
  async getAuditDossier(
    @Param('slug') slug: string,
    @Headers('x-viewer-address') viewerAddress: string,
    @Headers('x-viewer-signature') signature: string,
    @Headers('x-viewer-timestamp') timestamp: string,
  ) {
    return this.passportsService.getAuditDossier(
      slug,
      viewerAddress,
      signature,
      Number(timestamp),
    );
  }
}
