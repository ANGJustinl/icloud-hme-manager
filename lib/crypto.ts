import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * 应用层 Cookie 加密。
 *
 * 为什么需要：Cookie 是 iCloud 登录凭证，等同账号密码。SQLite 文件落盘时
 * 若明文存储，任何能读取该文件的人/进程都能直接盗用账号。AES-256-GCM
 * 提供机密性 + 完整性（防篡改），密钥不落库。
 */

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function ensureKey(): Buffer {
  if (cachedKey) return cachedKey;

  let raw = process.env.ENCRYPTION_KEY?.trim();

  if (!raw) {
    // 本地开发友好：自动生成并写入 .env.local
    raw = bootstrapLocalKey();
  }

  // 接受 64 位 hex（推荐）或任意 passphrase（用 scrypt 派生）
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    // passphrase → 32 字节密钥（固定 salt 仅用于本应用内部一致性）
    key = scryptSync(raw, "icloud-hme-manager-salt", KEY_LEN);
  }

  if (key.length !== KEY_LEN) {
    throw new Error(`ENCRYPTION_KEY 派生后长度异常: ${key.length}`);
  }
  cachedKey = key;
  return key;
}

function bootstrapLocalKey(): string {
  const generated = randomBytes(KEY_LEN).toString("hex");
  const envPath = join(process.cwd(), ".env.local");
  const line = `ENCRYPTION_KEY=${generated}\n`;
  try {
    let existing = "";
    if (existsSync(envPath)) {
      existing = readFileSync(envPath, "utf8");
    }
    // 避免重复写入
    if (!/ENCRYPTION_KEY\s*=/.test(existing)) {
      writeFileSync(envPath, existing + (existing.endsWith("\n") || existing === "" ? "" : "\n") + line, "utf8");
    }
  } catch {
    // 写入失败也不阻塞，直接用内存值（进程重启后失效）
  }
  return generated;
}

/** 加密明文，返回 base64(IV || ciphertext || tag) */
export function encrypt(plain: string): string {
  const key = ensureKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

/** 解密 encrypt() 的输出 */
export function decrypt(payload: string): string {
  const key = ensureKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("密文长度异常，无法解密");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const enc = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/** 生成随机 hex 密钥（供 .env.example 说明 / 文档使用） */
export function generateHexKey(): string {
  return randomBytes(KEY_LEN).toString("hex");
}
