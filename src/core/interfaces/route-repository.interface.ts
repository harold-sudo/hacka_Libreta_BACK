import {
  CollectionRoute,
  CollectionRouteItem,
} from '../domain/collection-route.entity';

export interface RouteWithItems extends CollectionRoute {
  items: (CollectionRouteItem & {
    borrowerAlias?: string;
    amountDue?: number;
    installmentNumber?: number;
  })[];
}

export interface IRouteRepository {
  findRouteByCollectorAndDate(
    collectorId: string,
    date: string,
  ): Promise<RouteWithItems | null>;
  createOrAssignRoute(params: {
    lenderId: string;
    collectorId: string;
    routeDate: string;
    loanIds: string[];
  }): Promise<CollectionRoute>;
  markItemVisited(
    routeId: string,
    loanId: string,
    collectedAmount: number,
    notes?: string,
  ): Promise<void>;
}
