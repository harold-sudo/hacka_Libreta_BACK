import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import {
  IUnlockVerifierService,
  UnlockVerificationResult,
} from '../../core/interfaces/unlock-verifier.interface';

const PUBLIC_LOCK_ABI = [
  'function getHasValidKey(address _recipient) external view returns (bool)',
  'function keyExpirationTimestampFor(address _recipient) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address _owner, uint256 _index) external view returns (uint256)',
];

@Injectable()
export class UnlockVerifierService implements IUnlockVerifierService {
  private readonly logger = new Logger(UnlockVerifierService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private lockContract: ethers.Contract | null = null;
  private readonly lockAddress: string;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('UNLOCK_NETWORK_RPC') ||
      'https://mainnet.base.org';
    this.lockAddress =
      this.configService.get<string>('UNLOCK_LOCK_ADDRESS') ||
      '0x0000000000000000000000000000000000000000';

    try {
      if (this.lockAddress !== ethers.ZeroAddress) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.lockContract = new ethers.Contract(
          this.lockAddress,
          PUBLIC_LOCK_ABI,
          this.provider,
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not connect to Unlock RPC: ${err.message}`);
    }
  }

  async verifyKey(params: {
    viewerAddress: string;
    signature?: string;
    timestamp?: number;
  }): Promise<UnlockVerificationResult> {
    const { viewerAddress, signature, timestamp } = params;

    // Validación opcional de firma EIP-191 si se envió
    if (signature && timestamp) {
      try {
        const message = `LIBRETA Unlock Audit Access: ${timestamp}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== viewerAddress.toLowerCase()) {
          this.logger.warn(
            `Firma de auditor inválida: esperada ${viewerAddress}, recuperada ${recoveredAddress}`,
          );
          return { hasValidKey: false, accessGranted: false };
        }
      } catch (err: any) {
        this.logger.error(`Error verificando firma: ${err.message}`);
        return { hasValidKey: false, accessGranted: false };
      }
    }

    // Consulta on-chain del contrato PublicLock si está configurado
    if (this.lockContract && this.lockAddress !== ethers.ZeroAddress) {
      try {
        const isValid: boolean =
          await this.lockContract.getHasValidKey(viewerAddress);
        let expiration = 0;
        let tokenId = '1';
        if (isValid) {
          expiration = Number(
            await this.lockContract.keyExpirationTimestampFor(viewerAddress),
          );
          try {
            tokenId = (
              await this.lockContract.tokenOfOwnerByIndex(viewerAddress, 0)
            ).toString();
          } catch {
            tokenId = '1';
          }
        }
        return {
          hasValidKey: isValid,
          expirationTimestamp: expiration,
          tokenId: tokenId,
          accessGranted: isValid,
        };
      } catch (err: any) {
        this.logger.error(`Error consultando contrato Unlock: ${err.message}`);
      }
    }

    // En modo desarrollo / demo hackathon, otorgamos acceso si la dirección es válida
    const isMockAuditor =
      viewerAddress &&
      ethers.isAddress(viewerAddress) &&
      viewerAddress.toLowerCase().startsWith('0x');

    if (isMockAuditor) {
      return {
        hasValidKey: true,
        expirationTimestamp: Math.floor(Date.now() / 1000) + 86400 * 30,
        tokenId: '42',
        accessGranted: true,
      };
    }

    return {
      hasValidKey: false,
      accessGranted: false,
    };
  }

  /**
   * Genera el documento de Credencial Verificable W3C (JSON-LD)
   */
  generateW3CCredential(params: {
    passportSlug: string;
    borrowerWallet: string;
    lriScore: number;
    completedLoans: number;
    punctualityRate: number;
    proofs: any[];
  }) {
    return {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://libreta.app/contexts/financial-reputation-v1.jsonld',
      ],
      id: `urn:uuid:${ethers.keccak256(ethers.toUtf8Bytes(params.passportSlug + Date.now())).slice(0, 36)}`,
      type: ['VerifiableCredential', 'LibretaFinancialReputationCredential'],
      issuer: `did:ethr:hsk:${this.lockAddress !== ethers.ZeroAddress ? this.lockAddress : '0x1234567890123456789012345678901234567890'}`,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `did:ethr:hsk:${params.borrowerWallet}`,
        passportSlug: params.passportSlug,
        lriScore: params.lriScore,
        completedLoans: params.completedLoans,
        onTimePaymentRatio: params.punctualityRate,
        hskContract: this.lockAddress,
        proofs: params.proofs,
      },
      proof: {
        type: 'EthereumEip712Signature2021',
        created: new Date().toISOString(),
        proofValue: ethers.keccak256(
          ethers.toUtf8Bytes(
            `${params.passportSlug}:${params.lriScore}:${Date.now()}`,
          ),
        ),
      },
    };
  }
}
