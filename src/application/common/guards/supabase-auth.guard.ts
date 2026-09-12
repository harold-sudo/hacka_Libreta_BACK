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
    if (!authHeader) {
      // Si no hay encabezado de autenticación, lanzamos Unauthorized
      throw new UnauthorizedException('Encabezado de autorización ausente');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato de token inválido');
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
