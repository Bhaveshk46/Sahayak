import { DocumentType } from '../types/profile';

export interface DocumentClassificationResult {
  type: DocumentType;
  confidence: number;
  tags: string[];
}

/**
 * Known synthetic/sample documents text registry
 * Provides instant offline OCR extraction for standard sample documents.
 */
export const KNOWN_SAMPLE_DOCS_TEXT: Record<string, string> = {
  'sample_aadhaar_card': `GOVERNMENT OF INDIA / UIDAI
Unique Identification Authority of India
Name: Aditi Ramesh Sharma
DOB: 14/05/2002
Gender: Female / महिला
Mobile: 9876543210
Address: Flat 402, Shanti Vihar, MG Road, Pune, Maharashtra - 411001
9876 5432 1012
मेरा आधार, मेरी पहचान`,

  'sample_pan_card': `INCOME TAX DEPARTMENT - GOVT. OF INDIA
Name: ADITI RAMESH SHARMA
Father's Name: RAMESH SHARMA
Date of Birth: 14/05/2002
Permanent Account Number: ABCDE1234F
Signature: Aditi Sharma`,

  'sample_bank_passbook': `STATE BANK OF INDIA / भारतीय स्टेट बैंक
SAVINGS BANK PASSBOOK
Branch: Pune Main Branch (00123)
Address: Connaught Road, Pune, Maharashtra 411001
Account Holder Name: Aditi Ramesh Sharma
Account Number: 123456789012
Account Type: Savings Bank
IFSC Code: SBIN0001234
MICR Code: 411002005`,

  'sample_marksheet': `PUNE STATE UNIVERSITY / पुणे विश्वविद्यालय
OFFICIAL STATEMENT OF MARKS & GRADES
BACHELOR OF TECHNOLOGY (COMPUTER SCIENCE & ENGINEERING)
Candidate Name: Aditi Ramesh Sharma
Roll Number: 2021BCSE088
Institution: Pune State University
Course: Bachelor of Technology
Marks Percentage: 88.4%
Result: FIRST CLASS WITH DISTINCTION`,

  'sample_passport_photo': `PASSPORT PHOTO
35mm x 45mm
Candidate: Aditi Ramesh Sharma`,

  'sample_signature': `Signature
Candidate: Aditi Ramesh Sharma
Digital Signature: Aditi Sharma`,
};

/**
 * Standard tags per document type for quick-attach
 */
export const DEFAULT_TAGS_PER_TYPE: Record<DocumentType, string[]> = {
  aadhaar: ['aadhaar', 'identity', 'uidai', 'address_proof'],
  pan: ['pan', 'identity', 'tax', 'income_tax'],
  bank_passbook: ['bank', 'passbook', 'statement', 'cheque'],
  marksheet: ['marksheet', 'education', 'degree', 'transcript', 'academic'],
  income_certificate: ['income', 'financial', 'income_certificate', 'tahsildar'],
  caste_certificate: ['caste', 'category', 'reservation', 'social_welfare'],
  passport_photo: ['photo', 'passport_photo', 'candidate_photo', 'avatar'],
  signature: ['signature', 'candidate_signature', 'sign'],
  other: ['statutory_document', 'attachment'],
};

/**
 * Automatically classifies a document using its filename, extension, and content text.
 */
export function autoClassifyDocument(
  filename: string,
  contentSample?: string
): DocumentClassificationResult {
  const normName = filename.toLowerCase();
  const normContent = (contentSample || '').toLowerCase();

  // 1. Aadhaar
  if (
    normName.includes('aadhaar') ||
    normName.includes('aadhar') ||
    normName.includes('uidai') ||
    normContent.includes('unique identification authority') ||
    normContent.includes('uidai') ||
    normContent.includes('मेरा आधार')
  ) {
    return {
      type: 'aadhaar',
      confidence: 0.95,
      tags: DEFAULT_TAGS_PER_TYPE.aadhaar,
    };
  }

  // 2. PAN
  if (
    normName.includes('pan') ||
    normContent.includes('income tax department') ||
    normContent.includes('permanent account number') ||
    /[a-z]{5}[0-9]{4}[a-z]{1}/i.test(normContent)
  ) {
    return {
      type: 'pan',
      confidence: 0.95,
      tags: DEFAULT_TAGS_PER_TYPE.pan,
    };
  }

  // 3. Bank Passbook / Statement / Cheque
  if (
    normName.includes('bank') ||
    normName.includes('passbook') ||
    normName.includes('cheque') ||
    normName.includes('statement') ||
    normName.includes('sbi') ||
    normName.includes('hdfc') ||
    normName.includes('icici') ||
    normContent.includes('passbook') ||
    normContent.includes('ifsc') ||
    normContent.includes('account number')
  ) {
    return {
      type: 'bank_passbook',
      confidence: 0.9,
      tags: DEFAULT_TAGS_PER_TYPE.bank_passbook,
    };
  }

  // 4. Marksheet / Transcript
  if (
    normName.includes('marksheet') ||
    normName.includes('transcript') ||
    normName.includes('grade') ||
    normName.includes('result') ||
    normName.includes('10th') ||
    normName.includes('12th') ||
    normName.includes('degree') ||
    normName.includes('diploma') ||
    normContent.includes('statement of marks') ||
    normContent.includes('marks percentage') ||
    normContent.includes('university')
  ) {
    return {
      type: 'marksheet',
      confidence: 0.9,
      tags: DEFAULT_TAGS_PER_TYPE.marksheet,
    };
  }

  // 5. Income Certificate
  if (
    normName.includes('income') ||
    normName.includes('salary') ||
    normContent.includes('income certificate') ||
    normContent.includes('annual income')
  ) {
    return {
      type: 'income_certificate',
      confidence: 0.9,
      tags: DEFAULT_TAGS_PER_TYPE.income_certificate,
    };
  }

  // 6. Caste Certificate
  if (
    normName.includes('caste') ||
    normName.includes('community') ||
    normContent.includes('caste certificate') ||
    normContent.includes('scheduled caste') ||
    normContent.includes('backward class')
  ) {
    return {
      type: 'caste_certificate',
      confidence: 0.9,
      tags: DEFAULT_TAGS_PER_TYPE.caste_certificate,
    };
  }

  // 7. Passport Photo
  if (
    normName.includes('photo') ||
    normName.includes('passport_photo') ||
    normName.includes('picture') ||
    normName.includes('profile')
  ) {
    return {
      type: 'passport_photo',
      confidence: 0.85,
      tags: DEFAULT_TAGS_PER_TYPE.passport_photo,
    };
  }

  // 8. Signature
  if (
    normName.includes('sign') ||
    normName.includes('signature') ||
    normContent.includes('signature')
  ) {
    return {
      type: 'signature',
      confidence: 0.9,
      tags: DEFAULT_TAGS_PER_TYPE.signature,
    };
  }

  // Default fallback
  return {
    type: 'other',
    confidence: 0.5,
    tags: DEFAULT_TAGS_PER_TYPE.other,
  };
}

/**
 * Gets synthetic or pre-mapped text content for known sample test documents
 */
export function getKnownSampleDocText(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const [key, text] of Object.entries(KNOWN_SAMPLE_DOCS_TEXT)) {
    if (lower.includes(key.toLowerCase())) {
      return text;
    }
  }
  return null;
}
