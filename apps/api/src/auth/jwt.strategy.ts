import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      new Logger('JwtStrategy').error(
        '⚠️  JWT_SECRET não definido! Usando fallback INSEGURO.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || '__INSECURE_DEV_FALLBACK_CHANGE_ME__',
    });
  }

  async validate(payload: any) {
    return { id: payload.sub, email: payload.email, role: payload.role, tenant_id: payload.tenant_id };
  }
}
