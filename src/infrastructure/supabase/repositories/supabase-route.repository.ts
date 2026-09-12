import { Injectable, Logger } from '@nestjs/common';
import {
  IRouteRepository,
  RouteWithItems,
} from '../../../core/interfaces/route-repository.interface';
import { CollectionRoute } from '../../../core/domain/collection-route.entity';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class SupabaseRouteRepository implements IRouteRepository {
  private readonly logger = new Logger(SupabaseRouteRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async findRouteByCollectorAndDate(
    collectorId: string,
    date: string,
  ): Promise<RouteWithItems | null> {
    const { data: route, error: routeError } = await this.supabaseService
      .getAdminClient()
      .from('collection_routes')
      .select('*')
      .eq('collector_id', collectorId)
      .eq('route_date', date)
      .maybeSingle();

    if (routeError) {
      this.logger.error(`Error finding route: ${routeError.message}`);
      return null;
    }
    if (!route) return null;

    const { data: items, error: itemsError } = await this.supabaseService
      .getAdminClient()
      .from('collection_route_items')
      .select(
        `
        *,
        loans (
          id,
          installment_amount,
          profiles!loans_borrower_id_fkey (
            alias_name
          )
        )
      `,
      )
      .eq('route_id', route.id)
      .order('order_index', { ascending: true });

    if (itemsError) {
      this.logger.error(`Error finding route items: ${itemsError.message}`);
      return { ...(route as CollectionRoute), items: [] };
    }

    const formattedItems = (items || []).map((item: any) => ({
      id: item.id,
      route_id: item.route_id,
      loan_id: item.loan_id,
      installment_id: item.installment_id,
      order_index: item.order_index,
      visited: item.visited,
      collected_amount: item.collected_amount,
      notes: item.notes,
      visited_at: item.visited_at,
      created_at: item.created_at,
      borrowerAlias: item.loans?.profiles?.alias_name || 'Comerciante',
      amountDue: item.loans?.installment_amount || 0,
    }));

    return {
      ...(route as CollectionRoute),
      items: formattedItems,
    };
  }

  async createOrAssignRoute(params: {
    lenderId: string;
    collectorId: string;
    routeDate: string;
    loanIds: string[];
  }): Promise<CollectionRoute> {
    const admin = this.supabaseService.getAdminClient();

    // 1. Crear o recuperar la ruta
    const { data: route, error: routeError } = await admin
      .from('collection_routes')
      .upsert(
        {
          lender_id: params.lenderId,
          collector_id: params.collectorId,
          route_date: params.routeDate,
          status: 'PLANNED',
        },
        { onConflict: 'collector_id,route_date' },
      )
      .select()
      .single();

    if (routeError) {
      this.logger.error(`Error creating route: ${routeError.message}`);
      throw new Error(routeError.message);
    }

    // 2. Asociar los ítems
    if (params.loanIds && params.loanIds.length > 0) {
      const itemsToInsert = params.loanIds.map((loanId, idx) => ({
        route_id: route.id,
        loan_id: loanId,
        order_index: idx + 1,
        visited: false,
      }));

      const { error: itemsError } = await admin
        .from('collection_route_items')
        .upsert(itemsToInsert, { onConflict: 'route_id,loan_id' });

      if (itemsError) {
        this.logger.error(`Error adding route items: ${itemsError.message}`);
      }
    }

    return route as CollectionRoute;
  }

  async markItemVisited(
    routeId: string,
    loanId: string,
    collectedAmount: number,
    notes?: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .from('collection_route_items')
      .update({
        visited: true,
        collected_amount: collectedAmount,
        notes: notes || null,
        visited_at: new Date().toISOString(),
      })
      .eq('route_id', routeId)
      .eq('loan_id', loanId);

    if (error) {
      this.logger.error(`Error marking item visited: ${error.message}`);
    }
  }
}
