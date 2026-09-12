import { keccak256, toUtf8Bytes } from 'ethers';
import { SettlementAnchorService } from './settlement-anchor.service';
import type { PaymentIntent } from './settlement.types';

describe('HSK settlement recovery', () => {
  const intent = {
    hsk_chain_id: 133,
    hsk_contract: '0x' + '1'.repeat(40),
    hsk_loan_id: '0x' + '2'.repeat(64),
    installment_number: 1,
    network: 'stellar:testnet',
    tx_hash: 'a'.repeat(64),
    receipt_hash: '0x' + 'b'.repeat(64),
    hsk_tx_hash: null,
  } as PaymentIntent;
  const proof = {
    installmentNumber: 1n,
    receiptHash: intent.receipt_hash,
    isDigital: true,
    externalTxHash: keccak256(
      toUtf8Bytes(`${intent.network}:${intent.tx_hash}`),
    ),
  };
  function fixture() {
    const service = new SettlementAnchorService();
    const registry = {
      getLoanProofs: jest.fn().mockResolvedValue([]),
      loans: jest.fn().mockResolvedValue({
        lender: 'operator',
        paidInstallments: 0n,
        createdAt: 1n,
        status: 1n,
      }),
      confirmPayment: jest.fn().mockResolvedValue({
        wait: jest
          .fn()
          .mockResolvedValue({ status: 1, hash: '0x' + 'c'.repeat(64) }),
      }),
    };
    const provider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: 133n }),
      getBlockNumber: jest.fn().mockResolvedValue(50),
      destroy: jest.fn(),
    };
    Object.defineProperty(service, 'connection', {
      value: () => ({
        registry,
        provider,
        wallet: { address: 'operator' },
        address: intent.hsk_contract,
      }),
    });
    return { service, registry, provider };
  }
  it('recovers an exact confirmed proof after a database failure without sending again', async () => {
    const { service, registry, provider } = fixture();
    registry.getLoanProofs.mockResolvedValue([proof]);
    expect(await service.anchor(intent)).toBeNull();
    expect(registry.confirmPayment).not.toHaveBeenCalled();
    expect(registry.getLoanProofs).toHaveBeenCalledWith(intent.hsk_loan_id, {
      blockTag: 49,
    });
    expect(provider.destroy).toHaveBeenCalled();
  });
  it('refuses a conflicting proof without sending', async () => {
    const { service, registry } = fixture();
    registry.getLoanProofs.mockResolvedValue([
      { ...proof, receiptHash: '0x' + 'd'.repeat(64) },
    ]);
    await expect(service.anchor(intent)).rejects.toThrow('otro comprobante');
    expect(registry.confirmPayment).not.toHaveBeenCalled();
  });
  it('does not mark a failed or unconfirmed transaction as anchored', async () => {
    const { service, registry } = fixture();
    registry.confirmPayment.mockRejectedValue(new Error('RPC unavailable'));
    await expect(service.anchor(intent)).rejects.toThrow('RPC unavailable');
  });
  it('recovers an exact proof after a submission timeout', async () => {
    const { service, registry } = fixture();
    registry.getLoanProofs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([proof]);
    registry.confirmPayment.mockRejectedValue(new Error('timeout'));
    expect(await service.anchor(intent)).toBeNull();
  });
  it('requires a matching on-chain proof even after a successful receipt', async () => {
    const { service } = fixture();
    await expect(service.anchor(intent)).rejects.toThrow('HSK proof missing');
  });
  it('refuses a changed network', async () => {
    const { service, registry, provider } = fixture();
    provider.getNetwork.mockResolvedValue({ chainId: 177n });
    await expect(service.anchor(intent)).rejects.toThrow('cambió');
    expect(registry.confirmPayment).not.toHaveBeenCalled();
  });
  it('does not certify a loan absent from HSK', async () => {
    const { service, registry } = fixture();
    registry.loans.mockResolvedValue({
      createdAt: 0n,
      lender: 'operator',
      paidInstallments: 0n,
      status: 0n,
    });
    expect((await service.evidence(intent.hsk_loan_id)).status).toBe(
      'NOT_FOUND',
    );
    expect(registry.confirmPayment).not.toHaveBeenCalled();
  });
  it('distinguishes unavailable RPC from missing on-chain data', async () => {
    const { service, registry } = fixture();
    registry.loans.mockRejectedValue(new Error('RPC unavailable'));
    expect((await service.evidence(intent.hsk_loan_id)).status).toBe(
      'UNAVAILABLE',
    );
  });
  it('returns actual receipt hashes and caches a read without signing', async () => {
    const { service, registry } = fixture();
    registry.getLoanProofs.mockResolvedValue([proof]);
    const result = await service.evidence(intent.hsk_loan_id);
    expect(result).toEqual({
      status: 'VERIFIED',
      receipts: [{ number: 1, hash: intent.receipt_hash }],
    });
    await service.evidence(intent.hsk_loan_id);
    expect(registry.loans).toHaveBeenCalledTimes(1);
    expect(registry.confirmPayment).not.toHaveBeenCalled();
  });
});
