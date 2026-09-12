import type { IProfileRepository } from '../../../core/interfaces/profile-repository.interface';
import {
  Injectable,
  ForbiddenException,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import type { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import type { IBlockchainService } from '../../../core/interfaces/blockchain-service.interface';
import { CryptoEngineService } from '../../../core/services/crypto-engine.service';
import { CollectCashDto } from './dto/collect-cash.dto';
import { PollarConfirmDto } from './dto/pollar-confirm.dto';

interface ActiveOtpChallenge {
  otpCode: string;
  expiresAt: Date;
  challengeHash: string;
}

@Injectable()
export class InstallmentsService {
  private readonly logger = new Logger(InstallmentsService.name);
  // Almacenamiento en memoria para desafíos OTP activos (TTL 300s)
  private readonly otpChallenges = new Map<string, ActiveOtpChallenge>();

  constructor(
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
    @Inject('ILoanRepository')
    private readonly loanRepository: ILoanRepository,
    @Inject('IBlockchainService')
    private readonly blockchainService: IBlockchainService,
    private readonly cryptoEngine: CryptoEngineService,
    @Inject('IProfileRepository') private readonly profiles: IProfileRepository,
  ) {}

  async generateOtpChallenge(installmentId: string, userId: string) {
    const installment =
      await this.installmentRepository.findById(installmentId);
    if (!installment) {
      throw new NotFoundException('Cuota no encontrada');
    }

    if (installment.status === 'PAID') {
      throw new BadRequestException('Esta cuota ya ha sido pagada previamente');
    }

    const profile = await this.profiles.findByAuthUserId(userId);
    const loan = await this.loanRepository.findById(installment.loan_id);
    if (!profile || profile.role !== 'BORROWER' || loan?.borrower_id !== profile.id) throw new ForbiddenException('Esta cuota no pertenece al prestatario');
    const challenge = this.cryptoEngine.generateOtp(300);
    this.otpChallenges.set(installmentId, challenge);

    this.logger.log(
      `Desafío OTP generado para cuota ${installmentId}`,
    );

    return {
      otpCode: challenge.otpCode,
      expiresAt: challenge.expiresAt.toISOString(),
      challengeHash: challenge.challengeHash,
    };
  }

  async collectCash(installmentId: string, dto: CollectCashDto, userId: string) {
    const installment =
      await this.installmentRepository.findById(installmentId);
    if (!installment) {
      throw new NotFoundException('Cuota no encontrada');
    }

    if (installment.status === 'PAID') {
      throw new BadRequestException('Esta cuota ya fue pagada');
    }

    const actor = await this.profiles.findByAuthUserId(userId);
    const assignedLoan = await this.loanRepository.findById(installment.loan_id);
    if (!actor || actor.role !== 'LENDER' || assignedLoan?.lender_id !== actor.id) throw new ForbiddenException('Solo el prestamista titular puede confirmar este cobro presencial');
    if (Math.round(Number(installment.amount)*100) !== Math.round(dto.amount*100)) throw new BadRequestException('El importe no coincide con la cuota');
    // El desafío debe existir y haber sido emitido al prestatario.
    const cachedChallenge = this.otpChallenges.get(installmentId);
    if (!cachedChallenge) throw new BadRequestException('Solicita un OTP válido al prestatario antes de cobrar');
    if (cachedChallenge) {
      const isValid = this.cryptoEngine.verifyOtp(
        dto.borrowerOtp,
        cachedChallenge.otpCode,
        cachedChallenge.expiresAt,
      );
      if (!isValid) {
        throw new BadRequestException('Código OTP inválido o expirado');
      }
      this.otpChallenges.delete(installmentId);
    }

    const loan = await this.loanRepository.findById(installment.loan_id);
    if (!loan) {
      throw new NotFoundException('Préstamo no encontrado');
    }

    const now = Date.now();
    const receiptHash = this.cryptoEngine.computeReceiptHash({
      loanId: loan.hsk_loan_id,
      installmentNumber: installment.installment_number,
      amount: dto.amount,
      otp: dto.borrowerOtp,
      timestamp: now,
    });

    // Anclaje en HSK Chain
    await this.installmentRepository.claimCash(installment.id);
    const blockchainRes = await this.blockchainService.confirmPayment({
      loanId: loan.hsk_loan_id,
      installmentNumber: installment.installment_number,
      receiptHash,
      isDigital: false,
      externalTxHash: '',
    });

    // Actualizar registro en Supabase
    const updatedInstallment =
      await this.installmentRepository.updateInstallment(installment.id, {
        status: 'PAID',
        payment_method: 'CASH',
        paid_date: new Date(now).toISOString(),
        receipt_hash: receiptHash,
        hsk_sync_status: 'SYNCED',
      });

    // Verificar si se completó el crédito
    await this.checkAndCompleteLoan(loan.id);

    return {
      success: true,
      installmentId: updatedInstallment.id,
      status: 'PAID',
      paymentMethod: 'CASH',
      receiptHash,
      hskTxHash: blockchainRes.txHash,
      confirmedAt: updatedInstallment.paid_date,
    };
  }

  confirmPollarPayment(_installmentId: string, _dto: PollarConfirmDto) {
    throw new ServiceUnavailableException(
      'El endpoint EVM está deshabilitado. Usa /api/pollar/settlements para conciliar cuotas Stellar testnet mediante intenciones autenticadas.',
    );
  }

  private async checkAndCompleteLoan(loanId: string) {
    const allInstallments =
      await this.installmentRepository.findByLoanId(loanId);
    const allPaid = allInstallments.every((i) => i.status === 'PAID');
    if (allPaid && allInstallments.length > 0) {
      await this.loanRepository.updateLoan(loanId, {
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      });
      this.logger.log(`Préstamo ${loanId} completado en su totalidad.`);
    }
  }
}
