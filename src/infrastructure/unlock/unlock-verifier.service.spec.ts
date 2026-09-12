jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { UnlockVerifierService } from './unlock-verifier.service';

const TEST_CHAIN = 11155111;

function makeConfig(): ConfigService {
  return {
    get: (key: string) =>
      ({
        UNLOCK_NETWORK_RPC: 'https://ethereum-sepolia-rpc.publicnode.com',
        UNLOCK_LOCK_ADDRESS: '0xDelegate',
        UNLOCK_CHAIN_ID: String(TEST_CHAIN),
        UNLOCK_CACHE_TTL_MS: '60000',
      })[key],
  } as unknown as ConfigService;
}

function fakeLock(
  overrides: Partial<
    Record<
      'getHasValidKey' | 'keyExpirationTimestampFor' | 'tokenOfOwnerByIndex',
      unknown
    >
  > = {},
) {
  const maybe = (value: unknown) => () => {
    if (value instanceof Error) throw value;
    return value ?? 0n;
  };
  return {
    getHasValidKey: jest.fn(maybe(overrides.getHasValidKey ?? false)),
    keyExpirationTimestampFor: jest.fn(
      maybe(overrides.keyExpirationTimestampFor ?? 0n),
    ),
    tokenOfOwnerByIndex: jest.fn(maybe(overrides.tokenOfOwnerByIndex ?? 0n)),
  } as unknown as ethers.Contract;
}

function fakeProvider(chainId: bigint | number = BigInt(TEST_CHAIN)) {
  return {
    getNetwork: jest.fn(() => ({ chainId: BigInt(chainId) })),
  } as unknown as ethers.JsonRpcProvider;
}

function buildService(lock: ethers.Contract, provider: ethers.JsonRpcProvider) {
  return new UnlockVerifierService(makeConfig(), {
    provider,
    lockContract: lock,
    lockAddress: '0x000000000000000000000000000000000000DEAD',
  });
}

async function validSignature(viewerAddress: string, wallet: ethers.Wallet) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    timestamp,
    signature: await wallet.signMessage(
      `LIBRETA Unlock Audit Access: ${timestamp}`,
    ),
  };
}

describe('UnlockVerifierService.verifyKey', () => {
  it('rechaza addr inválida o firma ausente sin tocar RPC', async () => {
    const lock = fakeLock();
    const s = buildService(lock, fakeProvider());
    const res = await s.verifyKey({
      viewerAddress: '0xnope',
      signature: '0x',
      timestamp: Date.now(),
    });
    expect(res.hasValidKey).toBe(false);
    expect(lock.getHasValidKey).not.toHaveBeenCalled();
  });

  it('rechaza timestamps expirados (>5 min) aunque la firma sea válida', async () => {
    const wallet = ethers.Wallet.createRandom();
    const timestamp = Math.floor(Date.now() / 1000) - 400;
    const signature = await wallet.signMessage(
      `LIBRETA Unlock Audit Access: ${timestamp}`,
    );
    const lock = fakeLock({ getHasValidKey: true });
    const s = buildService(lock, fakeProvider());
    const res = await s.verifyKey({
      viewerAddress: wallet.address,
      signature,
      timestamp,
    });
    expect(res.hasValidKey).toBe(false);
    expect(lock.getHasValidKey).not.toHaveBeenCalled();
  });

  it('rechaza firma que no corresponde a la wallet declarada', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { timestamp, signature } = await validSignature(
      wallet.address,
      wallet,
    );
    const attacker = ethers.Wallet.createRandom();
    const lock = fakeLock({ getHasValidKey: true });
    const s = buildService(lock, fakeProvider());
    const res = await s.verifyKey({
      viewerAddress: attacker.address,
      signature,
      timestamp,
    });
    expect(res.hasValidKey).toBe(false);
    expect(lock.getHasValidKey).not.toHaveBeenCalled();
  });

  it('libera el contenido solo si la wallet tiene Key activa (con tokenId y expiración)', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { timestamp, signature } = await validSignature(
      wallet.address,
      wallet,
    );
    const lock = fakeLock({
      getHasValidKey: true,
      keyExpirationTimestampFor: 1760000000n,
      tokenOfOwnerByIndex: 7n,
    });
    const s = buildService(lock, fakeProvider());

    const res = await s.verifyKey({
      viewerAddress: wallet.address,
      signature,
      timestamp,
    });

    expect(res.hasValidKey).toBe(true);
    expect(res.accessGranted).toBe(true);
    expect(res.expirationTimestamp).toBe(1760000000);
    expect(res.tokenId).toBe('7');
  });

  it('no libera el contenido si la Key no existe o expiró (getHasValidKey=false)', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { timestamp, signature } = await validSignature(
      wallet.address,
      wallet,
    );
    const lock = fakeLock({ getHasValidKey: false });
    const s = buildService(lock, fakeProvider());

    const res = await s.verifyKey({
      viewerAddress: wallet.address,
      signature,
      timestamp,
    });

    expect(res.hasValidKey).toBe(false);
    expect(res.accessGranted).toBe(false);
    expect(lock.tokenOfOwnerByIndex).not.toHaveBeenCalled();
  });

  it('soporta Key activa sin tokenOfOwnerByIndex (no revienta)', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { timestamp, signature } = await validSignature(
      wallet.address,
      wallet,
    );
    const lock = fakeLock({
      getHasValidKey: true,
      tokenOfOwnerByIndex: new Error('index out of range'),
    });
    const s = buildService(lock, fakeProvider());

    const res = await s.verifyKey({
      viewerAddress: wallet.address,
      signature,
      timestamp,
    });

    expect(res.hasValidKey).toBe(true);
    expect(res.tokenId).toBeUndefined();
  });

  it('falla limpiamente (503) si la red no coincide con UNLOCK_CHAIN_ID', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { timestamp, signature } = await validSignature(
      wallet.address,
      wallet,
    );
    const lock = fakeLock({ getHasValidKey: true });
    const s = buildService(lock, fakeProvider(1n));

    await expect(
      s.verifyKey({ viewerAddress: wallet.address, signature, timestamp }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('usa la caché TTL y evita golpear la RPC en verificaciones repetidas', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { timestamp, signature } = await validSignature(
      wallet.address,
      wallet,
    );
    const lock = fakeLock({
      getHasValidKey: true,
      keyExpirationTimestampFor: 1760000000n,
    });
    const s = buildService(lock, fakeProvider());

    const first = await s.verifyKey({
      viewerAddress: wallet.address,
      signature,
      timestamp,
    });
    const second = await s.verifyKey({
      viewerAddress: wallet.address,
      signature,
      timestamp,
    });

    expect(first.hasValidKey).toBe(true);
    expect(second.hasValidKey).toBe(true);
    expect((lock.getHasValidKey as jest.Mock).mock.calls.length).toBe(1);
  });

  it('genera el informe forense marcado como NO firmado (sin credenciales W3C falsas)', () => {
    const s = buildService(fakeLock(), fakeProvider());
    const report = s.generateAuditReport({
      passportSlug: 'alias',
      borrowerWallet: '0x1',
      lriScore: 0.8,
      completedLoans: 2,
      punctualityRate: 0.9,
      proofs: [{ installmentNumber: 1 }],
    });
    expect(report.signed).toBe(false);
    expect(report.type).toBe('LibretaAuditReport');
    expect(report.proofs).toHaveLength(1);
  });
});
