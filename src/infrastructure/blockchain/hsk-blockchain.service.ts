import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { IBlockchainService } from '../../core/interfaces/blockchain-service.interface';
import { LIBRETA_REGISTRY_ABI } from './libreta-registry.abi';

@Injectable()
export class HskBlockchainService implements IBlockchainService {
  private readonly logger = new Logger(HskBlockchainService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;
  private registryContract: ethers.Contract | null = null;
  private readonly contractAddress: string;
  private readonly isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('HSK_RPC_URL') ||
      'https://hashkeychain-testnet.alt.technology';
    const privateKey = this.configService.get<string>(
      'HSK_OPERATOR_PRIVATE_KEY',
    );
    this.contractAddress =
      this.configService.get<string>('LIBRETA_REGISTRY_ADDRESS') ||
      '0x0000000000000000000000000000000000000000';

    try {
      if (
        privateKey &&
        privateKey.startsWith('0x') &&
        privateKey.length === 66 &&
        this.contractAddress !== ethers.ZeroAddress
      ) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.signer = new ethers.Wallet(privateKey, this.provider);
        this.registryContract = new ethers.Contract(
          this.contractAddress,
          LIBRETA_REGISTRY_ABI,
          this.signer,
        );
        this.isConfigured = true;
        this.logger.log(
          `HSK Blockchain Service connected to ${rpcUrl} with contract ${this.contractAddress}`,
        );
      } else {
        this.logger.warn(
          'HSK no configurado. Las escrituras quedan bloqueadas hasta configurar el operador y contrato.',
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to initialize live HSK provider: ${err.message}. Las escrituras quedan bloqueadas.`,
      );
    }
  }

  async registerLoan(params: {
    loanId: string;
    loanHash: string;
    borrowerWallet: string;
    totalInstallments: number;
  }): Promise<{ txHash: string; blockNumber?: number }> {
    if (this.isConfigured && this.registryContract) {
      try {
        const tx = await this.registryContract.registerLoan(
          params.loanId,
          params.loanHash,
          params.borrowerWallet,
          params.totalInstallments,
        );
        const receipt = await tx.wait();
        this.logger.log(
          `Loan ${params.loanId} registered on HSK Chain in tx: ${receipt.hash}`,
        );
        return {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        };
      } catch (err: any) {
        this.logger.error(`On-chain registerLoan error: ${err.message}.`);
        throw new ServiceUnavailableException(
          'HSK no confirmó la transacción; no se generó un comprobante simulado',
        );
      }
    }

    throw new ServiceUnavailableException(
      'Configura HSK antes de registrar préstamos',
    );
  }

  async confirmPayment(params: {
    loanId: string;
    installmentNumber: number;
    receiptHash: string;
    isDigital: boolean;
    externalTxHash: string;
  }): Promise<{ txHash: string; blockNumber?: number }> {
    const extHashBytes32 =
      params.externalTxHash && params.externalTxHash.startsWith('0x')
        ? params.externalTxHash
        : ethers.ZeroHash;

    if (this.isConfigured && this.registryContract) {
      try {
        const tx = await this.registryContract.confirmPayment(
          params.loanId,
          params.installmentNumber,
          params.receiptHash,
          params.isDigital,
          extHashBytes32,
        );
        const receipt = await tx.wait();
        this.logger.log(
          `Payment #${params.installmentNumber} for loan ${params.loanId} confirmed on HSK in tx: ${receipt.hash}`,
        );
        return {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        };
      } catch (err: any) {
        this.logger.error(`On-chain confirmPayment error: ${err.message}.`);
        throw new ServiceUnavailableException(
          'HSK no confirmó la transacción; no se generó un comprobante simulado',
        );
      }
    }

    throw new ServiceUnavailableException(
      'Configura HSK antes de confirmar pagos',
    );
  }

  async getLoanProofs(loanId: string): Promise<
    {
      receiptHash: string;
      installmentNumber: number;
      timestamp: number;
      isDigital: boolean;
      externalTxHash: string;
    }[]
  > {
    if (this.isConfigured && this.registryContract) {
      try {
        const rawProofs = await this.registryContract.getLoanProofs(loanId);
        return rawProofs.map((p: any) => ({
          receiptHash: p.receiptHash,
          installmentNumber: Number(p.installmentNumber),
          timestamp: Number(p.timestamp),
          isDigital: Boolean(p.isDigital),
          externalTxHash: p.externalTxHash,
        }));
      } catch (err: any) {
        this.logger.error(
          `Error reading loan proofs from HSK: ${err.message}.`,
        );
      }
    }

    throw new ServiceUnavailableException(
      'No se pudieron consultar las pruebas HSK',
    );
  }
}
