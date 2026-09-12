import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/collector')
export class CollectorController {
  constructor(private readonly routesService: RoutesService) {}

  @Get('routes/today')
  @UseGuards(SupabaseAuthGuard)
  async getTodayRoute(@Req() req: any) {
    const collectorId = req.user.id;
    return this.routesService.getTodayRoute(collectorId);
  }
}
