import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  keccak256,
  toUtf8Bytes,
} from 'ethers';
import { LIBRETA_REGISTRY_ABI } from '../../../infrastructure/blockchain/libreta-registry.abi';
import type { PaymentIntent } from './settlement.types';

interface Proof {
  installmentNumber: bigint;
  receiptHash: string;
  externalTxHash: string;
  isDigital: boolean;
}
interface Registry {
  loans(id: string): Promise<{
    lender: string;
    createdAt: bigint;
    paidInstallments: bigint;
    status: bigint;
  }>;
  getLoanProofs(id: string, overrides: { blockTag: number }): Promise<Proof[]>;
  confirmPayment(
    id: string,
    number: number,
    receipt: string,
    digital: boolean,
    external: string,
  ): Promise<{
    hash: string;
    wait(
      confirmations: number,
      timeout: number,
    ): Promise<{ status: number | null; hash: string } | null>;
  }>;
}

@Injectable()
export class SettlementAnchorService {
  private readonly evidenceCache = new Map<
    string,
    {
      until: number;
      value: { status: string; receipts: { number: number; hash: string }[] };
    }
  >();
  async evidence(loanId: string) {
    const key = `${process.env.LIBRETA_REGISTRY_ADDRESS}:${loanId}`;
    const cached = this.evidenceCache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    let value: {
      status: string;
      receipts: { number: number; hash: string }[];
    } = { status: 'UNAVAILABLE', receipts: [] };
    try {
      const c = this.connection();
      try {
        if ((await c.provider.getNetwork()).chainId !== 133n)
          throw new Error('Unexpected HSK network');
        const loan = await c.registry.loans(loanId);
        if (loan.createdAt === 0n)
          value = { status: 'NOT_FOUND', receipts: [] };
        else {
          const blockTag = Math.max(0, (await c.provider.getBlockNumber()) - 1);
          const proofs = await c.registry.getLoanProofs(loanId, { blockTag });
          value = {
            status: 'VERIFIED',
            receipts: proofs.map((p) => ({
              number: Number(p.installmentNumber),
              hash: p.receiptHash.toLowerCase(),
            })),
          };
        }
      } finally {
        c.provider.destroy();
      }
    } catch {
      /* A failed RPC is not evidence that the loan or its proofs exist. */
    }
    if (this.evidenceCache.size >= 500) this.evidenceCache.clear();
    this.evidenceCache.set(key, {
      until: Date.now() + (value.status === 'UNAVAILABLE' ? 5000 : 30000),
      value,
    });
    return value;
  }
  private connection() {
    const key = process.env.HSK_OPERATOR_PRIVATE_KEY;
    const address = process.env.LIBRETA_REGISTRY_ADDRESS;
    const url = process.env.HSK_RPC_URL;
    if (!key || !address || !url)
      throw new ServiceUnavailableException(
        'Configura el operador, contrato y RPC HSK reales',
      );
    const request = new FetchRequest(url);
    request.timeout = 8_000;
    const provider = new JsonRpcProvider(request);
    const wallet = new Wallet(key, provider);
    return {
      provider,
      wallet,
      address,
      registry: new Contract(
        address,
        LIBRETA_REGISTRY_ABI,
        wallet,
      ) as unknown as Registry,
    };
  }
  async assertReady(loanId: string, number: number) {
    const c = this.connection();
    try {
      if ((await c.provider.getNetwork()).chainId !== 133n)
        throw new ConflictException(
          'La liquidación Stellar testnet exige HSK testnet 133',
        );
      const loan = await c.registry.loans(loanId);
      if (
        loan.createdAt === 0n ||
        loan.lender.toLowerCase() !== c.wallet.address.toLowerCase()
      )
        throw new ConflictException(
          'El préstamo debe existir en HSK y estar registrado por el operador del backend',
        );
      if (
        Number(loan.paidInstallments) + 1 !== number ||
        Number(loan.status) !== 1
      )
        throw new ConflictException(
          'La cuota no es la siguiente cuota pendiente en HSK',
        );
      return c.address;
    } finally {
      c.provider.destroy();
    }
  }
  async anchor(intent: PaymentIntent): Promise<string | null> {
    const c = this.connection();
    try {
      if (
        (await c.provider.getNetwork()).chainId !==
          BigInt(intent.hsk_chain_id) ||
        c.address.toLowerCase() !== intent.hsk_contract.toLowerCase()
      )
        throw new ConflictException(
          'La red o el contrato HSK cambió respecto de la intención',
        );
      const external = keccak256(
        toUtf8Bytes(`${intent.network}:${intent.tx_hash}`),
      );
      const matches = (p: Proof) =>
        p.receiptHash.toLowerCase() === intent.receipt_hash &&
        p.isDigital &&
        p.externalTxHash.toLowerCase() === external;
      const readExisting = async () => {
        const blockTag = Math.max(0, (await c.provider.getBlockNumber()) - 1);
        return (
          await c.registry.getLoanProofs(intent.hsk_loan_id, { blockTag })
        ).find(
          (p) => Number(p.installmentNumber) === intent.installment_number,
        );
      };
      const existing = await readExisting();
      if (existing) {
        if (!matches(existing))
          throw new ConflictException(
            'HSK ya contiene otro comprobante para esta cuota',
          );
        return intent.hsk_tx_hash; // Recovery after chain success and database failure.
      }
      const loan = await c.registry.loans(intent.hsk_loan_id);
      if (
        loan.lender.toLowerCase() !== c.wallet.address.toLowerCase() ||
        Number(loan.paidInstallments) + 1 !== intent.installment_number
      )
        throw new ConflictException('Operador o secuencia HSK no autorizados');
      try {
        const tx = await c.registry.confirmPayment(
          intent.hsk_loan_id,
          intent.installment_number,
          intent.receipt_hash!,
          true,
          external,
        );
        const receipt = await tx.wait(2, 30_000);
        if (receipt?.status !== 1) throw new Error('HSK pending or reverted');
        const proof = await readExisting();
        if (!proof || !matches(proof)) throw new Error('HSK proof missing');
        return receipt.hash;
      } catch (error) {
        // Concurrent attempt or timeout: never claim success without the exact on-chain proof.
        const proof = await readExisting();
        if (proof && matches(proof)) return null;
        throw error;
      }
    } finally {
      c.provider.destroy();
    }
  }
}
