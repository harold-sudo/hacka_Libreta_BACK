import { Injectable, Inject, Logger } from '@nestjs/common';
import type { IRouteRepository } from '../../../core/interfaces/route-repository.interface';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import { AssignRouteDto } from './dto/assign-route.dto';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    @Inject('IRouteRepository')
    private readonly routeRepository: IRouteRepository,
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
  ) {}

  async getTodayRoute(collectorId: string) {
    const today = new Date().toISOString().split('T')[0];
    const route = await this.routeRepository.findRouteByCollectorAndDate(
      collectorId,
      today,
    );

    if (!route) {
      return {
        routeId: null,
        date: today,
        totalStops: 0,
        collectedStops: 0,
        items: [],
      };
    }

    const itemsWithInstallments = await Promise.all(
      route.items.map(async (item) => {
        let installmentNumber = item.installmentNumber;
        let installmentId = item.installment_id;

        if (!installmentNumber || !installmentId) {
          const installments = await this.installmentRepository.findByLoanId(
            item.loan_id,
          );
          const nextPending = installments.find(
            (i) => i.status === 'PENDING' || i.status === 'OVERDUE',
          );
          if (nextPending) {
            installmentNumber = nextPending.installment_number;
            installmentId = nextPending.id;
          }
        }

        return {
          orderIndex: item.order_index,
          loanId: item.loan_id,
          installmentId: installmentId || null,
          installmentNumber: installmentNumber || 1,
          borrowerAlias: item.borrowerAlias || 'Comerciante Libreta',
          amountDue: Number(item.amountDue || 0),
          visited: item.visited,
        };
      }),
    );

    const collectedStops = itemsWithInstallments.filter(
      (i) => i.visited,
    ).length;

    return {
      routeId: route.id,
      date: route.route_date,
      totalStops: itemsWithInstallments.length,
      collectedStops,
      items: itemsWithInstallments,
    };
  }

  async assignRoute(lenderId: string, dto: AssignRouteDto) {
    const route = await this.routeRepository.createOrAssignRoute({
      lenderId,
      collectorId: dto.collectorId,
      routeDate: dto.routeDate,
      loanIds: dto.loanIds,
    });

    this.logger.log(
      `Ruta asignada exitosamente para cobrador ${dto.collectorId} en fecha ${dto.routeDate}`,
    );

    return {
      success: true,
      routeId: route.id,
      collectorId: route.collector_id,
      routeDate: route.route_date,
      assignedLoansCount: dto.loanIds.length,
    };
  }
}
