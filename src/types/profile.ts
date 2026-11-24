import { z } from 'zod';

export const DocumentTypeEnum = z.enum([
  'aadhaar',
  'pan',
  'marksheet',
  'income_certificate',
  'caste_certificate',
  'passport_photo',
  'signature',
  'bank_passbook',
  'other',
]);

export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const ProfileRecordSchema = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  sourceDocId: z.string().optional(),
  sourceDocName: z.string().optional(),
  source: z.enum(['sarvam', 'regex', 'manual', 'gemini', 'ocr']),
  verifiedByUser: z.boolean().default(false),
  updatedAt: z.number(),
});

export type ProfileRecord = z.infer<typeof ProfileRecordSchema>;

export const StandardProfileKeysSchema = z.object({
  fullName: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  address: z.string().optional(),
  pincode: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  panNumber: z.string().optional(),
  category: z.string().optional(),
  annualIncome: z.string().optional(),
  institution: z.string().optional(),
  course: z.string().optional(),
  marksPercent: z.string().optional(),
  bankAccount: z.string().optional(),
  ifsc: z.string().optional(),
  bankAccountType: z.string().optional(),
  guardianOccupation: z.string().optional(),
});

export type StandardProfile = z.infer<typeof StandardProfileKeysSchema>;

export function validateExtractorOutput(data: unknown): Partial<StandardProfile> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  let payload: Record<string, unknown> = data as Record<string, unknown>;
  if (payload.extracted_data && typeof payload.extracted_data === 'object') {
    payload = payload.extracted_data as Record<string, unknown>;
  } else if (payload.data && typeof payload.data === 'object') {
    payload = payload.data as Record<string, unknown>;
  } else if (payload.results && typeof payload.results === 'object') {
    payload = payload.results as Record<string, unknown>;
  }

  const cleanObj: Record<string, string> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (val !== undefined && val !== null) {
      cleanObj[key] = String(val).trim();
    }
  }

  const parseResult = StandardProfileKeysSchema.passthrough().safeParse(cleanObj);
  if (!parseResult.success) {
    throw new Error(`Profile schema validation error: ${parseResult.error.message}`);
  }

  return parseResult.data;
}

export interface StoredDocument {
  id: string;
  name: string;
  type: DocumentType;
  mimeType: string;
  sizeBytes: number;
  encryptedBlob: ArrayBuffer;
  iv: string; // Hex IV for AES-GCM
  tags: string[];
  addedAt: number;
  consentGiven: boolean;
  ocrProcessed: boolean;
  ocrExtractedKeys: string[];
}

export interface StoredProfileEntry {
  key: string;
  encryptedValue: string; // Hex-encoded ciphertext
  iv: string; // Hex IV
  confidence: number;
  sourceDocId?: string;
  sourceDocName?: string;
  source: 'sarvam' | 'regex' | 'manual' | 'gemini' | 'ocr';
  verifiedByUser: boolean;
  updatedAt: number;
}
