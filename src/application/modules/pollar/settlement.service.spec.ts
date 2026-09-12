import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { SettlementRepository } from './settlement.repository';
import { PollarService } from './pollar.service';
import { SettlementAnchorService } from './settlement-anchor.service';
import type { PaymentIntent } from './settlement.types';
jest.mock('./settlement.repository', () => ({
  SettlementRepository: class {},
}));

describe('Durable installment reconciliation', () => {
  const intent = {
    id: 'intent',
    hsk_loan_id: '0x' + '1'.repeat(64),
    installment_number: 1,
    network: 'stellar:testnet',
    sender: 'sender',
    recipient: 'recipient',
    amount: 1,
    issuer: 'issuer',
    min_ledger: 100,
    status: 'CREATED',
  } as PaymentIntent;
  const hash = 'a'.repeat(64);
  function fixture() {
    const release = { eq: jest.fn().mockReturnThis() };
    const repo = {
      intent: jest.fn().mockResolvedValue(intent),
      rpc: jest.fn().mockResolvedValue(true),
      reject: jest.fn(),
      candidates: jest.fn().mockResolvedValue([]),
      anchors: jest.fn().mockResolvedValue([]),
      anchorFailed: jest.fn(),
      db: {
        from: jest
          .fn()
          .mockReturnValue({ update: jest.fn().mockReturnValue(release) }),
      },
    };
    const pollar = {
      verify: jest.fn().mockResolvedValue({
        status: 'VERIFIED',
        confirmedAt: '2026-09-12T00:00:00Z',
      }),
    };
    const anchor = { anchor: jest.fn() };
    const service = new SettlementService(
      repo as unknown as SettlementRepository,
      pollar as unknown as PollarService,
      anchor as unknown as SettlementAnchorService,
    );
    return { repo, pollar, anchor, service };
  }
  it('persists a submitted hash before verification can fail', async () => {
    const { service, repo, pollar } = fixture();
    jest
      .spyOn(service, 'profile')
      .mockResolvedValue({ id: 'borrower' } as never);
    pollar.verify.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.report('user', 'intent', hash)).rejects.toThrow();
    expect(repo.rpc).toHaveBeenCalledWith('pollar_observe', {
      p_intent: 'intent',
      p_actor: 'borrower',
      p_hash: hash,
    });
    expect(repo.rpc).toHaveBeenCalledTimes(1);
    expect(repo.reject).not.toHaveBeenCalled();
  });
  it('does not settle unindexed payments', async () => {
    const { service, repo, pollar } = fixture();
    pollar.verify.mockResolvedValue({ status: 'PENDING' });
    await service.reconcile(intent.id, hash);
    expect(repo.rpc).not.toHaveBeenCalled();
  });
  it('verifies the saved route and ledger, then atomically persists the receipt', async () => {
    const { service, repo, pollar } = fixture();
    await service.reconcile(intent.id, hash);
    expect(pollar.verify).toHaveBeenCalledWith(
      {
        transactionHash: hash,
        sender: intent.sender,
        recipient: intent.recipient,
        amount: '1',
      },
      { issuer: intent.issuer, minLedger: 100 },
    );
    expect(repo.rpc).toHaveBeenCalledWith(
      'pollar_settle',
      expect.objectContaining({
        p_intent: intent.id,
        p_hash: hash,
        p_receipt: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      }),
    );
  });
  it('rejects mismatched transfers without paying the installment', async () => {
    const { service, repo, pollar } = fixture();
    pollar.verify.mockRejectedValue(new BadRequestException());
    await expect(service.reconcile(intent.id, hash)).rejects.toThrow();
    expect(repo.reject).toHaveBeenCalledWith(intent.id, hash);
    expect(repo.rpc).not.toHaveBeenCalled();
  });
  it('retains HSK failures for retry without marking the installment synced', async () => {
    const { service, repo, anchor } = fixture();
    repo.anchors.mockResolvedValue([{ ...intent, status: 'VERIFIED' }]);
    anchor.anchor.mockRejectedValue(new Error('offline'));
    await service.tick();
    expect(repo.anchorFailed).toHaveBeenCalledWith(intent.id);
    expect(
      repo.rpc.mock.calls.some(([name]) => name === 'pollar_mark_anchored'),
    ).toBe(false);
  });
  it('does no work if another worker holds the lease', async () => {
    const { service, repo, anchor } = fixture();
    repo.rpc.mockResolvedValue(false);
    await service.tick();
    expect(repo.candidates).not.toHaveBeenCalled();
    expect(anchor.anchor).not.toHaveBeenCalled();
  });
});
