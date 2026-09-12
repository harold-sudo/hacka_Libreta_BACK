import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import type { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import type { IProfileRepository } from '../../../core/interfaces/profile-repository.interface';
import { LriCalculatorService } from '../../../core/services/lri-calculator.service';
import { UpdatePassportDto } from './dto/update-passport.dto';

@Injectable()
export class BorrowerService {
  private readonly logger = new Logger(BorrowerService.name);

  constructor(
    @Inject('ILoanRepository')
    private readonly loanRepository: ILoanRepository,
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
    @Inject('IProfileRepository')
    private readonly profileRepository: IProfileRepository,
    private readonly lriCalculator: LriCalculatorService,
  ) {}

  async getActiveLoan(borrowerId: string) {
    const activeLoan =
      await this.loanRepository.findActiveByBorrowerId(borrowerId);
    if (!activeLoan) {
      return { activeLoan: null };
    }

    const installments = await this.installmentRepository.findByLoanId(
      activeLoan.id,
    );
    const lender = await this.profileRepository.findById(activeLoan.lender_id);

    const paidInstallmentsCount = installments.filter(
      (i) => i.status === 'PAID',
    ).length;

    return {
      loanId: activeLoan.id,
      hskLoanId: activeLoan.hsk_loan_id,
      capital: Number(activeLoan.capital),
      currency: activeLoan.currency,
      totalInstallments: activeLoan.total_installments,
      paidInstallments: paidInstallmentsCount,
      installmentAmount: Number(activeLoan.installment_amount),
      frequency: activeLoan.frequency,
      status: activeLoan.status,
      lender: {
        alias: lender?.alias_name || 'Prestamista Libreta',
        walletAddress:
          lender?.wallet_address ||
          '0x0000000000000000000000000000000000000000',
      },
      installments: installments.map((i) => ({
        id: i.id,
        installmentNumber: i.installment_number,
        amount: Number(i.amount),
        dueDate: i.due_date,
        paidDate: i.paid_date,
        status: i.status,
        paymentMethod: i.payment_method,
        receiptHash: i.receipt_hash,
        hskSyncStatus: i.hsk_sync_status,
      })),
    };
  }

  async getPassport(borrowerId: string) {
    const profile = await this.profileRepository.findById(borrowerId);
    if (!profile) {
      throw new NotFoundException('Perfil de prestatario no encontrado');
    }

    // Calcular LRI histórico del prestatario
    const allLoans = await this.loanRepository.findByBorrowerId(borrowerId);
    const completedLoansCount = allLoans.filter(
      (l) => l.status === 'COMPLETED',
    ).length;

    let totalPaid = 0;
    let onTimePaid = 0;
    let repaidCapital = 0;
    let disbursedCapital = 0;

    for (const loan of allLoans) {
      disbursedCapital += Number(loan.capital);
      const insts = await this.installmentRepository.findByLoanId(loan.id);
      for (const inst of insts) {
        if (inst.status === 'PAID') {
          totalPaid++;
          repaidCapital += Number(inst.amount);
          if (
            inst.paid_date &&
            new Date(inst.paid_date) <= new Date(inst.due_date)
          ) {
            onTimePaid++;
          }
        }
      }
    }

    const lri = this.lriCalculator.calculate({
      onTimePaidInstallments: onTimePaid,
      totalPaidInstallments: totalPaid,
      completedLoansCount,
      totalRepaidCapital: repaidCapital,
      totalDisbursedCapital: disbursedCapital,
    });

    const slug = profile.passport_slug || `borrower-${borrowerId.slice(0, 8)}`;

    return {
      passportSlug: slug,
      passportEnabled: profile.passport_enabled ?? true,
      publicUrl: `https://libreta.app/p/${slug}`,
      lriScore: lri.lriScore,
      metrics: {
        punctualityRate: lri.punctualityRate,
        completedLoans: lri.completedLoans,
        repaymentRatio: lri.repaymentRatio,
      },
    };
  }

  async updatePassport(borrowerId: string, dto: UpdatePassportDto) {
    const updates: any = {};
    if (dto.passportSlug) updates.passport_slug = dto.passportSlug;
    if (dto.passportEnabled !== undefined)
      updates.passport_enabled = dto.passportEnabled;

    const updated = await this.profileRepository.updateProfile(
      borrowerId,
      updates,
    );

    return this.getPassport(updated.id);
  }
}
