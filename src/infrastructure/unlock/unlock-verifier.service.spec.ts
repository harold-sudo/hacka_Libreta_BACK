jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { UnlockVerifierService } from './unlock-verifier.service';
describe('Unlock access without demonstrations', () => {
  const config = {get: () => undefined} as unknown as ConfigService;
  const wallet = ethers.Wallet.createRandom();
  it('does not grant access for a public address alone', async () => {
    expect((await new UnlockVerifierService(config).verifyKey({viewerAddress: wallet.address})).accessGranted).toBe(false);
  });
  it('rejects stale signatures', async () => {
    const timestamp = Math.floor(Date.now()/1000)-600;
    const signature = await wallet.signMessage(`LIBRETA Unlock Audit Access: ${timestamp}`);
    expect((await new UnlockVerifierService(config).verifyKey({viewerAddress: wallet.address, signature, timestamp})).accessGranted).toBe(false);
  });
  it('fails closed when no lock is configured', async () => {
    const timestamp = Math.floor(Date.now()/1000);
    const signature = await wallet.signMessage(`LIBRETA Unlock Audit Access: ${timestamp}`);
    await expect(new UnlockVerifierService(config).verifyKey({viewerAddress: wallet.address, signature, timestamp})).rejects.toThrow('Unlock no está configurado');
  });
  it('does not invent signatures for audit reports', () => {
    const report = new UnlockVerifierService(config).generateAuditReport({passportSlug:'test',borrowerWallet:wallet.address,lriScore:0,completedLoans:0,punctualityRate:0,proofs:[]});
    expect(report.signed).toBe(false);
    expect(report).not.toHaveProperty('proof');
  });
});
