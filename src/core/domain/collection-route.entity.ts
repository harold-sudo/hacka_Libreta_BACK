export type RouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface CollectionRoute {
  id: string;
  lender_id: string;
  collector_id: string;
  route_date: string;
  status: RouteStatus;
  created_at: string;
  updated_at: string;
}

export interface CollectionRouteItem {
  id: string;
  route_id: string;
  loan_id: string;
  installment_id?: string | null;
  order_index: number;
  visited: boolean;
  collected_amount: number;
  notes?: string | null;
  visited_at?: string | null;
  created_at: string;
}
