import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Roles que têm acesso irrestrito — equivalente a superadmin */
const SUPERADMIN_ROLES = ['ADMIN', 'CONTADOR'];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    const userRoles: string[] = Array.isArray(user?.roles)
      ? user.roles
      : (user?.role ? [user.role] : []);

    // SUPERADMIN_ROLES (ADMIN e CONTADOR) têm acesso irrestrito a qualquer rota
    if (userRoles.some(r => SUPERADMIN_ROLES.includes(r))) return true;

    // Demais roles: verificação normal
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
