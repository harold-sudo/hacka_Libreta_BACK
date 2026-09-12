import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider, ZeroAddress } from 'ethers';
import { LIBRETA_REGISTRY_ABI } from '../blockchain/libreta-registry.abi';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from './audit.service';

// Compatible con ethers v6 (ContractEventLog ya no se exporta en runtime).
interface AuditEventLog {
  args: Record<string, unknown>;
  blockNumber: number | bigint;
  transactionHash: string;
  index: number;
}

const STATE_WRITER = 'nestjs-listener';
const MAX_RECONNECT_BACKOFF_MS = 60_000;
const CURSOR_FLUSH_INTERVAL_MS = 30_000;

@Injectable()
export class AuditListenerService {
  private readonly logger = new Logger(AuditListenerService.name);
  private readonly contractAddress: string;
  private readonly chainId: number;
  private readonly enabled: boolean;
  private readonly backfillBlocks: number;
  private provider: JsonRpcProvider | null = null;
  private contract: Contract | null = null;
  private started = false;
  private backoffMs = 1000;
  private retryTimer: NodeJS.Timeout | null = null;
  private cursorFlushTimer: NodeJS.Timeout | null = null;
  private lastSyncedBlock = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {
    this.contractAddress =
      this.configService.get<string>('LIBRETA_REGISTRY_ADDRESS') || ZeroAddress;
    this.chainId = Number(
      this.configService.get<string>('HSK_CHAIN_ID') || '133',
    );
    this.enabled =
      (this.configService.get<string>('AUDIT_LISTENER_ENABLED') ?? 'true') ===
      'true';
    this.backfillBlocks = Number(
      this.configService.get<string>('AUDIT_BACKFILL_BLOCKS') ?? '1000',
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.warn(
        'AuditListener deshabilitado (AUDIT_LISTENER_ENABLED=false).',
      );
      return;
    }
    if (this.contractAddress === ZeroAddress) {
      this.logger.warn(
        'AuditListener sin LIBRETA_REGISTRY_ADDRESS configurado; se omite la escucha on-chain.',
      );
      return;
    }
    void this.start();
  }

  onApplicationShutdown(): void {
    this.started = false;
    this.stopTimers();
    if (this.contract) void this.contract.removeAllListeners();
    if (this.provider) void this.provider.destroy();
    this.contract = null;
    this.provider = null;
  }

  /**
   * Conecta el listener, hace un backfill desde el cursor persistido y
   * finalmente suscribe a eventos en vivo. Cualquier fallo dispara un
   * reinit tentativo con backoff exponencial.
   */
  private async start(): Promise<void> {
    if (this.started) return;
    const rpcUrl =
      this.configService.get<string>('HSK_RPC_URL') ||
      'https://testnet.hsk.xyz';
    const provider = new JsonRpcProvider(rpcUrl, undefined, {
      // HSK RPC may expire server-side filters; read logs by block instead.
      polling: true,
      pollingInterval: 4000,
    });

    try {
      const latest = await provider.getBlockNumber();
      const cursor = await this.getCursor();
      const fromBlock = cursor ?? Math.max(0, latest - this.backfillBlocks);

      const contract = new Contract(
        this.contractAddress,
        LIBRETA_REGISTRY_ABI,
        provider,
      );

      if (fromBlock <= latest) {
        await this.backfill(contract, fromBlock, latest);
      }

      this.provider = provider;
      this.contract = contract;
      this.lastSyncedBlock = Math.max(cursor ?? 0, latest);
      this.attachListeners(contract);
      this.startTimers();
      this.started = true;
      this.backoffMs = 1000;
      this.logger.log(
        `AuditListener activo en ${this.contractAddress} (chain ${this.chainId}); cursor en bloque ${this.lastSyncedBlock}`,
      );
    } catch (error) {
      void provider.destroy();
      this.logger.warn(
        `AuditListener no inició: ${(error as Error).message}; reintento en ${this.backoffMs}ms`,
      );
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.start();
    }, this.backoffMs);
    this.retryTimer.unref?.();
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_RECONNECT_BACKOFF_MS);
  }

  private stopTimers(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.cursorFlushTimer) {
      clearInterval(this.cursorFlushTimer);
      this.cursorFlushTimer = null;
    }
  }

  private startTimers(): void {
    this.stopTimers();
    this.cursorFlushTimer = setInterval(() => {
      void this.flushCursor();
    }, CURSOR_FLUSH_INTERVAL_MS);
    this.cursorFlushTimer.unref?.();
  }

  private attachListeners(contract: Contract): void {
    void contract.on('LoanRegistered', (...args: unknown[]) => {
      const { log: event } = args[args.length - 1] as { log: AuditEventLog };
      void this.onEvent('LoanRegistered', event);
    });
    void contract.on('PaymentConfirmed', (...args: unknown[]) => {
      const { log: event } = args[args.length - 1] as { log: AuditEventLog };
      void this.onEvent('PaymentConfirmed', event);
    });
    void contract.on('LoanCompleted', (...args: unknown[]) => {
      const { log: event } = args[args.length - 1] as { log: AuditEventLog };
      void this.onEvent('LoanCompleted', event);
    });
  }

  /**
   * Procesa un evento on-chain y lo registra de forma durable. El orden de
   * emisión se conserva serializando con la promesa en curso.
   */
  private handleQueue: Promise<void> = Promise.resolve();

  private onEvent(name: string, event: AuditEventLog): void {
    this.handleQueue = this.handleQueue
      .then(() => this.processEvent(name, event))
      .catch((error: unknown) => {
        this.logger.error(
          `Fallo registrando evento ${name} (${event.transactionHash}): ${(error as Error).message}`,
        );
      });
    void this.handleQueue;
  }

  private async processEvent(
    name: string,
    event: AuditEventLog,
  ): Promise<void> {
    const args = event.args;
    this.lastSyncedBlock = Math.max(
      this.lastSyncedBlock,
      Number(event.blockNumber),
    );

    if (name === 'LoanRegistered') {
      await this.auditService.record({
        eventType: 'LOAN_REGISTERED',
        loanId: String(args.loanId).toLowerCase(),
        actorAddress: String(args.lender).toLowerCase(),
        metadata: {
          borrowerWallet: String(args.borrower).toLowerCase(),
          installments: Number(args.installments),
          blockTimestamp: Number(args.timestamp),
        },
        txHash: event.transactionHash,
        blockNumber: Number(event.blockNumber),
        chainId: this.chainId,
        idempotencyKey: `onchain:${event.transactionHash.toLowerCase()}:${event.index}:loan_registered`,
      });
      return;
    }

    if (name === 'PaymentConfirmed') {
      await this.auditService.record({
        eventType: 'PAYMENT_CONFIRMED',
        loanId: String(args.loanId).toLowerCase(),
        actorAddress: null,
        metadata: {
          installmentNumber: Number(args.installmentNumber),
          receiptHash: String(args.receiptHash).toLowerCase(),
          isDigital: Boolean(args.isDigital),
          blockTimestamp: Number(args.timestamp),
        },
        txHash: event.transactionHash,
        blockNumber: Number(event.blockNumber),
        chainId: this.chainId,
        idempotencyKey: `onchain:${event.transactionHash.toLowerCase()}:${event.index}:payment_confirmed`,
      });
      return;
    }

    if (name === 'LoanCompleted') {
      await this.auditService.record({
        eventType: 'LOAN_COMPLETED',
        loanId: String(args.loanId).toLowerCase(),
        actorAddress: String(args.borrower).toLowerCase(),
        metadata: { blockTimestamp: Number(args.completedAt) },
        txHash: event.transactionHash,
        blockNumber: Number(event.blockNumber),
        chainId: this.chainId,
        idempotencyKey: `onchain:${event.transactionHash.toLowerCase()}:${event.index}:loan_completed`,
      });
      return;
    }

    this.logger.warn(`Evento de auditoría desconocido: ${name}`);
  }

  private async backfill(
    contract: Contract,
    fromBlock: number,
    toBlock: number,
  ): Promise<void> {
    if (fromBlock > toBlock) return;
    this.logger.log(
      `AuditListener backfill: eventos ${fromBlock} → ${toBlock}`,
    );
    const eventNames = ['LoanRegistered', 'PaymentConfirmed', 'LoanCompleted'];
    for (const name of eventNames) {
      const events = (await contract.queryFilter(
        name,
        fromBlock,
        toBlock,
      )) as unknown as AuditEventLog[];
      for (const event of events) {
        await this.processEvent(name, event);
      }
    }
    await this.setCursor(toBlock);
  }

  private async getCursor(): Promise<number | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('audit_listener_state')
      .select('block_number')
      .eq('writer', STATE_WRITER)
      .maybeSingle();
    if (error) {
      this.logger.warn(`No se pudo leer cursor del listener: ${error.message}`);
      return null;
    }
    return data ? Number(data.block_number) : null;
  }

  private async setCursor(blockNumber: number): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .from('audit_listener_state')
      .upsert(
        {
          writer: STATE_WRITER,
          contract_address: this.contractAddress.toLowerCase(),
          chain_id: this.chainId,
          block_number: blockNumber,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'writer' },
      );
    if (error) this.logger.warn(`No se pudo guardar cursor: ${error.message}`);
  }

  private async flushCursor(): Promise<void> {
    if (!this.started) return;
    await this.setCursor(this.lastSyncedBlock);
  }
}
