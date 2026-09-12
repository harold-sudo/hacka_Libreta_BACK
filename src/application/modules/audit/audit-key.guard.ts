import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuditKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headerKey = request.headers['x-audit-key'];
    const expected = this.configService.get<string>('AUDIT_API_KEY');
    const isDev =
      (this.configService.get<string>('NODE_ENV') ?? 'development') !==
      'production';

    // En desarrollo, si no se configuró clave, se permite el acceso local.
    if (isDev && !expected) return true;
    if (!headerKey || !expected) {
      throw new UnauthorizedException('Clave de auditoría ausente');
    }
    if (headerKey !== expected) {
      throw new UnauthorizedException('Clave de auditoría inválida');
    }
    return true;
  }
}
