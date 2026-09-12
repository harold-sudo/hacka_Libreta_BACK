import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    const devUserId = request.headers['x-dev-user-id'];

    // Modo desarrollo / Hackathon fallback
    if (devUserId) {
      request.user = { id: devUserId, email: 'dev@libreta.app' };
      return true;
    }

    if (!authHeader) {
      // Si no hay encabezado de autenticación, lanzamos Unauthorized
      throw new UnauthorizedException('Encabezado de autorización ausente');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato de token inválido');
    }

    // Si es un token de prueba en desarrollo
    if (token === 'dev_token' || token.startsWith('mock_')) {
      request.user = {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'mock@libreta.app',
      };
      return true;
    }

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .auth.getUser(token);

      if (error || !data.user) {
        this.logger.warn(`Token inválido: ${error?.message}`);
        throw new UnauthorizedException('Token de sesión no válido o expirado');
      }

      request.user = data.user;
      return true;
    } catch (err: any) {
      this.logger.error(`Error verificando autenticación: ${err.message}`);
      throw new UnauthorizedException('Error de validación de credenciales');
    }
  }
}
