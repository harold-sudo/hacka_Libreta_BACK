import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batch')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async syncBatch(@Req() req: any, @Body() dto: SyncBatchDto) {
    const collectorId = req.user.id;
    return this.syncService.processBatch(collectorId, dto);
  }
}
