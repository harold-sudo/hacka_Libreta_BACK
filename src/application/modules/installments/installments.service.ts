import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
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
  ) {}

  async generateOtpChallenge(installmentId: string) {
    const installment =
      await this.installmentRepository.findById(installmentId);
    if (!installment) {
      throw new NotFoundException('Cuota no encontrada');
    }

    if (installment.status === 'PAID') {
      throw new BadRequestException('Esta cuota ya ha sido pagada previamente');
    }

    const challenge = this.cryptoEngine.generateOtp(300);
    this.otpChallenges.set(installmentId, challenge);

    this.logger.log(
      `Desafío OTP generado para cuota ${installmentId}: ${challenge.otpCode} (Expira: ${challenge.expiresAt.toISOString()})`,
    );

    return {
      otpCode: challenge.otpCode,
      expiresAt: challenge.expiresAt.toISOString(),
      challengeHash: challenge.challengeHash,
    };
  }

  async collectCash(installmentId: string, dto: CollectCashDto) {
    const installment =
      await this.installmentRepository.findById(installmentId);
    if (!installment) {
      throw new NotFoundException('Cuota no encontrada');
    }

    if (installment.status === 'PAID') {
      throw new BadRequestException('Esta cuota ya fue pagada');
    }

    // Validar desafío OTP si existe en caché
    const cachedChallenge = this.otpChallenges.get(installmentId);
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

  async confirmPollarPayment(installmentId: string, dto: PollarConfirmDto) {
    const installment =
      await this.installmentRepository.findById(installmentId);
    if (!installment) {
      throw new NotFoundException('Cuota no encontrada');
    }

    // Idempotencia
    if (
      installment.status === 'PAID' &&
      installment.pollar_tx_hash === dto.pollarTxHash
    ) {
      return {
        alreadyProcessed: true,
        installmentId: installment.id,
        status: 'PAID',
        paymentMethod: 'POLLAR_USDC',
        receiptHash: installment.receipt_hash,
      };
    }

    const loan = await this.loanRepository.findById(installment.loan_id);
    if (!loan) {
      throw new NotFoundException('Préstamo no encontrado');
    }

    const now = Date.now();
    const receiptHash = this.cryptoEngine.computeReceiptHash({
      loanId: loan.hsk_loan_id,
      installmentNumber: installment.installment_number,
      amount: Number(installment.amount),
      otp: 'POLLAR_MAINNET',
      timestamp: now,
    });

    // Anclaje en HSK Chain con enlace cruzado a Mainnet
    const blockchainRes = await this.blockchainService.confirmPayment({
      loanId: loan.hsk_loan_id,
      installmentNumber: installment.installment_number,
      receiptHash,
      isDigital: true,
      externalTxHash: dto.pollarTxHash,
    });

    const updated = await this.installmentRepository.updateInstallment(
      installment.id,
      {
        status: 'PAID',
        payment_method: 'POLLAR_USDC',
        paid_date: new Date(now).toISOString(),
        pollar_chain_id: dto.pollarChainId,
        pollar_tx_hash: dto.pollarTxHash,
        receipt_hash: receiptHash,
        hsk_sync_status: 'SYNCED',
      },
    );

    await this.checkAndCompleteLoan(loan.id);

    return {
      installmentId: updated.id,
      status: 'PAID',
      paymentMethod: 'POLLAR_USDC',
      pollarTxHash: dto.pollarTxHash,
      receiptHash,
      hskTxHash: blockchainRes.txHash,
      confirmedAt: updated.paid_date,
    };
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
