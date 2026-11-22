import type { AppLanguage } from '../types/ledger.ts';

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Pure-JS FIPS 180-4 SHA-256 so PIN/recovery hashing works identically across
 * both HTTPS/localhost (SubtleCrypto) and plain HTTP mobile LAN sessions.
 */
export function sha256HexPure(message: string): string {
  const utf8 = new TextEncoder().encode(message);
  const bitLen = utf8.length * 8;
  const paddedLen = Math.ceil((utf8.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(utf8);
  padded[utf8.length] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  view.setUint32(paddedLen - 8, highBits, false);
  view.setUint32(paddedLen - 4, lowBits, false);

  const hash = SHA256_INIT.slice();
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((n) => n.toString(16).padStart(8, '0')).join('');
}

function legacyFallbackHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const salted = `carnet-dh-pin::${input}::v1`;
  for (let i = 0; i < salted.length; i += 1) {
    const c = salted.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `fb:${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

async function computeSaltedSha256(payload: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    try {
      const data = new TextEncoder().encode(payload);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
      const bytes = Array.from(new Uint8Array(digest));
      const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `sha256:${hex}`;
    } catch {
      // Fallback to identical pure-JS SHA-256
    }
  }
  return `sha256:${sha256HexPure(payload)}`;
}

export async function hashPin(pin: string, lang: AppLanguage = 'fr'): Promise<string> {
  const clean = pin.trim();
  if (!/^\d{4}$/.test(clean)) {
    throw new Error(
      lang === 'ar'
        ? 'يجب أن يتكوّن رمز PIN من 4 أرقام بالضبط.'
        : 'Le code PIN doit contenir exactement 4 chiffres.'
    );
  }
  return computeSaltedSha256(`carnet-dh-pin::${clean}::v1`);
}

export async function verifyPin(pin: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) return false;
  const clean = pin.trim();
  if (!/^\d{4}$/.test(clean)) return false;

  if (storedHash.startsWith('fb:')) {
    return legacyFallbackHash(clean) === storedHash;
  }

  const computed = await hashPin(clean);
  return computed === storedHash;
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function hashRecoveryAnswer(answer: string): Promise<string> {
  const norm = normalizeAnswer(answer);
  if (norm.length < 2) {
    throw new Error('Réponse de récupération trop courte.');
  }
  return computeSaltedSha256(`carnet-dh-rec::${norm}::v1`);
}

export async function verifyRecoveryAnswer(
  answer: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (!storedHash) return false;
  const norm = normalizeAnswer(answer);
  if (!norm) return false;
  const computed = await computeSaltedSha256(`carnet-dh-rec::${norm}::v1`);
  return computed === storedHash;
}

export function canUseStrongEncryption(): boolean {
  return (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  );
}

export interface EncryptedBackupEnvelope {
  app: 'carnet-de-credit';
  encrypted: true;
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const rawKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isEncryptedBackupText(rawText: string): boolean {
  try {
    const parsed = JSON.parse(rawText) as Partial<EncryptedBackupEnvelope>;
    return Boolean(
      parsed &&
        typeof parsed === 'object' &&
        parsed.app === 'carnet-de-credit' &&
        parsed.encrypted === true &&
        typeof parsed.ciphertext === 'string'
    );
  } catch {
    return false;
  }
}

export async function encryptBackupJSON(
  plainJson: string,
  passphrase: string,
  lang: AppLanguage = 'fr'
): Promise<string> {
  if (!canUseStrongEncryption()) {
    throw new Error(
      lang === 'ar'
        ? 'التشفير القوي يتطلب فتح التطبيق عبر HTTPS أو localhost.'
        : 'Le chiffrement fort nécessite un contexte sécurisé (HTTPS ou localhost).'
    );
  }
  if (!passphrase || passphrase.length < 4) {
    throw new Error(
      lang === 'ar'
        ? 'يجب أن تحتوي كلمة سر النسخة على 4 أحرف على الأقل.'
        : 'Le mot de passe doit contenir au moins 4 caractères.'
    );
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const iterations = 100000;
  const key = await deriveAesKey(passphrase, salt, iterations);

  const encryptedBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(plainJson)
  );

  const envelope: EncryptedBackupEnvelope = {
    app: 'carnet-de-credit',
    encrypted: true,
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuf)),
  };

  return JSON.stringify(envelope, null, 2);
}

export async function decryptBackupJSON(
  rawEncrypted: string,
  passphrase: string,
  lang: AppLanguage = 'fr'
): Promise<string> {
  if (!canUseStrongEncryption()) {
    throw new Error(
      lang === 'ar'
        ? 'فك التشفير يتطلب فتح التطبيق عبر HTTPS أو localhost.'
        : 'Le déchiffrement nécessite un contexte sécurisé (HTTPS ou localhost).'
    );
  }

  let env: Partial<EncryptedBackupEnvelope>;
  try {
    env = JSON.parse(rawEncrypted) as Partial<EncryptedBackupEnvelope>;
  } catch {
    throw new Error(
      lang === 'ar' ? 'ملف مشفر غير صالح.' : 'Fichier chiffré invalide.'
    );
  }

  if (!env.salt || !env.iv || !env.ciphertext) {
    throw new Error(
      lang === 'ar' ? 'بنية الملف المشفر ناقصة.' : 'Structure chiffrée incomplète.'
    );
  }

  try {
    const salt = base64ToBytes(env.salt);
    const iv = base64ToBytes(env.iv);
    const cipherBytes = base64ToBytes(env.ciphertext);
    const iterations = typeof env.iterations === 'number' ? env.iterations : 100000;
    const key = await deriveAesKey(passphrase, salt, iterations);

    const decryptedBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(cipherBytes)
    );

    return new TextDecoder().decode(decryptedBuf);
  } catch {
    throw new Error(
      lang === 'ar'
        ? 'كلمة السر غير صحيحة أو الملف تالف.'
        : 'Mot de passe incorrect ou fichier endommagé.'
    );
  }
}
