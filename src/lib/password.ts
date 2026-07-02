import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function validateAccountPassword(password: string) {
  if (password.length < 8) {
    return "密码至少需要 8 位";
  }
  return null;
}
