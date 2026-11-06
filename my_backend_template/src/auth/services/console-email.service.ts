import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmailService,
  SendPasswordResetEmailInput,
  SendVerificationEmailInput,
} from '../interfaces/email-service.interface';

/** Development email implementation. Replace this provider with a real transport later. */
@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  constructor(private readonly config: ConfigService) {}

  sendVerificationEmail(input: SendVerificationEmailInput): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('app.url');
    const link = `${appUrl}/verify-email?token=${input.token}`;
    this.logger.log(`Verification email for ${input.to}: ${link}`);
    return Promise.resolve();
  }

  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('app.url');
    const link = `${appUrl}/reset-password?token=${input.token}`;
    this.logger.log(`Password reset email for ${input.to}: ${link}`);
    return Promise.resolve();
  }
}
