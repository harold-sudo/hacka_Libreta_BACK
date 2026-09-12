import { createHmac } from 'crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CryptoEngineService } from '../../../core/services/crypto-engine.service';
import { WebhooksService } from './webhooks.service';

describe('Pollar legacy webhook', () => {
  const body = '{ "event": "payment.completed" }';
  const oldSecret = process.env.POLLAR_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.POLLAR_WEBHOOK_SECRET = 'test-secret';
  });
  afterEach(() => {
    if (oldSecret === undefined) delete process.env.POLLAR_WEBHOOK_SECRET;
    else process.env.POLLAR_WEBHOOK_SECRET = oldSecret;
  });
  const service = () => new WebhooksService(new CryptoEngineService());
  it.each([undefined, '', 'wrong'])(
    'rejects missing or invalid signature %s',
    (signature) => {
      expect(() => service().handlePollarWebhook(signature, body)).toThrow(
        UnauthorizedException,
      );
    },
  );
  it('does not use a default secret when configuration is absent', () => {
    delete process.env.POLLAR_WEBHOOK_SECRET;
    const signature = createHmac('sha256', 'libreta_pollar_hmac_secret_2026')
      .update(body)
      .digest('hex');
    expect(() => service().handlePollarWebhook(signature, body)).toThrow(
      UnauthorizedException,
    );
  });
  it('does not settle loans even with a valid legacy signature', () => {
    const signature = createHmac('sha256', 'test-secret')
      .update(body)
      .digest('hex');
    expect(() => service().handlePollarWebhook(signature, body)).toThrow(
      ServiceUnavailableException,
    );
    expect(() =>
      service().handlePollarWebhook(
        signature,
        JSON.stringify(JSON.parse(body)),
      ),
    ).toThrow(UnauthorizedException);
  });
});
