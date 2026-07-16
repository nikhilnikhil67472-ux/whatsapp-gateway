import crypto from 'node:crypto';

const keyLength = 64;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, keyLength);
  return `scrypt:v1:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) return false;
  const [algorithm, version, saltValue, hashValue] = storedHash.split(':');
  if (algorithm !== 'scrypt' || version !== 'v1' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(saltValue, 'base64url'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
