import {
  Injectable,
  Inject,
  Optional,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import {
  IUnlockVerifierService,
  UnlockVerificationResult,
} from '../../core/interfaces/unlock-verifier.interface';

const PUBLIC_LOCK_ABI = [
  'function getHasValidKey(address _recipient) external view returns (bool)',
  'function keyExpirationTimestampFor(uint256 _tokenId) external view returns (uint256)',
  'function keyExpirationTimestampFor(address _recipient) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address _owner, uint256 _index) external view returns (uint256)',
];

// Seam de test: permite inyectar un provider/contrato falsos sin tocar RPC.
export interface UnlockVerifierDeps {
  provider?: ethers.JsonRpcProvider | null;
  lockContract?: ethers.Contract | null;
  lockAddress?: string;
}

@Injectable()
export class UnlockVerifierService implements IUnlockVerifierService {
  private readonly logger = new Logger(UnlockVerifierService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private lockContract: ethers.Contract | null = null;
  private readonly lockAddress: string;
  private readonly cacheTtlMs: number;
  // Caché en memoria TTL de getHasValidKey para evitar golpear RPC en cada
  // verificación repetida (verifyKey + getAuditDossier del mismo usuario).
  private readonly membershipCache = new Map<
    string,
    { expiresAt: number; result: UnlockVerificationResult }
  >();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject('UNLOCK_VERIFIER_TEST_DEPS')
    private readonly testDeps: UnlockVerifierDeps = {},
  ) {
    const rpcUrl =
      this.configService.get<string>('UNLOCK_NETWORK_RPC') ||
      'https://mainnet.base.org';
    this.lockAddress =
      this.testDeps.lockAddress ??
      (this.configService.get<string>('UNLOCK_LOCK_ADDRESS') ||
        '0x0000000000000000000000000000000000000000');
    this.cacheTtlMs = Number(
      this.configService.get<string>('UNLOCK_CACHE_TTL_MS') || '30000',
    );

    try {
      if (this.lockAddress !== ethers.ZeroAddress) {
        if (this.testDeps.provider) {
          this.provider = this.testDeps.provider;
          this.lockContract =
            this.testDeps.lockContract ??
            new ethers.Contract(
              this.lockAddress,
              PUBLIC_LOCK_ABI,
              this.provider,
            );
        } else {
          const request = new ethers.FetchRequest(rpcUrl);
          request.timeout = 8000;
          this.provider = new ethers.JsonRpcProvider(request);
          this.lockContract = new ethers.Contract(
            this.lockAddress,
            PUBLIC_LOCK_ABI,
            this.provider,
          );
        }
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

    if (
      !ethers.isAddress(viewerAddress) ||
      !signature ||
      !timestamp ||
      !Number.isSafeInteger(timestamp) ||
      timestamp > Math.floor(Date.now() / 1000) + 30 ||
      Math.floor(Date.now() / 1000) - timestamp > 300
    ) {
      return { hasValidKey: false, accessGranted: false };
    }
    // La firma prueba control de la wallet y caduca a los cinco minutos.
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
      const cacheKey = viewerAddress.toLowerCase();
      const cached = this.membershipCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }
      try {
        const expectedChain = Number(
          this.configService.get<string>('UNLOCK_CHAIN_ID'),
        );
        if (
          !Number.isSafeInteger(expectedChain) ||
          expectedChain <= 0 ||
          Number((await this.provider!.getNetwork()).chainId) !== expectedChain
        )
          throw new Error('Unlock network mismatch');
        const isValid: boolean =
          await this.lockContract.getHasValidKey(viewerAddress);
        let expiration = 0;
        let tokenId: string | undefined;
        if (isValid) {
          try {
            tokenId = (
              await this.lockContract.tokenOfOwnerByIndex(viewerAddress, 0)
            ).toString();
          } catch {
            tokenId = undefined;
          }

          try {
            if (tokenId !== undefined) {
              const fn =
                this.lockContract['keyExpirationTimestampFor(uint256)'] ||
                this.lockContract.keyExpirationTimestampFor;
              expiration = Number(
                await fn.call(this.lockContract, BigInt(tokenId)),
              );
            }
          } catch {
            try {
              const fn =
                this.lockContract['keyExpirationTimestampFor(address)'] ||
                this.lockContract.keyExpirationTimestampFor;
              expiration = Number(
                await fn.call(this.lockContract, viewerAddress),
              );
            } catch {
              expiration = 0;
            }
          }
        }
        const result: UnlockVerificationResult = {
          hasValidKey: isValid,
          expirationTimestamp: expiration,
          tokenId: tokenId,
          accessGranted: isValid,
        };
        if (this.cacheTtlMs > 0) {
          this.membershipCache.set(cacheKey, {
            expiresAt: Date.now() + this.cacheTtlMs,
            result,
          });
        }
        return result;
      } catch (err: any) {
        this.logger.error(`Error consultando contrato Unlock: ${err.message}`);
      }
    }

    throw new ServiceUnavailableException(
      'Unlock no está configurado o no se pudo verificar la membresía en la red.',
    );
  }

  /**
   * Genera un informe sin firma; no es una credencial W3C verificable.
   */
  generateAuditReport(params: {
    passportSlug: string;
    borrowerWallet: string;
    lriScore: number;
    completedLoans: number;
    punctualityRate: number;
    proofs: any[];
  }) {
    // Informe sin firma: no se presenta un hash de texto como credencial verificable.
    return {
      type: 'LibretaAuditReport',
      signed: false,
      generatedAt: new Date().toISOString(),
      passportSlug: params.passportSlug,
      borrowerWallet: params.borrowerWallet,
      lriScore: params.lriScore,
      completedLoans: params.completedLoans,
      punctualityRate: params.punctualityRate,
      proofs: params.proofs,
    };
  }
}
