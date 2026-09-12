import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/collector')
export class CollectorController {
  constructor(private readonly routesService: RoutesService) {}

  @Get('routes/today')
  @UseGuards(SupabaseAuthGuard)
  async getTodayRoute(@Req() req: any) {
    const collectorId = req.user?.id || '00000000-0000-0000-0000-000000000003';
    return this.routesService.getTodayRoute(collectorId);
  }
}
