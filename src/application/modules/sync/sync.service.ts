import { Injectable, Inject, Logger } from '@nestjs/common';
import type { ISyncQueueRepository } from '../../../core/interfaces/sync-queue-repository.interface';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import type { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import type { IBlockchainService } from '../../../core/interfaces/blockchain-service.interface';
import { SyncBatchDto, OfflinePaymentItemDto } from './dto/sync-batch.dto';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject('ISyncQueueRepository')
    private readonly syncQueueRepository: ISyncQueueRepository,
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
    @Inject('ILoanRepository')
    private readonly loanRepository: ILoanRepository,
    @Inject('IBlockchainService')
    private readonly blockchainService: IBlockchainService,
  ) {}

  async processBatch(collectorId: string, dto: SyncBatchDto) {
    this.logger.log(
      `Iniciando procesamiento de lote ${dto.batchId} con ${dto.payments.length} cobros offline para cobrador ${collectorId}`,
    );

    const results: any[] = [];
    let processedCount = 0;
    let failedCount = 0;

    for (const payment of dto.payments) {
      try {
        const itemResult = await this.processSinglePayment(
          collectorId,
          payment,
        );
        results.push(itemResult);
        if (itemResult.status === 'SYNCED') {
          processedCount++;
        } else {
          failedCount++;
        }
      } catch (err: any) {
        this.logger.error(
          `Error procesando tx offline ${payment.clientTxId}: ${err.message}`,
        );
        failedCount++;
        results.push({
          clientTxId: payment.clientTxId,
          status: 'ERROR',
          errorMessage: err.message,
        });
      }
    }

    return {
      batchId: dto.batchId,
      processedCount,
      failedCount,
      results,
    };
  }

  private async processSinglePayment(
    collectorId: string,
    payment: OfflinePaymentItemDto,
  ) {
    // 1. Idempotencia: verificar si clientTxId ya fue procesado
    const existingQueueItem = await this.syncQueueRepository.findByClientTxId(
      payment.clientTxId,
    );
    if (existingQueueItem && existingQueueItem.status === 'PROCESSED') {
      return {
        clientTxId: payment.clientTxId,
        status: 'SYNCED',
        alreadyProcessed: true,
        confirmedAt: existingQueueItem.processed_at,
      };
    }

    // 2. Validar cuota y crédito
    const installment = await this.installmentRepository.findById(
      payment.installmentId,
    );
    if (!installment) {
      throw new Error(`Cuota ${payment.installmentId} no encontrada`);
    }

    if (installment.status === 'PAID') {
      await this.syncQueueRepository.enqueue({
        client_tx_id: payment.clientTxId,
        collector_id: collectorId,
        loan_id: payment.loanId,
        installment_number: payment.installmentNumber,
        amount: payment.amount,
        borrower_otp: payment.borrowerOtp,
        receipt_hash: payment.receiptHash,
        status: 'REJECTED',
        error_message: 'ALREADY_PAID',
      });
      return {
        clientTxId: payment.clientTxId,
        status: 'REJECTED',
        errorMessage:
          'La cuota ya fue liquidada digitalmente o presencialmente',
      };
    }

    const loan = await this.loanRepository.findById(payment.loanId);
    if (!loan) {
      throw new Error(`Préstamo ${payment.loanId} no encontrado`);
    }

    // 3. Registrar en sync_queue como PENDING
    await this.syncQueueRepository.enqueue({
      client_tx_id: payment.clientTxId,
      collector_id: collectorId,
      loan_id: payment.loanId,
      installment_number: payment.installmentNumber,
      amount: payment.amount,
      borrower_otp: payment.borrowerOtp,
      receipt_hash: payment.receiptHash,
      status: 'PENDING',
    });

    // 4. Anclaje en HSK Chain
    await this.installmentRepository.claimCash(installment.id);
    const blockchainRes = await this.blockchainService.confirmPayment({
      loanId: loan.hsk_loan_id,
      installmentNumber: payment.installmentNumber,
      receiptHash: payment.receiptHash,
      isDigital: false,
      externalTxHash: '',
    });

    // 5. Actualizar cuota a PAID
    const nowIso = new Date().toISOString();
    await this.installmentRepository.updateInstallment(installment.id, {
      status: 'PAID',
      payment_method: 'CASH',
      paid_date: payment.collectedAt || nowIso,
      receipt_hash: payment.receiptHash,
      hsk_sync_status: 'SYNCED',
    });

    // 6. Marcar sync_queue como PROCESSED
    await this.syncQueueRepository.markProcessed(payment.clientTxId);

    // 7. Verificar si se liquidó el préstamo completo
    const allInstallments = await this.installmentRepository.findByLoanId(
      loan.id,
    );
    if (allInstallments.every((i) => i.status === 'PAID')) {
      await this.loanRepository.updateLoan(loan.id, {
        status: 'COMPLETED',
        completed_at: nowIso,
      });
      this.logger.log(`Préstamo ${loan.id} concluido con éxito tras sync.`);
    }

    return {
      clientTxId: payment.clientTxId,
      status: 'SYNCED',
      hskTxHash: blockchainRes.txHash,
      confirmedAt: nowIso,
    };
  }
}
