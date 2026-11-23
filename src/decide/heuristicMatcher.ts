import Fuse from 'fuse.js';
import { FormField } from '../types';
import { DocumentType } from '../types/profile';

export interface HeuristicMatchResult {
  fieldId: string;
  profileKey: string | null;
  confidence: number; // 0.0 to 1.0
  reason: string;
  isIframe?: boolean;
}

export interface FileSlotMatchResult {
  fieldId: string;
  documentType: DocumentType;
  confidence: number;
  reason: string;
}

/**
 * Normalizes input strings by converting to lowercase, trimming,
 * and replacing common punctuation with single spaces.
 */
export function normalizeLabel(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[_\-.:/\\()[\]{}|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comprehensive multi-lingual synonym mapping for Indian statutory and government forms.
 * Covers English, Hindi, and Marathi terms commonly used on state/central portals.
 */
export const PROFILE_KEY_SYNONYMS: Record<string, { description: string; synonyms: string[] }> = {
  firstName: {
    description: "Applicant's first name or given name",
    synonyms: [
      'first name', 'given name', 'forename', 'first legal name', 'applicant first name',
      'पहिले नाव', 'प्रथम नाम'
    ],
  },
  lastName: {
    description: "Applicant's last name, surname, or family name",
    synonyms: [
      'last name', 'surname', 'family name', 'last legal name', 'applicant last name',
      'आडनाव', 'उपनाम'
    ],
  },
  fullName: {
    description: "Applicant's full legal name as per government records or identity cards",
    synonyms: [
      'full name', 'applicant name', 'candidate name', 'student name', 'legal name',
      'name of applicant', 'name of candidate', 'name of student', 'beneficiary name',
      'account holder name', 'holder name', 'enter name', 'your name', 'name',
      // Hindi / Marathi
      'नाम', 'नाव', 'उमेदवाराचे नाव', 'आवेदक का नाम', 'विद्यार्थ्याचे नाव', 'विद्यार्थी का नाम',
      'पूर्ण नाव', 'पूरा नाम', 'विद्यार्थ्याचे पूर्ण नाव', 'लाभार्थीचे नाव', 'खातेदाराचे नाव'
    ],
  },
  fatherName: {
    description: "Father's or legal guardian's name",
    synonyms: [
      'father name', 'father s name', 'fathers name', 'father', 'guardian name',
      'husband name', 'spouse name', 'parent name',
      // Hindi / Marathi
      'वडिलांचे नाव', 'पिता का नाम', 'पालकांचे नाव', 'अभिभावक का नाम', 'पतीचे नाव',
      'पति का नाम', 'वडिलांचे पूर्ण नाव', 'पिताजी का नाम'
    ],
  },
  motherName: {
    description: "Mother's full name",
    synonyms: [
      'mother name', 'mother s name', 'mothers name', 'mother',
      // Hindi / Marathi
      'आईचे नाव', 'माता का नाम', 'मातेचे नाव', 'आईचे पूर्ण नाव'
    ],
  },
  dob: {
    description: 'Date of birth',
    synonyms: [
      'date of birth', 'dob', 'birth date', 'birthdate', 'born on', 'd o b',
      // Hindi / Marathi
      'जन्मतारीख', 'जन्म तारीख', 'जन्म दिनांक', 'जन्म तिथि', 'जन्मतिथी', 'जन्म दिवस'
    ],
  },
  gender: {
    description: 'Gender or sex of the applicant',
    synonyms: [
      'gender', 'sex', 'male female', 'applicant gender',
      // Hindi / Marathi
      'लिंग'
    ],
  },
  mobile: {
    description: 'Primary mobile or phone number',
    synonyms: [
      'mobile number', 'phone number', 'mobile no', 'phone no', 'contact number',
      'contact no', 'cell number', 'cell phone', 'telephone', 'mobile', 'phone', 'whatsapp number',
      // Hindi / Marathi
      'मोबाईल', 'मोबाईल क्र', 'मोबाईल नंबर', 'भ्रमणध्वनी', 'फोन', 'फोन नंबर', 'दूरध्वनी', 'संपर्क क्रमांक'
    ],
  },
  email: {
    description: 'Email address',
    synonyms: [
      'email address', 'email id', 'e mail', 'email', 'mail id', 'mail address',
      // Hindi / Marathi
      'ईमेल', 'ई मेल', 'ईमेल आयडी'
    ],
  },
  aadhaarNumber: {
    description: '12-digit Aadhaar (UIDAI) number',
    synonyms: [
      'aadhaar number', 'aadhaar no', 'aadhar number', 'aadhar no', 'aadhaar card',
      'aadhar card', 'aadhaar', 'aadhar', 'uidai', 'uid no', 'uid number', 'uid', 'enter 12 digit uid',
      // Hindi / Marathi
      'आधार क्रमांक', 'आधार कार्ड', 'आधार नंबर', 'आधार', 'युआयडी'
    ],
  },
  panNumber: {
    description: '10-character Permanent Account Number (PAN)',
    synonyms: [
      'pan number', 'pan no', 'pan card number', 'pan card', 'permanent account number',
      'pan', 'enter 10 digit pan',
      // Hindi / Marathi
      'पॅन क्रमांक', 'पॅन कार्ड', 'पैन नंबर', 'पैन कार्ड', 'पॅन', 'पैन'
    ],
  },
  address: {
    description: 'Residential or permanent communication address',
    synonyms: [
      'residential address', 'permanent address', 'correspondence address',
      'current address', 'communication address', 'street address', 'home address', 'address',
      // Hindi / Marathi
      'पत्ता', 'पता', 'मुक्काम पोस्ट', 'कायमचा पत्ता', 'स्थायी पता', 'वर्तमान पता', 'घराचा पत्ता'
    ],
  },
  pincode: {
    description: '6-digit Postal PIN code',
    synonyms: [
      'pin code', 'pincode', 'postal code', 'zip code', 'pin', 'zip',
      // Hindi / Marathi
      'पिन कोड', 'पिनकोड', 'पिन'
    ],
  },
  category: {
    description: 'Social or reservation category (General, OBC, SC, ST, EWS)',
    synonyms: [
      'reservation category', 'social category', 'caste category', 'caste', 'category',
      'community', 'sub caste',
      // Hindi / Marathi
      'प्रवर्ग', 'जात', 'वर्ग', 'आरक्षण प्रवर्ग', 'श्रेणी', 'सामाजिक प्रवर्ग'
    ],
  },
  annualIncome: {
    description: 'Annual family or household income in Indian Rupees (INR)',
    synonyms: [
      'annual family income', 'annual income', 'family annual income', 'family income',
      'household income', 'total income', 'gross income', 'income in inr', 'annual income inr',
      // Hindi / Marathi
      'वार्षिक उत्पन्न', 'उत्पन्न', 'कुटुंबाचे वार्षिक उत्पन्न', 'पारिवारिक वार्षिक आय', 'वार्षिक आय', 'कौटुंबिक उत्पन्न'
    ],
  },
  institution: {
    description: 'School, college, or university name',
    synonyms: [
      'college name', 'institution name', 'university name', 'school name', 'institute',
      'college', 'university', 'school', 'institution', 'name of college', 'name of institute',
      // Hindi / Marathi
      'महाविद्यालय', 'शाळा महाविद्यालय', 'संस्था', 'कॉलेज', 'विश्वविद्यालय', 'संस्थान का नाम', 'महाविद्यालयाचे नाव'
    ],
  },
  course: {
    description: 'Degree, academic course, program, or stream',
    synonyms: [
      'course name', 'degree', 'qualification', 'program', 'academic stream', 'stream',
      'branch', 'class', 'course', 'degree program',
      // Hindi / Marathi
      'अभ्यासक्रम', 'कोर्स', 'वर्ग इयत्ता', 'पदवी', 'पाठ्यक्रम', 'शाखा', 'इयत्ता'
    ],
  },
  marksPercent: {
    description: 'Marks percentage, aggregate percentage, or CGPA',
    synonyms: [
      'marks percentage', 'percentage', 'marks percent', 'aggregate percentage',
      'percentage of marks', 'cgpa', 'marks obtained', 'total marks', 'percent',
      // Hindi / Marathi
      'टक्केवारी', 'गुण', 'गुणांची टक्केवारी', 'प्रतिशत', 'प्राप्तांक', 'एकूण गुण'
    ],
  },
  bankAccount: {
    description: 'Bank account number',
    synonyms: [
      'bank account number', 'account number', 'bank account no', 'account no',
      'bank account', 'a c number', 'a c no', 'acc no',
      // Hindi / Marathi
      'बँक खाते क्रमांक', 'खाते क्र', 'खाता संख्या', 'बैंक खाता संख्या', 'खाता क्र'
    ],
  },
  ifsc: {
    description: 'Bank branch 11-character IFSC code',
    synonyms: [
      'ifsc code', 'bank ifsc', 'branch ifsc', 'ifsc', 'rtgs code',
      // Hindi / Marathi
      'आयएफएससी', 'आय एफ एस सी', 'आईएफएससी', 'आई एफ एस सी'
    ],
  },
  bankAccountType: {
    description: 'Type of bank account (Savings, Current)',
    synonyms: [
      'bank account type', 'account type', 'type of account',
      // Hindi / Marathi
      'खात्याचा प्रकार', 'खाते प्रकार', 'खाता प्रकार', 'खाता का प्रकार'
    ],
  },
  guardianOccupation: {
    description: "Guardian's, parent's, or father's occupation or profession",
    synonyms: [
      'guardian occupation', 'parent occupation', 'father occupation', 'mother occupation',
      'occupation', 'profession', 'guardian profession', 'parent profession',
      'guardian_occupation', 'occupation of guardian', 'occupation of parent',
      // Hindi / Marathi
      'पालकांचा व्यवसाय', 'व्यवसाय', 'अभिभावक का व्यवसाय', 'पालक व्यवसाय', 'वडिलांचा व्यवसाय'
    ],
  },
};

export const DOCUMENT_SLOT_SYNONYMS: Record<DocumentType, string[]> = {
  aadhaar: [
    'aadhaar card', 'aadhar card', 'aadhaar', 'aadhar', 'uidai card', 'uid card',
    'आधार कार्ड', 'आधार'
  ],
  pan: [
    'pan card', 'pan copy', 'pan', 'पॅन कार्ड', 'पैन कार्ड', 'पॅन', 'पैन'
  ],
  income_certificate: [
    'income certificate', 'income proof', 'family income certificate',
    'उत्पन्न दाखला', 'आय प्रमाण पत्र', 'उत्पन्नाचा दाखला'
  ],
  caste_certificate: [
    'caste certificate', 'category certificate', 'community certificate',
    'जातीचा दाखला', 'जाति प्रमाण पत्र', 'जात प्रमाणपत्र'
  ],
  marksheet: [
    'marksheet', 'grade card', 'mark sheet', '10th marksheet', '12th marksheet',
    'ssc marksheet', 'hsc marksheet', 'transcript', 'degree certificate',
    'गुणपत्रिका', 'अंकसूची', 'दहावी गुणपत्रिका'
  ],
  passport_photo: [
    'passport photo', 'passport size photo', 'photograph', 'photo', 'candidate photo', 'applicant photo',
    'पासपोर्ट फोटो', 'छायाचित्र', 'फोटो'
  ],
  signature: [
    'signature', 'candidate signature', 'sign', 'specimen signature',
    'स्वाक्षरी', 'हस्ताक्षर', 'सही'
  ],
  bank_passbook: [
    'bank passbook', 'cancelled cheque', 'passbook', 'bank proof', 'bank statement',
    'बँक पासबुक', 'पासबुक', 'धनादेश'
  ],
  other: ['document', 'attachment', 'file', 'कागदपत्र'],
};

// Flatten synonym index for Fuse.js search
interface SynonymIndexEntry {
  profileKey: string;
  synonym: string;
}

const flattenedSynonyms: SynonymIndexEntry[] = [];
for (const [key, data] of Object.entries(PROFILE_KEY_SYNONYMS)) {
  for (const s of data.synonyms) {
    flattenedSynonyms.push({ profileKey: key, synonym: s });
  }
}

const fuseInstance = new Fuse(flattenedSynonyms, {
  keys: ['synonym'],
  includeScore: true,
  threshold: 0.35,
  minMatchCharLength: 2,
  ignoreLocation: true,
});

/**
 * Heuristically matches a single FormField to a profile key without needing any API key.
 * Evaluates field label, name, placeholder, hints, and input types.
 */
export function matchFieldHeuristically(field: FormField): HeuristicMatchResult {
  const normLabel = normalizeLabel(field.label);
  const normName = normalizeLabel(field.name);
  const normPlaceholder = normalizeLabel(field.placeholder || '');
  const normHint = normalizeLabel(field.hint || '');
  const normId = normalizeLabel(field.id);

  // 1. Guard CAPTCHA / OTP / Password fields immediately
  const combinedText = `${normLabel} ${normName} ${normPlaceholder} ${normHint} ${normId}`;
  if (
    field.type === 'password' ||
    normLabel.includes('password') ||
    normName.includes('password') ||
    normId.includes('password')
  ) {
    return {
      fieldId: field.id,
      profileKey: null,
      confidence: 0.0,
      reason: 'Password fields are excluded from automatic profile mapping',
      isIframe: field.isInsideIframe,
    };
  }

  if (
    combinedText.includes('captcha') ||
    combinedText.includes('security code') ||
    combinedText.includes('enter code shown') ||
    combinedText.includes('verification code') ||
    combinedText.includes('otp') ||
    combinedText.includes('one time password')
  ) {
    return {
      fieldId: field.id,
      profileKey: null,
      confidence: 0.0,
      reason: 'Rule 2: CAPTCHA / OTP preserved for user handback',
      isIframe: field.isInsideIframe,
    };
  }

  // 2. Direct exact synonym matching (highest confidence)
  const checkTexts = [normLabel, normName, normPlaceholder, normId].filter(Boolean);

  // Check email and tel type heuristics upfront
  if (field.type === 'email' || checkTexts.some((t) => t.includes('email') || t.includes('e mail'))) {
    return {
      fieldId: field.id,
      profileKey: 'email',
      confidence: 0.98,
      reason: 'Email field identified via type or label',
      isIframe: field.isInsideIframe,
    };
  }

  for (const [key, data] of Object.entries(PROFILE_KEY_SYNONYMS)) {
    for (const syn of data.synonyms) {
      for (const text of checkTexts) {
        if (text === syn) {
          return {
            fieldId: field.id,
            profileKey: key,
            confidence: 0.98,
            reason: `Exact synonym match "${syn}" for ${key}`,
            isIframe: field.isInsideIframe,
          };
        }
      }
    }
  }

  // 3. Substring matching for multi-word or compound labels
  for (const [key, data] of Object.entries(PROFILE_KEY_SYNONYMS)) {
    for (const syn of data.synonyms) {
      if (syn.length >= 3) {
        // Full label or name contains synonym as distinct word/phrase
        for (const text of checkTexts) {
          if (text.includes(syn)) {
            // High confidence if it's a solid phrase match
            return {
              fieldId: field.id,
              profileKey: key,
              confidence: 0.92,
              reason: `Strong phrase match "${syn}" inside "${text}" for ${key}`,
              isIframe: field.isInsideIframe,
            };
          }
        }
      }
    }
  }

  // 4. HTML input type heuristics with context
  if (field.type === 'tel' && (normLabel.includes('phone') || normLabel.includes('mobile') || checkTexts.length === 0)) {
    return {
      fieldId: field.id,
      profileKey: 'mobile',
      confidence: 0.92,
      reason: 'HTML type="tel" input attribute',
      isIframe: field.isInsideIframe,
    };
  }

  // 5. Fuse.js Fuzzy Matching
  const targetSearch = normLabel || normPlaceholder || normName;
  if (targetSearch) {
    const results = fuseInstance.search(targetSearch);
    if (results.length > 0 && results[0].score !== undefined && results[0].score <= 0.3) {
      const best = results[0];
      const scoreVal = best.score !== undefined ? best.score : 0;
      const calculatedConf = Number((0.92 - scoreVal * 0.45).toFixed(2));
      return {
        fieldId: field.id,
        profileKey: best.item.profileKey,
        confidence: calculatedConf,
        reason: `Fuzzy match on "${best.item.synonym}" (score: ${scoreVal.toFixed(2)})`,
        isIframe: field.isInsideIframe,
      };
    }
  }

  // Unmapped field
  return {
    fieldId: field.id,
    profileKey: null,
    confidence: 0.0,
    reason: 'No confident heuristic or synonym match',
    isIframe: field.isInsideIframe,
  };
}

/**
 * Matches an upload/file slot to an anticipated DocumentType.
 */
export function matchFileSlot(field: FormField): FileSlotMatchResult | null {
  if (field.type !== 'file' && field.type !== 'dropzone') {
    return null;
  }

  const norm = normalizeLabel(`${field.label} ${field.name} ${field.hint || ''}`);

  for (const [docType, synonyms] of Object.entries(DOCUMENT_SLOT_SYNONYMS) as [DocumentType, string[]][]) {
    for (const syn of synonyms) {
      if (norm.includes(syn)) {
        return {
          fieldId: field.id,
          documentType: docType,
          confidence: 0.92,
          reason: `Document slot label matched "${syn}"`,
        };
      }
    }
  }

  return {
    fieldId: field.id,
    documentType: 'other',
    confidence: 0.5,
    reason: 'Generic file upload slot',
  };
}
