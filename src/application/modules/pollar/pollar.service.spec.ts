import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PollarService } from './pollar.service';

describe('Pollar testnet verification', () => {
  const hash = 'a'.repeat(64);
  const sender = `G${'A'.repeat(55)}`;
  const recipient = `G${'B'.repeat(55)}`;
  const issuer = `G${'C'.repeat(55)}`;
  const input = { transactionHash: hash, sender, recipient, amount: '1' };
  const payment = {
    type: 'payment',
    transaction_successful: true,
    transaction_hash: hash,
    from: sender,
    to: recipient,
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: issuer,
    amount: '1.0000000',
  };
  let service: PollarService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const originalIssuer = process.env.POLLAR_TESTNET_USDC_ISSUER;

  beforeEach(() => {
    service = new PollarService();
    process.env.POLLAR_TESTNET_USDC_ISSUER = issuer;
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalIssuer === undefined)
      delete process.env.POLLAR_TESTNET_USDC_ISSUER;
    else process.env.POLLAR_TESTNET_USDC_ISSUER = originalIssuer;
  });
  function respond(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status }),
    );
  }
  function transaction() {
    respond({ hash, successful: true, created_at: '2026-09-12T08:00:00Z' });
  }

  it('rejects a payment from before the installment intent', async () => {
    respond({ hash, successful: true, ledger: 100 });
    await expect(
      service.verify(input, { issuer, minLedger: 100 }),
    ).rejects.toThrow('anterior');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('uses the immutable issuer snapshot after configuration changes', async () => {
    process.env.POLLAR_TESTNET_USDC_ISSUER = sender;
    respond({
      hash,
      successful: true,
      ledger: 101,
      created_at: '2026-09-12T08:00:00Z',
    });
    respond({ _embedded: { records: [payment] } });
    expect(
      await service.verify(input, { issuer, minLedger: 100 }),
    ).toMatchObject({ status: 'VERIFIED' });
  });

  it('verifies exact USDC transfer without settling a loan', async () => {
    transaction();
    respond({ _embedded: { records: [payment] } });
    const result = await service.verify(input);
    expect(result).toMatchObject({
      status: 'VERIFIED',
      network: 'testnet',
      settlesInstallment: false,
    });
    expect(result.receiptHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://horizon-testnet.stellar.org/transactions/${hash}`,
    );
  });
  it.each([
    { from: recipient },
    { to: sender },
    { asset_issuer: sender },
    { asset_code: 'FAKE' },
    { amount: '0.9999999' },
    { amount: '1.0000001' },
    { transaction_successful: false },
    { type: 'path_payment_strict_receive' },
    { transaction_hash: 'b'.repeat(64) },
  ])('rejects mismatched operation %j', async (changes) => {
    transaction();
    respond({ _embedded: { records: [{ ...payment, ...changes }] } });
    await expect(service.verify(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('treats an unindexed hash as pending', async () => {
    respond({}, 404);
    expect(await service.verify(input)).toMatchObject({ status: 'PENDING' });
  });
  it('rejects unsuccessful transactions before reading operations', async () => {
    respond({ hash, successful: false });
    await expect(service.verify(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not turn network failure into payment success', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.verify(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('requires a configured issuer', async () => {
    delete process.env.POLLAR_TESTNET_USDC_ISSUER;
    await expect(service.verify(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1e2', '0.00000001'])(
    'rejects invalid amount %s',
    async (amount) => {
      await expect(service.verify({ ...input, amount })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
