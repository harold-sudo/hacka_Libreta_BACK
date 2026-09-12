import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { keccak256, toUtf8Bytes } from 'ethers';
import type { VerifyPollarDto } from './pollar.controller';

interface HorizonTransaction {
  hash: string;
  successful: boolean;
  created_at: string;
  ledger: number;
}
interface HorizonPayment {
  type: string;
  transaction_successful: boolean;
  transaction_hash: string;
  from: string;
  to: string;
  asset_code: string;
  asset_issuer: string;
  asset_type: string;
  amount: string;
}

function units(amount: string): bigint {
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,7})?$/.test(amount)) {
    throw new BadRequestException('Importe USDC inválido');
  }
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
}

@Injectable()
export class PollarService {
  config() {
    const issuer = process.env.POLLAR_TESTNET_USDC_ISSUER?.trim() || '';
    return {
      network: 'testnet' as const,
      assetCode: 'USDC',
      assetIssuer: issuer,
      configured: /^G[A-Z2-7]{55}$/.test(issuer),
    };
  }

  private async read<T>(path: string): Promise<T | null> {
    try {
      const response = await fetch(
        `https://horizon-testnet.stellar.org${path}`,
        {
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Horizon unavailable');
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo consultar Stellar. Reintenta la verificación sin volver a pagar.',
      );
    }
  }

  async latestLedger(): Promise<number> {
    const data = await this.read<{
      _embedded: { records: { sequence: number }[] };
    }>('/ledgers?order=desc&limit=1');
    const sequence = data?._embedded.records[0]?.sequence;
    if (!Number.isSafeInteger(sequence) || !sequence)
      throw new ServiceUnavailableException(
        'No se pudo fijar el ledger de la intención',
      );
    return sequence;
  }

  async verify(
    dto: VerifyPollarDto,
    expected?: { issuer: string; minLedger: number },
  ) {
    const config = this.config();
    if (!expected && !config.configured) {
      throw new ServiceUnavailableException(
        'Configura POLLAR_TESTNET_USDC_ISSUER en el backend',
      );
    }
    const amount = units(dto.amount);
    if (amount <= 0n)
      throw new BadRequestException('El importe debe ser mayor que cero');
    const hash = dto.transactionHash.toLowerCase();
    const transaction = await this.read<HorizonTransaction>(
      `/transactions/${hash}`,
    );
    if (!transaction) return { status: 'PENDING', transactionHash: hash };
    if (transaction.hash !== hash || transaction.successful !== true) {
      throw new BadRequestException(
        'La transacción no fue exitosa en Stellar testnet',
      );
    }
    if (
      expected &&
      (!Number.isSafeInteger(transaction.ledger) ||
        transaction.ledger <= expected.minLedger)
    ) {
      throw new BadRequestException(
        'El pago es anterior a la intención de esta cuota',
      );
    }
    const operations = await this.read<{
      _embedded: { records: HorizonPayment[] };
    }>(`/transactions/${hash}/operations?limit=200`);
    const payment = operations?._embedded.records.find(
      (op) =>
        op.type === 'payment' &&
        op.transaction_successful === true &&
        op.transaction_hash === hash &&
        op.from === dto.sender &&
        op.to === dto.recipient &&
        op.asset_type === 'credit_alphanum4' &&
        op.asset_code === 'USDC' &&
        op.asset_issuer === (expected?.issuer ?? config.assetIssuer) &&
        units(op.amount) === amount,
    );
    if (!payment) {
      throw new BadRequestException(
        'El pago no coincide con el emisor USDC, origen, destino o importe esperado',
      );
    }
    return {
      status: 'VERIFIED',
      network: 'testnet',
      transactionHash: hash,
      confirmedAt: transaction.created_at,
      receiptHash: keccak256(
        toUtf8Bytes(`libreta:pollar:stellar:testnet:${hash}`),
      ),
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${hash}`,
      // This proves a transfer, not its submission through a particular provider.
      settlesInstallment: false,
    };
  }
}
