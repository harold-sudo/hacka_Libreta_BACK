import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { AssignRouteDto } from './dto/assign-route.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/lender')
export class LenderRoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post('routes/assign')
  @UseGuards(SupabaseAuthGuard)
  async assignRoute(@Req() req: any, @Body() dto: AssignRouteDto) {
    const lenderId = req.user?.id || '00000000-0000-0000-0000-000000000001';
    return this.routesService.assignRoute(lenderId, dto);
  }
}
