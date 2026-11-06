export const EMAIL_SERVICE = 'EMAIL_SERVICE';

export interface SendVerificationEmailInput {
  to: string;
  token: string;
}

export interface SendPasswordResetEmailInput {
  to: string;
  token: string;
}

/**
 * Keep email transport concerns behind this interface. The default console
 * implementation can later be swapped for Resend, Postmark or SMTP.
 */
export interface EmailService {
  sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void>;
}
