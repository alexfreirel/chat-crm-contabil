import { Module, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';

const jwtLogger = new Logger('AuthModule');

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    jwtLogger.error(
      '⚠️  JWT_SECRET não definido! Usando fallback INSEGURO. Defina JWT_SECRET no .env para produção.',
    );
    return '__INSECURE_DEV_FALLBACK_CHANGE_ME__';
  }
  return secret;
}

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
