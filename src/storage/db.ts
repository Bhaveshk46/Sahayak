import Dexie, { Table } from 'dexie';
import { StoredDocument, StoredProfileEntry, ProfileRecord, DocumentType } from '../types/profile';
import {
  deriveKeyFromPassphrase,
  encryptText,
  decryptText,
  encryptBlob,
  decryptBlob,
  generateRandomSalt,
} from './crypto';

export interface CachedFormMapping {
  formSignature: string;
  origin: string;
  mappings: Array<{
    fieldId: string;
    profileKey: string | null;
    confidence: number;
    reason: string;
    isManualOverride?: boolean;
  }>;
  updatedAt: number;
}

export class FormPilotDatabase extends Dexie {
  documents!: Table<StoredDocument, string>;
  profile!: Table<StoredProfileEntry, string>;
  settings!: Table<{ key: string; value: string }, string>;
  mappingCache!: Table<CachedFormMapping, string>;

  constructor() {
    super('FormPilotDB');
    this.version(1).stores({
      documents: 'id, name, type, addedAt',
      profile: 'key, confidence, source, sourceDocId, updatedAt',
      settings: 'key',
    });
    this.version(2).stores({
      mappingCache: 'formSignature, origin, updatedAt',
    });
  }
}

export const db = new FormPilotDatabase();

// In-memory active encryption key during unlocked session
let activeCryptoKey: CryptoKey | null = null;

export function isStorageUnlocked(): boolean {
  return activeCryptoKey !== null;
}

export function lockStorage(): void {
  activeCryptoKey = null;
}

export async function initializeOrUnlockStorage(passphrase: string): Promise<boolean> {
  const existingSaltRecord = await db.settings.get('storage_salt');
  let salt = existingSaltRecord?.value;

  if (!salt) {
    salt = generateRandomSalt();
    await db.settings.put({ key: 'storage_salt', value: salt });
  }

  const key = await deriveKeyFromPassphrase(passphrase, salt);

  // Verification token check
  const verificationRecord = await db.settings.get('passphrase_verifier');
  if (verificationRecord) {
    const parts = verificationRecord.value.split(':');
    try {
      const decrypted = await decryptText(parts[0], parts[1], key);
      if (decrypted !== 'FORMPILOT_UNLOCK_OK') {
        return false;
      }
    } catch {
      return false; // Decryption failed with wrong key
    }
  } else {
    // First time setup: store encrypted verification canary
    const canary = await encryptText('FORMPILOT_UNLOCK_OK', key);
    await db.settings.put({
      key: 'passphrase_verifier',
      value: `${canary.cipherTextHex}:${canary.ivHex}`,
    });
  }

  activeCryptoKey = key;
  return true;
}

export async function saveDocument(
  file: File | Blob,
  name: string,
  type: DocumentType,
  tags: string[] = []
): Promise<StoredDocument> {
  if (!activeCryptoKey) throw new Error('Storage is locked. Please unlock first.');

  const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const { encryptedBlob, ivHex } = await encryptBlob(file, activeCryptoKey);

  const docRecord: StoredDocument = {
    id,
    name,
    type,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    encryptedBlob,
    iv: ivHex,
    tags,
    addedAt: Date.now(),
    consentGiven: false,
    ocrProcessed: false,
    ocrExtractedKeys: [],
  };

  await db.documents.put(docRecord);
  return docRecord;
}

export async function getDocumentDecryptedBlob(id: string): Promise<Blob> {
  if (!activeCryptoKey) throw new Error('Storage is locked. Please unlock first.');
  const doc = await db.documents.get(id);
  if (!doc) throw new Error('Document not found');

  return decryptBlob(doc.encryptedBlob, doc.iv, doc.mimeType, activeCryptoKey);
}

export async function getAllStoredDocuments(): Promise<Array<Omit<StoredDocument, 'encryptedBlob'>>> {
  const docs = await db.documents.toArray();
  return docs.map(({ encryptedBlob, ...rest }) => rest);
}

export async function updateDocumentMetadata(
  id: string,
  updates: { name?: string; type?: DocumentType; tags?: string[] }
): Promise<void> {
  const doc = await db.documents.get(id);
  if (!doc) throw new Error('Document not found');
  await db.documents.update(id, updates);
}

export async function deleteDocument(id: string): Promise<void> {
  await db.documents.delete(id);
  // Also remove profile entries originated from this document safely
  try {
    const allProfileEntries = await db.profile.toArray();
    for (const entry of allProfileEntries) {
      if (entry.sourceDocId === id) {
        await db.profile.delete(entry.key);
      }
    }
  } catch (err) {
    console.warn('Failed to clean up profile records for deleted doc:', err);
  }
}

export async function saveProfileRecord(record: {
  key: string;
  value: string;
  confidence: number;
  sourceDocId?: string;
  sourceDocName?: string;
  source: 'sarvam' | 'regex' | 'manual' | 'gemini' | 'ocr';
  verifiedByUser?: boolean;
}): Promise<void> {
  if (!activeCryptoKey) throw new Error('Storage is locked. Please unlock first.');

  const { cipherTextHex, ivHex } = await encryptText(record.value, activeCryptoKey);

  const entry: StoredProfileEntry = {
    key: record.key,
    encryptedValue: cipherTextHex,
    iv: ivHex,
    confidence: record.confidence,
    sourceDocId: record.sourceDocId,
    sourceDocName: record.sourceDocName,
    source: record.source,
    verifiedByUser: record.verifiedByUser ?? false,
    updatedAt: Date.now(),
  };

  await db.profile.put(entry);
}

export async function getAllDecryptedProfileRecords(): Promise<ProfileRecord[]> {
  if (!activeCryptoKey) throw new Error('Storage is locked. Please unlock first.');

  const entries = await db.profile.toArray();
  const records: ProfileRecord[] = [];

  for (const entry of entries) {
    try {
      const decryptedVal = await decryptText(entry.encryptedValue, entry.iv, activeCryptoKey);
      records.push({
        key: entry.key,
        value: decryptedVal,
        confidence: entry.confidence,
        sourceDocId: entry.sourceDocId,
        sourceDocName: entry.sourceDocName,
        source: entry.source,
        verifiedByUser: entry.verifiedByUser,
        updatedAt: entry.updatedAt,
      });
    } catch {
      // Corrupt record skipped
    }
  }

  return records;
}

export async function deleteProfileRecord(key: string): Promise<void> {
  await db.profile.delete(key);
}

export async function clearAllStorageData(): Promise<void> {
  await db.documents.clear();
  await db.profile.clear();
  await db.settings.clear();
  await db.mappingCache.clear();
  activeCryptoKey = null;
}

export async function getCachedMapping(formSignature: string): Promise<CachedFormMapping | undefined> {
  try {
    return await db.mappingCache.get(formSignature);
  } catch (err) {
    console.warn('[FormPilot DB] Error retrieving cached mapping:', err);
    return undefined;
  }
}

export async function setCachedMapping(
  formSignature: string,
  origin: string,
  mappings: CachedFormMapping['mappings']
): Promise<void> {
  try {
    await db.mappingCache.put({
      formSignature,
      origin,
      mappings,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[FormPilot DB] Error saving cached mapping:', err);
  }
}

export async function clearMappingCache(): Promise<void> {
  try {
    await db.mappingCache.clear();
  } catch (err) {
    console.warn('[FormPilot DB] Error clearing mapping cache:', err);
  }
}
