import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { keccak256, toUtf8Bytes } from 'ethers';
import { randomUUID } from 'crypto';
import { SettlementRepository } from './settlement.repository';
import { PollarService } from './pollar.service';
import { SettlementAnchorService } from './settlement-anchor.service';
import type { PaymentIntent } from './settlement.types';
import type { Profile } from '../../../core/domain/profile.entity';

@Injectable()
export class SettlementService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(SettlementService.name);
  constructor(
    private readonly repo: SettlementRepository,
    private readonly pollar: PollarService,
    private readonly anchor: SettlementAnchorService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 15_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async profile(userId: string): Promise<Profile> {
    const { data, error } = await this.repo.db
      .from('profiles')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (error)
      throw new ServiceUnavailableException('No se pudo leer tu perfil');
    if (!data)
      throw new ForbiddenException('Primero crea tu perfil de LIBRETA');
    return data as Profile;
  }
  async list(userId: string) {
    const profile = await this.profile(userId);
    const { data: loans, error } = await this.repo.db
      .from('loans')
      .select('*,installments(*)')
      .or(`borrower_id.eq.${profile.id},lender_id.eq.${profile.id}`)
      .order('created_at', { ascending: false });
    if (error)
      throw new ServiceUnavailableException('No se pudieron leer las cuotas');
    const { data: intents, error: intentError } = await this.repo.db
      .from('pollar_payment_intents')
      .select('*')
      .or(`borrower_id.eq.${profile.id},lender_id.eq.${profile.id}`);
    if (intentError)
      throw new ServiceUnavailableException(
        'Aplica la migración de conciliación Pollar',
      );
    const { data: route, error: routeError } = await this.repo.db
      .from('pollar_wallet_routes')
      .select('address')
      .eq('profile_id', profile.id)
      .maybeSingle();
    if (routeError)
      throw new ServiceUnavailableException(
        'No se pudo leer la wallet de cobro',
      );
    const verifiedLoans: any[] = [];
    for (let offset = 0; offset < (loans ?? []).length; offset += 5) {
      verifiedLoans.push(
        ...(await Promise.all(
          loans.slice(offset, offset + 5).map(async (loan) => {
            const evidence = await this.anchor.evidence(loan.hsk_loan_id);
            return {
              ...loan,
              hsk_verification: evidence.status,
              installments: loan.installments.map((i: any) => ({
                ...i,
                hsk_verified:
                  evidence.status === 'VERIFIED' &&
                  evidence.receipts.some(
                    (p) =>
                      p.number === i.installment_number &&
                      p.hash === i.receipt_hash?.toLowerCase(),
                  ),
              })),
            };
          }),
        )),
      );
    }
    return {
      profile,
      loans: verifiedLoans,
      intents,
      receivingAddress: route?.address ?? null,
    };
  }
  async receivingWallet(userId: string, address: string) {
    const profile = await this.profile(userId);
    if (profile.role !== 'LENDER')
      throw new ForbiddenException(
        'Solo el prestamista configura su cuenta de cobro',
      );
    const { error } = await this.repo.db
      .from('pollar_wallet_routes')
      .upsert({ profile_id: profile.id, network: 'stellar:testnet', address });
    if (error)
      throw new ServiceUnavailableException(
        'No se pudo guardar la wallet de cobro',
      );
    return { address };
  }
  async create(userId: string, installmentId: string, sender: string) {
    const profile = await this.profile(userId);
    const { data: installment, error } = await this.repo.db
      .from('installments')
      .select('*,loans(*)')
      .eq('id', installmentId)
      .maybeSingle();
    if (error)
      throw new ServiceUnavailableException('No se pudo consultar la cuota');
    if (!installment || installment.loans.borrower_id !== profile.id)
      throw new NotFoundException('Cuota no encontrada');
    const { data: existing, error: existingError } = await this.repo.db
      .from('pollar_payment_intents')
      .select('*')
      .eq('installment_id', installmentId)
      .maybeSingle();
    if (existingError)
      throw new ServiceUnavailableException(
        'No se pudo consultar la intención',
      );
    if (existing) {
      if (existing.sender !== sender)
        throw new BadRequestException(
          'Esta intención pertenece a otra wallet de origen',
        );
      return existing as PaymentIntent;
    }
    const config = this.pollar.config();
    if (!config.configured)
      throw new ServiceUnavailableException('Configura el issuer USDC');
    const contract = await this.anchor.assertReady(
      installment.loans.hsk_loan_id,
      installment.installment_number,
    );
    const ledger = await this.pollar.latestLedger();
    return this.repo.rpc<PaymentIntent>('pollar_create_intent', {
      p_installment: installmentId,
      p_actor: profile.id,
      p_sender: sender,
      p_issuer: config.assetIssuer,
      p_ledger: ledger,
      p_contract: contract,
    });
  }
  async report(userId: string, id: string, hash: string) {
    const profile = await this.profile(userId);
    await this.repo.rpc('pollar_observe', {
      p_intent: id,
      p_actor: profile.id,
      p_hash: hash.toLowerCase(),
    });
    await this.reconcile(id, hash.toLowerCase());
    // HSK runs separately. The browser must not repeat the money transfer to retry anchoring.
    void this.tick();
    return this.repo.intent(id);
  }
  async reconcile(id: string, hash: string) {
    const intent = await this.repo.intent(id);
    if (!intent || intent.status !== 'CREATED') return;
    try {
      const proof = await this.pollar.verify(
        {
          transactionHash: hash,
          sender: intent.sender,
          recipient: intent.recipient,
          amount: String(intent.amount),
        },
        { issuer: intent.issuer, minLedger: Number(intent.min_ledger) },
      );
      if (proof.status !== 'VERIFIED') return;
      const receipt = keccak256(
        toUtf8Bytes(
          JSON.stringify([
            'libreta:installment:v1',
            intent.id,
            intent.hsk_loan_id,
            intent.installment_number,
            intent.network,
            intent.sender,
            intent.recipient,
            String(intent.amount),
            intent.issuer,
            hash,
          ]),
        ),
      );
      await this.repo.rpc('pollar_settle', {
        p_intent: id,
        p_hash: hash,
        p_receipt: receipt,
        p_paid_at: proof.confirmedAt,
      });
    } catch (error) {
      if (error instanceof BadRequestException)
        await this.repo.reject(id, hash);
      throw error;
    }
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    const owner = randomUUID();
    let claimed = false;
    try {
      claimed = await this.repo.rpc<boolean>('pollar_claim_worker', {
        p_owner: owner,
      });
      if (!claimed) return;
      for (const c of await this.repo.candidates()) {
        await this.repo.deferCandidate(c.intent_id, c.tx_hash);
        try {
          await this.reconcile(c.intent_id, c.tx_hash);
        } catch {
          /* durable candidate is retried; invalid proofs are rejected */
        }
      }
      // One anchor per lease; prevents long-running loops from outliving the lease.
      const intent = (await this.repo.anchors())[0];
      if (intent) {
        try {
          const hash = await this.anchor.anchor(intent);
          await this.repo.rpc('pollar_mark_anchored', {
            p_intent: intent.id,
            p_hash: hash,
          });
        } catch {
          await this.repo.anchorFailed(intent.id);
        }
      }
    } catch {
      this.logger.warn(
        'Cola Pollar/HSK no disponible; se reintentará. Revisa migración y conectividad.',
      );
    } finally {
      if (claimed)
        await this.repo.db
          .from('pollar_worker_lease')
          .update({ until_at: new Date(0).toISOString() })
          .eq('id', 1)
          .eq('owner', owner);
      this.running = false;
    }
  }
}
