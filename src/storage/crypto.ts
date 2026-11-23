/**
 * WebCrypto AES-GCM & PBKDF2 Storage Encryption
 * Key derived with >=200,000 PBKDF2 iterations with SHA-256 and unique salt.
 * The raw user passphrase is never stored in disk or IndexedDB.
 */

const PBKDF2_ITERATIONS = 200000;
const KEY_LENGTH_BITS = 256;

export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBuffer(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltHex: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const saltBytes = hexToBuffer(saltHex);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

export function generateRandomSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufferToHex(salt);
}

export async function encryptText(
  plainText: string,
  key: CryptoKey
): Promise<{ cipherTextHex: string; ivHex: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    cipherTextHex: bufferToHex(cipherBuffer),
    ivHex: bufferToHex(iv),
  };
}

export async function decryptText(
  cipherTextHex: string,
  ivHex: string,
  key: CryptoKey
): Promise<string> {
  const iv = hexToBuffer(ivHex);
  const cipherBytes = hexToBuffer(cipherTextHex);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    cipherBytes.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

export async function encryptBlob(
  blob: Blob,
  key: CryptoKey
): Promise<{ encryptedBlob: ArrayBuffer; ivHex: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const arrayBuffer = await blob.arrayBuffer();

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );

  return {
    encryptedBlob: encryptedBuffer,
    ivHex: bufferToHex(iv),
  };
}

export async function decryptBlob(
  encryptedBlob: ArrayBuffer,
  ivHex: string,
  mimeType: string,
  key: CryptoKey
): Promise<Blob> {
  const iv = hexToBuffer(ivHex);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encryptedBlob
  );

  return new Blob([decryptedBuffer], { type: mimeType });
}
