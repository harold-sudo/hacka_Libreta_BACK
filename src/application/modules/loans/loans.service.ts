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
    if (dto.capital > dto.installmentAmount * dto.totalInstallments)
      throw new BadRequestException('Las cuotas no cubren el capital');

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
      installment_amount: dto.installmentAmount,
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
    const startDate = new Date(dto.startDate);
    const installmentsToCreate: Partial<Installment>[] = [];

    for (let i = 1; i <= dto.totalInstallments; i++) {
      const dueDate = new Date(startDate);
      if (dto.frequency === 'DAILY') {
        dueDate.setDate(dueDate.getDate() + (i - 1));
      } else if (dto.frequency === 'WEEKLY') {
        dueDate.setDate(dueDate.getDate() + (i - 1) * 7);
      } else if (dto.frequency === 'BIWEEKLY') {
        dueDate.setDate(dueDate.getDate() + (i - 1) * 14);
      } else if (dto.frequency === 'MONTHLY') {
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
      }

      installmentsToCreate.push({
        loan_id: createdLoan.id,
        installment_number: i,
        amount: dto.installmentAmount,
        principal_amount: dto.capital / dto.totalInstallments,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'PENDING' as const,
        hsk_sync_status: 'PENDING' as const,
      });
    }

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
