import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;
export const BCRYPT_PASSWORD_MAX_BYTES = 72;

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
  if (Buffer.byteLength(password, "utf8") > BCRYPT_PASSWORD_MAX_BYTES) {
    return `密码的 UTF-8 编码不能超过 ${BCRYPT_PASSWORD_MAX_BYTES} 字节`;
  }
  return null;
}
