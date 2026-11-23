import { describe, it, expect } from 'vitest';
import {
  deriveKeyFromPassphrase,
  encryptText,
  decryptText,
  encryptBlob,
  decryptBlob,
  generateRandomSalt,
} from './crypto';

describe('M4 WebCrypto AES-GCM & PBKDF2 Storage Encryption', () => {
  it('successfully completes encryption and decryption roundtrip for profile text', async () => {
    const passphrase = 'UserMasterPassphrase#2026!';
    const salt = generateRandomSalt();
    const key = await deriveKeyFromPassphrase(passphrase, salt);

    const originalText = '987654321012'; // Sensitive Aadhaar
    const encrypted = await encryptText(originalText, key);

    expect(encrypted.cipherTextHex).toBeDefined();
    expect(encrypted.cipherTextHex).not.toBe(originalText);
    expect(encrypted.ivHex.length).toBe(24); // 12-byte IV in hex

    const decrypted = await decryptText(encrypted.cipherTextHex, encrypted.ivHex, key);
    expect(decrypted).toBe(originalText);
  });

  it('rejects decryption when given the wrong passphrase (PBKDF2)', async () => {
    const correctPassphrase = 'CorrectPassword123';
    const wrongPassphrase = 'WrongPassword456';
    const salt = generateRandomSalt();

    const correctKey = await deriveKeyFromPassphrase(correctPassphrase, salt);
    const wrongKey = await deriveKeyFromPassphrase(wrongPassphrase, salt);

    const originalData = 'PAN: ABCDE1234F';
    const encrypted = await encryptText(originalData, correctKey);

    // Attempting decryption with the wrong key must throw an OperationError
    await expect(decryptText(encrypted.cipherTextHex, encrypted.ivHex, wrongKey)).rejects.toThrow();
  });

  it('encrypts and decrypts document Blobs faithfully', async () => {
    const passphrase = 'SecretKeyForDocuments';
    const salt = generateRandomSalt();
    const key = await deriveKeyFromPassphrase(passphrase, salt);

    const originalContent = 'Sample Marks / Degree Certificate Content';
    const blob = new Blob([originalContent], { type: 'text/plain' });

    const { encryptedBlob, ivHex } = await encryptBlob(blob, key);
    expect(encryptedBlob.byteLength).toBeGreaterThan(0);

    const decryptedBlob = await decryptBlob(encryptedBlob, ivHex, 'text/plain', key);
    const decryptedText = await decryptedBlob.text();

    expect(decryptedText).toBe(originalContent);
  });
});
