import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { hashPassword, verifyPassword } from '../common/utils/password.util';
import { paginate, PaginatedResult } from '../common/helpers/pagination.helper';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserRole } from './entities/user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: UserRole;
  isEmailVerified?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string, includePassword = false): Promise<User | null> {
    const query = this.users
      .createQueryBuilder('user')
      .where('user.email = :email', { email: email.trim().toLowerCase() });

    if (includePassword) {
      query.addSelect('user.passwordHash');
    }

    return query.getOne();
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const user = this.users.create({
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      role: input.role ?? UserRole.USER,
      isEmailVerified: input.isEmailVerified ?? false,
      isActive: true,
    });

    return this.users.save(user);
  }

  async getMe(id: string): Promise<UserResponseDto> {
    const user = await this.findByIdOrFail(id);
    return UserResponseDto.fromEntity(user);
  }

  async updateMe(
    id: string,
    dto: { firstName?: string; lastName?: string },
  ): Promise<UserResponseDto> {
    const user = await this.findByIdOrFail(id);

    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName;
    }

    await this.users.save(user);
    return UserResponseDto.fromEntity(user);
  }

  async list(query: AdminUsersQueryDto): Promise<PaginatedResult<UserResponseDto>> {
    const queryBuilder = this.users.createQueryBuilder('user');

    if (query.search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.role) {
      queryBuilder.andWhere('user.role = :role', { role: query.role });
    }
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: query.isActive });
    }

    const [users, total] = await queryBuilder
      .orderBy('user.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return paginate(
      users.map((user) => UserResponseDto.fromEntity(user)),
      query.page,
      query.limit,
      total,
    );
  }

  async getById(id: string): Promise<UserResponseDto> {
    const user = await this.findByIdOrFail(id);
    return UserResponseDto.fromEntity(user);
  }

  async deactivate(id: string, adminId: string): Promise<UserResponseDto> {
    if (id === adminId) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const admin = await this.findByIdOrFail(adminId);
    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can deactivate users');
    }

    const user = await this.findByIdOrFail(id);
    user.isActive = false;
    await this.users.save(user);
    await this.revokeAllRefreshTokens(user.id);

    return UserResponseDto.fromEntity(user);
  }

  async markEmailVerified(id: string): Promise<void> {
    const user = await this.findByIdOrFail(id);
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      await this.users.save(user);
    }
  }

  async replacePassword(id: string, passwordHash: string): Promise<void> {
    const user = await this.findByIdOrFail(id);
    user.passwordHash = passwordHash;
    await this.users.save(user);
    await this.revokeAllRefreshTokens(user.id);
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from the current password');
    }

    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.passwordHash = await hashPassword(newPassword);
    await this.users.save(user);
    await this.revokeAllRefreshTokens(user.id);
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
