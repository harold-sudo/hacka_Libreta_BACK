import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CryptoEngineService } from '../../../core/services/crypto-engine.service';

@Injectable()
export class WebhooksService {
  constructor(private readonly cryptoEngine: CryptoEngineService) {}

  handlePollarWebhook(signature: string | undefined, rawPayload: string) {
    if (
      !signature ||
      !rawPayload ||
      !this.cryptoEngine.verifyPollarHmac(rawPayload, signature)
    ) {
      throw new UnauthorizedException('Firma de webhook Pollar no válida');
    }
    // The legacy EVM event schema was never verified against Pollar's API.
    throw new ServiceUnavailableException(
      'Webhook pendiente de integrar con el contrato de eventos oficial de Pollar',
    );
  }
}
