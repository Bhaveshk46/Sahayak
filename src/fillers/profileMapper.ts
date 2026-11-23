import { FormField } from '../types';
import { ProfileRecord } from '../types/profile';

export interface ProfileMappingResult {
  profileKey?: string;
  value?: string;
  confidence?: number;
  source?: string;
  unconfirmed?: boolean;
  reason?: string;
}

/**
 * Maps FormFields to values from the real decrypted profile stored in Dexie.
 * High-confidence and confirmed fields are preferred.
 * Values under 0.75 confidence or regex-only must be confirmed before use.
 */
export function mapFieldToRealProfile(
  field: FormField,
  profileRecords: ProfileRecord[]
): ProfileMappingResult {
  if (!profileRecords || profileRecords.length === 0) {
    return {};
  }

  const normLabel = (field.label || '').toLowerCase();
  const normName = (field.name || '').toLowerCase();
  const normId = (field.id || '').toLowerCase();

  const matches = (keywords: string[]) =>
    keywords.some((kw) => normLabel.includes(kw) || normName.includes(kw) || normId.includes(kw));

  const findRecord = (keys: string[]) => {
    return profileRecords.find((r) => keys.includes(r.key));
  };

  let targetKey: string | null = null;

  // KYC Bank Frame
  if (field.isInsideIframe) {
    if (matches(['ifsc'])) targetKey = 'ifsc';
    else if (matches(['beneficiary', 'holder'])) targetKey = 'fullName';
    else if (matches(['account_type', 'account type', 'type'])) targetKey = 'bankAccountType';
    else if (matches(['account_number', 'account number', 'bank_account'])) targetKey = 'bankAccount';
  }

  if (!targetKey) {
    // Identity / Personal
    if (matches(['legal', 'student_name', 'full_name', 'candidate', 'applicant_name'])) targetKey = 'fullName';
    else if (matches(['email'])) targetKey = 'email';
    else if (matches(['phone', 'mobile', 'tel'])) targetKey = 'mobile';
    else if (matches(['birth', 'dob'])) targetKey = 'dob';
    else if (matches(['gender'])) targetKey = 'gender';
    else if (matches(['father', 'spouse'])) targetKey = 'fatherName';
    else if (matches(['mother'])) targetKey = 'motherName';
    else if (matches(['pan', 'pan_card'])) targetKey = 'panNumber';
    else if (matches(['aadhaar', 'uidai'])) targetKey = 'aadhaarNumber';
    else if (matches(['address', 'residential'])) targetKey = 'address';
    else if (matches(['pincode', 'postal', 'zip'])) targetKey = 'pincode';
    else if (matches(['category', 'social'])) targetKey = 'category';
    else if (matches(['income', 'annual'])) targetKey = 'annualIncome';
    else if (matches(['college', 'institution', 'university'])) targetKey = 'institution';
    else if (matches(['course', 'degree', 'qualification'])) targetKey = 'course';
    else if (matches(['marks', 'percent', 'percentage', 'cgpa'])) targetKey = 'marksPercent';
    else if (matches(['occupation', 'profession', 'guardian_occupation'])) targetKey = 'guardianOccupation';
    else if (matches(['ifsc'])) targetKey = 'ifsc';
    else if (matches(['bank', 'account'])) targetKey = 'bankAccount';
  }

  if (targetKey) {
    const record = findRecord([targetKey]);
    if (record) {
      const isConfirmed = record.verifiedByUser || record.source === 'manual';
      const isLowConfidenceOrRegex = record.confidence < 0.75 || record.source === 'regex';

      if (isLowConfidenceOrRegex && !isConfirmed) {
        return {
          profileKey: record.key,
          confidence: record.confidence,
          source: record.source,
          unconfirmed: true,
          reason: `Requires user confirmation in Profile (<75% confidence or regex source)`,
        };
      }

      return {
        profileKey: record.key,
        value: record.value,
        confidence: record.confidence,
        source: record.source,
        unconfirmed: false,
      };
    }
  }

  return {};
}
