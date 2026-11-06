import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import type { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import type { AuthToken } from './entities/auth-token.entity';
import type { RefreshToken } from './entities/refresh-token.entity';
import type { EmailService } from './interfaces/email-service.interface';

const refreshExpiresIn = '7d';

function buildUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    firstName: 'Test',
    lastName: 'User',
    role: UserRole.USER,
    isEmailVerified: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('AuthService', () => {
  let service: AuthService;
  let refreshTokensRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let authTokensRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let usersService: {
    findByEmail: jest.Mock;
    createUser: jest.Mock;
    findById: jest.Mock;
    replacePassword: jest.Mock;
    markEmailVerified: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let emailService: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };

  const configValues: Record<string, unknown> = {
    'jwt.accessSecret': 'access-secret-that-is-long-enough-123456',
    'jwt.refreshSecret': 'refresh-secret-that-is-long-enough-123456',
    'jwt.accessExpiresIn': '15m',
    'jwt.refreshExpiresIn': refreshExpiresIn,
    'tokens.emailVerificationTtl': '24h',
    'tokens.passwordResetTtl': '1h',
  };

  beforeEach(() => {
    refreshTokensRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    authTokensRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    usersService = {
      findByEmail: jest.fn(),
      createUser: jest.fn(),
      findById: jest.fn(),
      replacePassword: jest.fn(),
      markEmailVerified: jest.fn(),
    };
    jwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };
    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    const config = {
      getOrThrow: jest.fn((key: string) => configValues[key]),
    };

    service = new AuthService(
      refreshTokensRepo as unknown as Repository<RefreshToken>,
      authTokensRepo as unknown as Repository<AuthToken>,
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
      emailService as unknown as EmailService,
    );
  });

  it('registers a user and sends a verification email', async () => {
    const user = buildUser();
    usersService.findByEmail.mockResolvedValue(null);
    usersService.createUser.mockResolvedValue(user);

    const result = await service.register({
      email: 'user@example.com',
      password: 'strong-password',
    });

    expect(result.email).toBe('user@example.com');
    expect(usersService.createUser).toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).toHaveBeenCalled();
  });

  it('still registers when the verification email fails', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.createUser.mockResolvedValue(buildUser());
    emailService.sendVerificationEmail.mockRejectedValue(new Error('mail provider down'));

    await expect(
      service.register({ email: 'user@example.com', password: 'strong-password' }),
    ).resolves.toBeDefined();
  });

  it('issues and stores only a hash of the refresh token', async () => {
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    const user = buildUser();

    const result = await service.login({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    const saved = refreshTokensRepo.save.mock.calls[0][0] as RefreshToken;
    expect(saved.tokenHash).toHaveLength(64);
    expect(saved.tokenHash).not.toBe('refresh-token');
  });

  it('rejects a reused refresh token and revokes all remaining tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'user@example.com',
      role: UserRole.USER,
    });
    usersService.findById.mockResolvedValue(buildUser());
    refreshTokensRepo.findOne.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      tokenHash: 'stored-hash',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.refresh('reused-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokensRepo.update).toHaveBeenCalled();
  });

  it('does not reveal whether an email exists on forgot password', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.forgotPassword({ email: 'missing@example.com' })).resolves.toBeUndefined();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('resets a password with a valid single-use token', async () => {
    authTokensRepo.findOne.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
    });

    await service.resetPassword('raw-token', 'new-password');

    expect(authTokensRepo.update).toHaveBeenCalled();
    expect(usersService.replacePassword).toHaveBeenCalledWith('user-1', expect.any(String));
  });
});
