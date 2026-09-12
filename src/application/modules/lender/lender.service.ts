import { Injectable, Inject, Logger } from '@nestjs/common';
import type { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';

@Injectable()
export class LenderService {
  private readonly logger = new Logger(LenderService.name);

  constructor(
    @Inject('ILoanRepository')
    private readonly loanRepository: ILoanRepository,
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
  ) {}

  async getAnalyticsOverview(lenderId: string) {
    const loans = await this.loanRepository.findByLenderId(lenderId);
    const activeLoansCount = loans.filter((l) => l.status === 'ACTIVE').length;
    const completedLoansCount = loans.filter(
      (l) => l.status === 'COMPLETED',
    ).length;

    let totalCapitalDeployed = 0;
    let totalCapitalRecovered = 0;
    let todayCollectionAmount = 0;
    let todayCollectionCount = 0;
    let cashCount = 0;
    let pollarCount = 0;
    let overdueCount = 0;
    let totalDueInstallments = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    for (const loan of loans) {
      totalCapitalDeployed += Number(loan.capital);
      const installments = await this.installmentRepository.findByLoanId(
        loan.id,
      );

      for (const inst of installments) {
        if (inst.status === 'PAID') {
          totalCapitalRecovered += Number(inst.amount);

          if (inst.paid_date && inst.paid_date.startsWith(todayStr)) {
            todayCollectionAmount += Number(inst.amount);
            todayCollectionCount++;
          }

          if (inst.payment_method === 'POLLAR_USDC') {
            pollarCount++;
          } else {
            cashCount++;
          }
        } else {
          totalDueInstallments++;
          if (
            inst.status === 'OVERDUE' ||
            new Date(inst.due_date) < new Date()
          ) {
            overdueCount++;
          }
        }
      }
    }

    const totalPaidCount = cashCount + pollarCount;
    const cashPercentage =
      totalPaidCount > 0
        ? Math.round((cashCount / totalPaidCount) * 1000) / 10
        : 0.0;
    const pollarUsdcPercentage =
      totalPaidCount > 0
        ? Math.round((pollarCount / totalPaidCount) * 1000) / 10
        : 0.0;

    const overdueRate =
      totalDueInstallments > 0
        ? Math.round((overdueCount / totalDueInstallments) * 1000) / 10
        : 0.0;

    return {
      totalCapitalDeployed,
      totalCapitalRecovered,
      activeLoansCount,
      completedLoansCount,
      todayCollectionAmount,
      todayCollectionCount,
      paymentMethodSplit: {
        cashPercentage,
        pollarUsdcPercentage,
      },
      overdueRate,
    };
  }
}
