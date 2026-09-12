import {
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { IProfileRepository } from '../../../core/interfaces/profile-repository.interface';
import type { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import type { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import type { IBlockchainService } from '../../../core/interfaces/blockchain-service.interface';
import { LriCalculatorService } from '../../../core/services/lri-calculator.service';
import { UnlockVerifierService } from '../../../infrastructure/unlock/unlock-verifier.service';
import { VerifyKeyDto } from './dto/verify-key.dto';

@Injectable()
export class PassportsService {
  private readonly logger = new Logger(PassportsService.name);

  constructor(
    @Inject('IProfileRepository')
    private readonly profileRepository: IProfileRepository,
    @Inject('ILoanRepository')
    private readonly loanRepository: ILoanRepository,
    @Inject('IInstallmentRepository')
    private readonly installmentRepository: IInstallmentRepository,
    @Inject('IBlockchainService')
    private readonly blockchainService: IBlockchainService,
    private readonly lriCalculator: LriCalculatorService,
    private readonly unlockVerifier: UnlockVerifierService,
  ) {}

  async getSummary(slug: string) {
    const profile = await this.profileRepository.findByPassportSlug(slug);
    if (!profile) {
      throw new NotFoundException(`Pasaporte con slug "${slug}" no encontrado`);
    }

    if (profile.passport_enabled === false) {
      throw new NotFoundException(
        'Este pasaporte ha sido suspendido por su titular',
      );
    }

    // Calcular estadísticas agregadas sin PII
    const loans = await this.loanRepository.findByBorrowerId(profile.id);
    const completedLoansCount = loans.filter(
      (l) => l.status === 'COMPLETED',
    ).length;

    let totalPaid = 0;
    let onTimePaid = 0;
    let overdueCount = 0;
    let totalRepaid = 0;
    let totalFinanced = 0;

    for (const loan of loans) {
      totalFinanced += Number(loan.capital);
      const insts = await this.installmentRepository.findByLoanId(loan.id);
      for (const inst of insts) {
        if (inst.status === 'PAID') {
          totalPaid++;
          totalRepaid += Number(inst.amount);
          if (
            inst.paid_date &&
            new Date(inst.paid_date) <= new Date(inst.due_date)
          ) {
            onTimePaid++;
          } else {
            overdueCount++;
          }
        } else if (
          inst.status === 'OVERDUE' ||
          new Date(inst.due_date) < new Date()
        ) {
          overdueCount++;
        }
      }
    }

    const lri = this.lriCalculator.calculate({
      onTimePaidInstallments: onTimePaid,
      totalPaidInstallments: totalPaid,
      completedLoansCount,
      totalRepaidCapital: totalRepaid,
      totalDisbursedCapital: totalFinanced,
    });

    return {
      aliasName: profile.alias_name,
      passportSlug: profile.passport_slug,
      passportEnabled: profile.passport_enabled,
      lriScore: lri.lriScore,
      confidenceGrade: lri.confidenceGrade,
      punctualityRate: lri.punctualityRate,
      completedLoans: lri.completedLoans,
      repaymentRatio: lri.repaymentRatio,
      totalPaidInstallments: totalPaid,
      totalOverdueInstallments: overdueCount,
      memberSince: profile.created_at.split('T')[0],
    };
  }

  async verifyKey(slug: string, dto: VerifyKeyDto) {
    const profile = await this.profileRepository.findByPassportSlug(slug);
    if (!profile) {
      throw new NotFoundException(`Pasaporte "${slug}" no encontrado`);
    }

    const verification = await this.unlockVerifier.verifyKey({
      viewerAddress: dto.viewerAddress,
      signature: dto.signature,
      timestamp: dto.timestamp,
    });

    if (!verification.hasValidKey) {
      throw new HttpException(
        {
          success: false,
          error: 'PAYMENT_REQUIRED',
          message:
            'Se requiere una membresía activa en Unlock Protocol para consultar el expediente forense.',
          paywallConfig: {
            network: Number(process.env.UNLOCK_CHAIN_ID) || 11155111,
            lockAddress: process.env.UNLOCK_LOCK_ADDRESS,
            recipient: dto.viewerAddress,
          },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return {
      hasValidKey: true,
      expirationTimestamp: verification.expirationTimestamp,
      tokenId: verification.tokenId,
      accessGranted: true,
    };
  }

  async getAuditDossier(slug: string, viewerAddress: string) {
    const profile = await this.profileRepository.findByPassportSlug(slug);
    if (!profile) {
      throw new NotFoundException(`Pasaporte "${slug}" no encontrado`);
    }

    // Verificar permisos Unlock si se proporciona viewerAddress
    if (viewerAddress) {
      const verification = await this.unlockVerifier.verifyKey({
        viewerAddress,
      });
      if (!verification.hasValidKey) {
        throw new HttpException(
          {
            success: false,
            error: 'PAYMENT_REQUIRED',
            message:
              'Acceso restringido por Unlock Protocol. Membresía requerida.',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    // Obtener historial y pruebas en HSK Chain
    const loans = await this.loanRepository.findByBorrowerId(profile.id);
    const completedLoansCount = loans.filter(
      (l) => l.status === 'COMPLETED',
    ).length;

    const proofs: any[] = [];
    let totalPaid = 0;
    let onTimePaid = 0;
    let totalRepaid = 0;
    let totalFinanced = 0;

    for (const loan of loans) {
      totalFinanced += Number(loan.capital);
      const onChainProofs = await this.blockchainService.getLoanProofs(
        loan.hsk_loan_id,
      );
      const insts = await this.installmentRepository.findByLoanId(loan.id);

      for (const inst of insts) {
        if (inst.status === 'PAID') {
          totalPaid++;
          totalRepaid += Number(inst.amount);
          if (
            inst.paid_date &&
            new Date(inst.paid_date) <= new Date(inst.due_date)
          ) {
            onTimePaid++;
          }

          const matchingOnChain = onChainProofs.find(
            (p) => p.installmentNumber === inst.installment_number,
          );

          proofs.push({
            installmentNumber: inst.installment_number,
            receiptHash: inst.receipt_hash || matchingOnChain?.receiptHash,
            isDigital: inst.payment_method === 'POLLAR_USDC',
            mainnetTxHash: inst.pollar_tx_hash || null,
            paidDate: inst.paid_date,
            hskTimestamp:
              matchingOnChain?.timestamp ||
              Math.floor(
                new Date(inst.paid_date || Date.now()).getTime() / 1000,
              ),
          });
        }
      }
    }

    const lri = this.lriCalculator.calculate({
      onTimePaidInstallments: onTimePaid,
      totalPaidInstallments: totalPaid,
      completedLoansCount,
      totalRepaidCapital: totalRepaid,
      totalDisbursedCapital: totalFinanced,
    });

    // Generar documento W3C Verifiable Credential
    return this.unlockVerifier.generateW3CCredential({
      passportSlug: profile.passport_slug || slug,
      borrowerWallet:
        profile.wallet_address || '0x0000000000000000000000000000000000000000',
      lriScore: lri.lriScore,
      completedLoans: completedLoansCount,
      punctualityRate: lri.punctualityRate,
      proofs,
    });
  }
}
