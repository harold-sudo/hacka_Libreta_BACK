import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import * as crypto from 'crypto';

@Injectable()
export class CryptoEngineService {
  private readonly defaultSecretKey: string;

  constructor() {
    this.defaultSecretKey =
      process.env.AES_SECRET_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }

  /**
   * Genera el loanId para HSK Chain en formato bytes32 hex (0x...64 chars)
   */
  computeHskLoanId(uuid: string, timestamp: number): string {
    const raw = `${uuid}:${timestamp}`;
    return ethers.keccak256(ethers.toUtf8Bytes(raw));
  }

  /**
   * Genera el hash criptográfico del contrato privado de mutuo off-chain
   */
  computeLoanHash(params: {
    capital: number;
    totalInstallments: number;
    borrowerWallet: string;
    lenderWallet: string;
    salt?: string;
  }): string {
    const salt = params.salt || crypto.randomBytes(16).toString('hex');
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint16', 'address', 'address', 'string'],
      [
        ethers.parseUnits(params.capital.toFixed(2), 2),
        params.totalInstallments,
        params.borrowerWallet,
        params.lenderWallet,
        salt,
      ],
    );
    return ethers.keccak256(encoded);
  }

  /**
   * Genera el receiptHash para certificar el cobro bilateral (efectivo o digital)
   */
  computeReceiptHash(params: {
    loanId: string;
    installmentNumber: number;
    amount: number;
    otp: string;
    timestamp: number;
  }): string {
    const raw = `${params.loanId}:${params.installmentNumber}:${params.amount}:${params.otp}:${params.timestamp}`;
    return ethers.keccak256(ethers.toUtf8Bytes(raw));
  }

  /**
   * Genera código OTP de 6 dígitos numéricos con TTL (default: 300 segundos)
   */
  generateOtp(ttlSeconds = 300): {
    otpCode: string;
    expiresAt: Date;
    challengeHash: string;
  } {
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const challengeHash = ethers.keccak256(
      ethers.toUtf8Bytes(`${otpCode}:${expiresAt.toISOString()}`),
    );

    return {
      otpCode,
      expiresAt,
      challengeHash,
    };
  }

  /**
   * Valida un código OTP presencial contra el valor esperado y expiración
   */
  verifyOtp(inputOtp: string, expectedOtp: string, expiresAt: Date): boolean {
    if (!inputOtp || !expectedOtp) return false;
    if (new Date() > new Date(expiresAt)) return false;
    return inputOtp.trim() === expectedOtp.trim();
  }

  /**
   * Cifrado AES-256-GCM Envelope Encryption para datos PII off-chain
   * Formato de retorno: iv:authTag:encryptedText (en hex)
   */
  encryptPii(plaintext: string, secretKeyHex?: string): string {
    const key = Buffer.from(
      (secretKeyHex || this.defaultSecretKey).slice(0, 64),
      'hex',
    );
    const iv = crypto.randomBytes(12); // 96 bits recomendado para GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Descifrado AES-256-GCM Envelope Encryption
   */
  decryptPii(payload: string, secretKeyHex?: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato inválido de carga cifrada AES-256-GCM');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = Buffer.from(
      (secretKeyHex || this.defaultSecretKey).slice(0, 64),
      'hex',
    );
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Valida la firma HMAC-SHA256 para webhooks de Pollar
   */
  verifyPollarHmac(
    payload: string,
    signature: string,
    secret?: string,
  ): boolean {
    const secretKey =
      secret ||
      process.env.POLLAR_WEBHOOK_SECRET ||
      'libreta_pollar_hmac_secret_2026';

    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature.toLowerCase());
    const expectedBuf = Buffer.from(expectedSignature.toLowerCase());

    if (sigBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }
}
