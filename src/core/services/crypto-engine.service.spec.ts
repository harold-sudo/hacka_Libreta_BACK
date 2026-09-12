import * as crypto from 'crypto';
import { CryptoEngineService } from './crypto-engine.service';

describe('CryptoEngineService', () => {
  let service: CryptoEngineService;

  beforeEach(() => {
    process.env.POLLAR_WEBHOOK_SECRET = 'test_pollar_secret';
    service = new CryptoEngineService();
  });

  it('debe generar un hskLoanId en formato bytes32 hex', () => {
    const loanId = service.computeHskLoanId('uuid-123', 1785600000);
    expect(loanId).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('debe generar y verificar un código OTP de 6 dígitos correctamente', () => {
    const challenge = service.generateOtp(300);
    expect(challenge.otpCode).toHaveLength(6);
    expect(challenge.challengeHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const isValid = service.verifyOtp(
      challenge.otpCode,
      challenge.otpCode,
      challenge.expiresAt,
    );
    expect(isValid).toBe(true);

    const isInvalid = service.verifyOtp(
      '000000',
      challenge.otpCode,
      challenge.expiresAt,
    );
    expect(isInvalid).toBe(false);
  });

  it('debe cifrar y descifrar texto PII con AES-256-GCM Envelope Encryption', () => {
    const sensitiveName = 'Rosa Flores Choque';
    const ciphertext = service.encryptPii(sensitiveName);

    expect(ciphertext).not.toBe(sensitiveName);
    expect(ciphertext.split(':')).toHaveLength(3); // iv:authTag:encrypted

    const decrypted = service.decryptPii(ciphertext);
    expect(decrypted).toBe(sensitiveName);
  });

  it('debe verificar firmas HMAC de webhooks de Pollar', () => {
    const payload = JSON.stringify({ event: 'payment.completed' });
    const signature = crypto
      .createHmac('sha256', 'test_pollar_secret')
      .update(payload)
      .digest('hex');

    const isValid = service.verifyPollarHmac(payload, signature);
    expect(isValid).toBe(true);

    const isInvalid = service.verifyPollarHmac(payload, 'wrong_signature');
    expect(isInvalid).toBe(false);
  });
});
