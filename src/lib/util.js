import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export function appOrigin() {
  return process.env.APP_ORIGIN || 'http://localhost:5173';
}
export function apiOrigin() {
  return process.env.API_PUBLIC_ORIGIN || 'http://localhost:3001';
}
export function addHours(date, h) {
  return new Date(date.getTime() + h * 3600 * 1000);
}
export async function makeHashedOneTimeToken() {
  const plain = crypto.randomBytes(32).toString('hex');
  const hashed = await bcrypt.hash(plain, 12);
  return { plain, hashed };
}
export function makeVerifyLink(tokenId, plain) {
  return `${apiOrigin()}/api/auth/verify?tid=${encodeURIComponent(tokenId)}&t=${encodeURIComponent(plain)}`;
}
export function makeResetLink(tokenId, plain) {
  return `${appOrigin()}/reset?tid=${encodeURIComponent(tokenId)}&t=${encodeURIComponent(plain)}`;
}
