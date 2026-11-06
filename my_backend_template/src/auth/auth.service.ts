import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { parseDurationToMs, generateOpaqueToken, hashToken } from '../common/utils/token.util';
import { hashPassword } from '../common/utils/password.util';
import { UserResponseDto } from '../users/dto/user-response.dto';
import type { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthToken, AuthTokenType } from './entities/auth-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { EMAIL_SERVICE, type EmailService } from './interfaces/email-service.interface';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

export const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'If an account with that email exists, a password reset link has been sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(AuthToken)
    private readonly authTokens: Repository<AuthToken>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    await this.trySendVerificationEmail(user);
    return UserResponseDto.fromEntity(user);
  }

  async login(user: AuthUser): Promise<AuthTokensDto> {
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await this.refreshTokens.findOne({
      where: { userId: user.id, tokenHash },
    });

    // A validly signed token that is missing, expired or already revoked means
    // it was reused. Revoke the whole family as a precaution.
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      await this.revokeAllRefreshTokens(user.id);
      throw new UnauthorizedException('Refresh token has been revoked or reused');
    }

    const consumed = await this.refreshTokens.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    if (!consumed.affected) {
      await this.revokeAllRefreshTokens(user.id);
      throw new UnauthorizedException('Refresh token has been revoked or reused');
    }

    return this.issueTokens({ id: user.id, email: user.email, role: user.role });
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      await this.revokeAllRefreshTokens(userId);
      return;
    }

    await this.refreshTokens.update(
      { userId, tokenHash: hashToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    // Always behave the same whether the account exists or not.
    if (!user) {
      return;
    }

    try {
      const token = await this.createAuthToken(
        user.id,
        AuthTokenType.PASSWORD_RESET,
        this.config.getOrThrow<string>('tokens.passwordResetTtl'),
      );
      await this.emailService.sendPasswordResetEmail({ to: user.email, token });
    } catch (error) {
      this.logEmailFailure('password reset', error);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenRecord = await this.findUsableAuthToken(token, AuthTokenType.PASSWORD_RESET);
    await this.consumeAuthToken(tokenRecord.id);
    await this.usersService.replacePassword(tokenRecord.userId, await hashPassword(newPassword));
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenRecord = await this.findUsableAuthToken(token, AuthTokenType.EMAIL_VERIFICATION);
    await this.consumeAuthToken(tokenRecord.id);
    await this.usersService.markEmailVerified(tokenRecord.userId);
  }

  private async issueTokens(user: AuthUser): Promise<AuthTokensDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessExpiresIn = this.config.getOrThrow<string>('jwt.accessExpiresIn');
    const refreshExpiresIn = this.config.getOrThrow<string>('jwt.refreshExpiresIn');
    const accessExpiresInOption = accessExpiresIn as JwtSignOptions['expiresIn'];
    const refreshExpiresInOption = refreshExpiresIn as JwtSignOptions['expiresIn'];

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: accessExpiresInOption,
    });
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresInOption,
      },
    );

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + parseDurationToMs(refreshExpiresIn)),
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
    };
  }

  private async trySendVerificationEmail(user: User): Promise<void> {
    // Email delivery must never block or fail registration.
    try {
      const token = await this.createAuthToken(
        user.id,
        AuthTokenType.EMAIL_VERIFICATION,
        this.config.getOrThrow<string>('tokens.emailVerificationTtl'),
      );
      await this.emailService.sendVerificationEmail({ to: user.email, token });
    } catch (error) {
      this.logEmailFailure('verification', error);
    }
  }

  private async createAuthToken(userId: string, type: AuthTokenType, ttl: string): Promise<string> {
    const token = generateOpaqueToken();

    await this.authTokens.save(
      this.authTokens.create({
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + parseDurationToMs(ttl)),
      }),
    );

    return token;
  }

  private async findUsableAuthToken(token: string, type: AuthTokenType): Promise<AuthToken> {
    const tokenRecord = await this.authTokens.findOne({
      where: {
        tokenHash: hashToken(token),
        type,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired token');
    }

    return tokenRecord;
  }

  private async consumeAuthToken(id: string): Promise<void> {
    const result = await this.authTokens.update({ id, usedAt: IsNull() }, { usedAt: new Date() });

    if (!result.affected) {
      throw new BadRequestException('Invalid or expired token');
    }
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private logEmailFailure(kind: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Failed to send ${kind} email: ${message}`);
  }
}
