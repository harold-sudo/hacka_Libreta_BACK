import {
  Injectable,
  Inject,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import type { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import type { IBlockchainService } from '../../../core/interfaces/blockchain-service.interface';
import { CryptoEngineService } from '../../../core/services/crypto-engine.service';
import { PollarWebhookDto } from './dto/pollar-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
    @Inject('ILoanRepository')
    private readonly loanRepository: ILoanRepository,
    @Inject('IBlockchainService')
    private readonly blockchainService: IBlockchainService,
    private readonly cryptoEngine: CryptoEngineService,
  ) {}

  async handlePollarWebhook(
    signature: string | undefined,
    rawPayload: string,
    dto: PollarWebhookDto,
  ) {
    this.logger.log(
      `Pollar Webhook recibido para evento: ${dto.event}, TX: ${dto.transactionHash}`,
    );

    // 1. Verificación HMAC de la firma
    if (signature) {
      const isValid = this.cryptoEngine.verifyPollarHmac(rawPayload, signature);
      if (!isValid) {
        this.logger.warn(
          `Firma HMAC inválida en webhook de Pollar: ${signature}`,
        );
        throw new UnauthorizedException('Firma de webhook Pollar no válida');
      }
    }

    if (dto.event !== 'payment.completed') {
      return { received: true, message: `Evento no procesable: ${dto.event}` };
    }

    // 2. Idempotencia: verificar si ya se procesó esta TX en esta cadena
    const existing = await this.installmentRepository.findByPollarTxHash(
      dto.chainId,
      dto.transactionHash,
    );
    if (existing && existing.status === 'PAID') {
      this.logger.log(
        `Webhook duplicado para TX ${dto.transactionHash}. Retornando éxito idempotente.`,
      );
      return { received: true, alreadyProcessed: true };
    }

    // 3. Buscar cuota
    const installmentId = dto.metadata?.installmentId;
    let installment = installmentId
      ? await this.installmentRepository.findById(installmentId)
      : null;

    if (
      !installment &&
      dto.metadata?.loanId &&
      dto.metadata?.installmentNumber
    ) {
      installment = await this.installmentRepository.findByLoanIdAndNumber(
        dto.metadata.loanId,
        dto.metadata.installmentNumber,
      );
    }

    if (!installment) {
      this.logger.error(
        `Cuota no encontrada para metadata: ${JSON.stringify(dto.metadata)}`,
      );
      throw new NotFoundException(
        'Cuota no localizada para el webhook recibido',
      );
    }

    const loan = await this.loanRepository.findById(installment.loan_id);
    if (!loan) {
      throw new NotFoundException('Préstamo no encontrado');
    }

    // 4. Derivar receiptHash
    const now = Date.now();
    const receiptHash = this.cryptoEngine.computeReceiptHash({
      loanId: loan.hsk_loan_id,
      installmentNumber: installment.installment_number,
      amount: Number(dto.amount),
      otp: 'POLLAR_USDC_MAINNET',
      timestamp: now,
    });

    // 5. Anclar confirmación en HSK Chain con externalTxHash = dto.transactionHash
    const blockchainRes = await this.blockchainService.confirmPayment({
      loanId: loan.hsk_loan_id,
      installmentNumber: installment.installment_number,
      receiptHash,
      isDigital: true,
      externalTxHash: dto.transactionHash,
    });

    // 6. Actualizar registro en base de datos Supabase
    const nowIso = new Date(now).toISOString();
    await this.installmentRepository.updateInstallment(installment.id, {
      status: 'PAID',
      payment_method: 'POLLAR_USDC',
      paid_date: nowIso,
      pollar_chain_id: dto.chainId,
      pollar_tx_hash: dto.transactionHash,
      receipt_hash: receiptHash,
      hsk_sync_status: 'SYNCED',
    });

    // 7. Verificar completitud del crédito
    const allInstallments = await this.installmentRepository.findByLoanId(
      loan.id,
    );
    if (allInstallments.every((i) => i.status === 'PAID')) {
      await this.loanRepository.updateLoan(loan.id, {
        status: 'COMPLETED',
        completed_at: nowIso,
      });
      this.logger.log(
        `Préstamo ${loan.id} completado automáticamente vía liquidación Pollar Mainnet.`,
      );
    }

    return {
      received: true,
      success: true,
      installmentId: installment.id,
      receiptHash,
      hskTxHash: blockchainRes.txHash,
    };
  }
}
