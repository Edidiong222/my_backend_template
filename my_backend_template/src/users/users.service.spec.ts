import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { hashPassword } from '../common/utils/password.util';
import type { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User, UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

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

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let refreshTokensRepo: { update: jest.Mock };

  beforeEach(() => {
    usersRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn(),
    };
    refreshTokensRepo = { update: jest.fn() };
    service = new UsersService(
      usersRepo as unknown as Repository<User>,
      refreshTokensRepo as unknown as Repository<RefreshToken>,
    );
  });

  it('returns a profile DTO without passwordHash', async () => {
    usersRepo.findOne.mockResolvedValue(buildUser());

    const result = await service.getMe('user-1');

    expect(result.email).toBe('user@example.com');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('updates allowed profile fields', async () => {
    usersRepo.findOne.mockResolvedValue(buildUser());

    const result = await service.updateMe('user-1', { firstName: 'Updated' });

    expect(result.firstName).toBe('Updated');
    expect(usersRepo.save).toHaveBeenCalled();
  });

  it('prevents an admin from deactivating their own account', async () => {
    await expect(service.deactivate('admin-1', 'admin-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects an incorrect current password', async () => {
    const user = buildUser({ passwordHash: await hashPassword('correct-password') });
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
    usersRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(
      service.changePassword('user-1', 'wrong-password', 'new-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changes the password and revokes refresh tokens', async () => {
    const user = buildUser({ passwordHash: await hashPassword('correct-password') });
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
    usersRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    refreshTokensRepo.update.mockResolvedValue({ affected: 2 });

    await service.changePassword('user-1', 'correct-password', 'new-password');

    expect(user.passwordHash).not.toBe('correct-password');
    expect(refreshTokensRepo.update).toHaveBeenCalled();
  });
});
