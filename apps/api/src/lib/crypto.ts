import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../config/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits para GCM
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    // Em desenvolvimento, deriva uma chave fixa (NÃO usar em produção)
    if (env.NODE_ENV === "development") {
      return scryptSync("dev-key-change-in-production", "salt", KEY_LENGTH);
    }
    throw new Error("ENCRYPTION_KEY não configurada");
  }
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Formato: salt:iv:ciphertext:authtag (base64)
  return `${iv.toString("base64")}:${ciphertext.toString("base64")}:${authTag.toString("base64")}`;
}

export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivB64, ciphertextB64, authTagB64] = encrypted.split(":");
  if (!ivB64 || !ciphertextB64 || !authTagB64) {
    throw new Error("Formato de dado criptografado inválido");
  }
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}