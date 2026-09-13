import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JsonRpcProvider } from 'ethers';
import type { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import type { IProfileRepository } from '../../../core/interfaces/profile-repository.interface';
import type { IBlockchainService } from '../../../core/interfaces/blockchain-service.interface';
import type { Installment } from '../../../core/domain/installment.entity';
import { CryptoEngineService } from '../../../core/services/crypto-engine.service';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { calculateLoan, installmentDate } from './loan-calculation';
import { CreateLoanDto } from './dto/create-loan.dto';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @Inject('ILoanRepository')
    private readonly loanRepository: ILoanRepository,
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
    @Inject('IProfileRepository')
    private readonly profileRepository: IProfileRepository,
    @Inject('IBlockchainService')
    private readonly blockchainService: IBlockchainService,
    private readonly cryptoEngine: CryptoEngineService,
    private readonly auditService: AuditService,
  ) {}

  async createLoan(lenderId: string, dto: CreateLoanDto) {
    // Validate and compute the entire schedule before writing to HSK or Supabase.
    let schedule: { amount: number; principal: number; dueDate: string }[];
    try {
      const calculated = calculateLoan(
        dto.capital,
        dto.interestRate ?? 0,
        dto.totalInstallments,
      );
      if (
        dto.interestRate == null &&
        (!dto.installmentAmount ||
          Math.round(dto.installmentAmount * 100) * dto.totalInstallments <
            Math.round(dto.capital * 100))
      ) {
        throw new Error('Las cuotas no cubren el capital');
      }
      schedule = calculated.amounts.map((amount, i) => ({
        amount: dto.interestRate == null ? dto.installmentAmount! : amount,
        principal: calculated.principals[i],
        dueDate: installmentDate(dto.startDate, dto.frequency, i),
      }));
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const lenderProfile =
      await this.profileRepository.findByAuthUserId(lenderId);
    if (!lenderProfile || lenderProfile.role !== 'LENDER')
      throw new ForbiddenException('Se requiere un perfil de prestamista');
    lenderId = lenderProfile.id;
    if (dto.settlementNetwork) {
      if (dto.currency !== 'USDC')
        throw new BadRequestException(
          'Las cuotas Pollar deben estar denominadas en USDC',
        );
      const provider = new JsonRpcProvider(process.env.HSK_RPC_URL);
      try {
        if ((await provider.getNetwork()).chainId !== 133n)
          throw new BadRequestException(
            'Los préstamos de prueba requieren HSK testnet',
          );
      } finally {
        provider.destroy();
      }
    }
    // 1. Validar que el prestatario existe
    const borrower = await this.profileRepository.findById(dto.borrowerId);
    if (!borrower) {
      throw new NotFoundException('Perfil de prestatario no encontrado');
    }
    if (
      borrower.role !== 'BORROWER' ||
      borrower.id === lenderId ||
      !borrower.wallet_address ||
      borrower.wallet_address.toLowerCase() !==
        dto.borrowerWalletAddress.toLowerCase()
    )
      throw new BadRequestException(
        'El prestatario y su wallet HSK deben coincidir con el perfil registrado',
      );

    const lender = await this.profileRepository.findById(lenderId);
    if (!lender?.wallet_address)
      throw new BadRequestException(
        'El prestamista no tiene una wallet HSK registrada',
      );
    const lenderWallet = lender.wallet_address;

    // 2. Generar UUID y hashes criptográficos para Zero PII On-Chain
    const now = Date.now();
    const tempUuid = crypto.randomUUID();
    const hskLoanId = this.cryptoEngine.computeHskLoanId(tempUuid, now);
    const loanHash = this.cryptoEngine.computeLoanHash({
      capital: dto.capital,
      totalInstallments: dto.totalInstallments,
      borrowerWallet: dto.borrowerWalletAddress,
      lenderWallet: lenderWallet,
    });

    // 3. Registrar el crédito en el contrato inteligente en HSK Chain
    const blockchainResult = await this.blockchainService.registerLoan({
      loanId: hskLoanId,
      loanHash,
      borrowerWallet: dto.borrowerWalletAddress,
      totalInstallments: dto.totalInstallments,
    });

    // 4. Persistir en la base de datos Supabase
    const createdLoan = await this.loanRepository.createLoan({
      hsk_loan_id: hskLoanId,
      loan_hash: loanHash,
      lender_id: lenderId,
      borrower_id: dto.borrowerId,
      capital: dto.capital,
      currency: dto.currency,
      settlement_network: dto.settlementNetwork ?? null,
      total_installments: dto.totalInstallments,
      installment_amount: schedule[0].amount,
      interest_rate: dto.interestRate ?? null,
      frequency: dto.frequency,
      status: 'ACTIVE',
    });

    // Auditoría Zero-PII: sin datos personales, solo wallets/hashes/valores.
    await this.auditService.record({
      eventType: 'LOAN_REGISTERED',
      loanId: hskLoanId,
      actorAddress: lenderWallet,
      txHash: blockchainResult.txHash,
      blockNumber: blockchainResult.blockNumber,
      metadata: {
        loanUuid: createdLoan.id,
        borrowerWallet: dto.borrowerWalletAddress.toLowerCase(),
        installments: dto.totalInstallments,
        capital: dto.capital,
        currency: dto.currency,
      },
      idempotencyKey: `onchain:${blockchainResult.txHash.toLowerCase()}:0:loan_registered`,
    });

    // 5. Generar el cronograma de cuotas (Installments)
    const installmentsToCreate: Partial<Installment>[] = schedule.map(
      (row, index) => ({
        loan_id: createdLoan.id,
        installment_number: index + 1,
        amount: row.amount,
        principal_amount: row.principal,
        due_date: row.dueDate,
        status: 'PENDING',
        hsk_sync_status: 'PENDING',
      }),
    );

    await this.installmentRepository.createInstallments(installmentsToCreate);

    this.logger.log(
      `Préstamo creado con ID ${createdLoan.id} y anclado en HSK Chain con hash ${hskLoanId}`,
    );

    return {
      loanId: createdLoan.id,
      hskLoanId: createdLoan.hsk_loan_id,
      loanHash: createdLoan.loan_hash,
      hskTxHash: blockchainResult.txHash,
      qrPayload: `https://libreta.app/qr/${createdLoan.id}`,
      createdAt: createdLoan.created_at,
    };
  }
}
