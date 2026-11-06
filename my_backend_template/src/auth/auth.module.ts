import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthToken } from './entities/auth-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { EMAIL_SERVICE, type EmailService } from './interfaces/email-service.interface';
import { ConsoleEmailService } from './services/console-email.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            'jwt.accessExpiresIn',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
    TypeOrmModule.forFeature([RefreshToken, AuthToken]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    LocalAuthGuard,
    {
      provide: EMAIL_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailService => {
        const service = config.getOrThrow<string>('email.service');

        if (service === 'console') {
          return new ConsoleEmailService(config);
        }

        throw new Error(`Unsupported EMAIL_SERVICE: ${service}`);
      },
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
