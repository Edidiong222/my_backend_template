import { createHash, randomBytes } from 'node:crypto';

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Generates a high-entropy opaque token for email verification / password reset. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hashes a token before it is persisted. Tokens are random 256-bit values, so a
 * deterministic hash allows lookup without storing the raw secret.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Parses a simple duration string such as `15m`, `24h` or `7d` into milliseconds. */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration value: ${value}`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];

  return amount * DURATION_UNITS[unit];
}
