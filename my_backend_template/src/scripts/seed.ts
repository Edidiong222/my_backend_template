import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { hashPassword } from '../common/utils/password.util';
import AppDataSource from '../database/data-source';
import { User, UserRole } from '../users/entities/user.entity';

const logger = new Logger('Seed');

async function seed(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin user');
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  await AppDataSource.initialize();

  try {
    const users = AppDataSource.getRepository(User);
    const existing = await users.findOne({ where: { email } });

    if (existing) {
      logger.log(`Admin user ${email} already exists, skipping`);
      return;
    }

    const admin = users.create({
      email,
      passwordHash: await hashPassword(password),
      firstName: process.env.ADMIN_FIRST_NAME ?? 'Admin',
      lastName: process.env.ADMIN_LAST_NAME ?? 'User',
      role: UserRole.ADMIN,
      isEmailVerified: true,
      isActive: true,
    });

    await users.save(admin);
    logger.log(`Admin user ${email} created`);
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
