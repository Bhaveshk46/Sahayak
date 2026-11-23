import { FormField } from '../types';
import { M3_TEST_PROFILE } from './sampleProfile';

/**
 * Mapping table matching FormField metadata (name, label, id) to M3_TEST_PROFILE keys.
 * In M5, this heuristic will be replaced by the LLM-driven field matcher.
 */
export function mapFieldToTestProfile(field: FormField): { profileKey?: string; value?: string } {
  const normLabel = (field.label || '').toLowerCase();
  const normName = (field.name || '').toLowerCase();
  const normId = (field.id || '').toLowerCase();

  const matches = (keywords: string[]) =>
    keywords.some((kw) => normLabel.includes(kw) || normName.includes(kw) || normId.includes(kw));

  // KYC Bank Frame
  if (field.isInsideIframe) {
    if (matches(['ifsc'])) return { profileKey: 'bankIfscCode', value: M3_TEST_PROFILE.bankIfscCode };
    if (matches(['beneficiary', 'holder'])) return { profileKey: 'bankAccountHolder', value: M3_TEST_PROFILE.bankAccountHolder };
    if (matches(['account_type', 'account type', 'type'])) return { profileKey: 'bankAccountType', value: M3_TEST_PROFILE.bankAccountType };
    if (matches(['account_number', 'account number', 'bank_account'])) return { profileKey: 'bankAccountNumber', value: M3_TEST_PROFILE.bankAccountNumber };
  }

  // Personal / Identity
  if (matches(['candidate', 'applicant_name'])) return { profileKey: 'candidateName', value: M3_TEST_PROFILE.candidateName };
  if (matches(['legal', 'full name', 'student_name', 'full_name'])) return { profileKey: 'fullName', value: M3_TEST_PROFILE.fullName };
  if (matches(['email'])) return { profileKey: 'email', value: M3_TEST_PROFILE.email };
  if (matches(['phone', 'mobile', 'tel'])) return { profileKey: 'phone', value: M3_TEST_PROFILE.phone };
  if (matches(['birth', 'dob'])) return { profileKey: 'dob', value: M3_TEST_PROFILE.dob };
  if (matches(['gender'])) return { profileKey: 'gender', value: M3_TEST_PROFILE.gender };
  if (matches(['father', 'spouse'])) return { profileKey: 'fatherName', value: M3_TEST_PROFILE.fatherName };
  if (matches(['pan', 'pan_card'])) return { profileKey: 'panNumber', value: M3_TEST_PROFILE.panNumber };
  if (matches(['aadhaar', 'uidai'])) return { profileKey: 'aadhaarNumber', value: M3_TEST_PROFILE.aadhaarNumber };
  if (matches(['address', 'residential'])) return { profileKey: 'address', value: M3_TEST_PROFILE.address };
  if (matches(['pincode', 'postal', 'zip'])) return { profileKey: 'pincode', value: M3_TEST_PROFILE.pincode };
  if (matches(['state', 'domicile', 'residence'])) return { profileKey: 'state', value: M3_TEST_PROFILE.state };

  // Scholarship
  if (matches(['category', 'social'])) return { profileKey: 'category', value: M3_TEST_PROFILE.category };
  if (matches(['college', 'institution', 'university'])) return { profileKey: 'collegeName', value: M3_TEST_PROFILE.collegeName };
  if (matches(['scheme'])) return { profileKey: 'scheme', value: M3_TEST_PROFILE.scheme };
  if (matches(['income', 'annual'])) return { profileKey: 'annualIncome', value: M3_TEST_PROFILE.annualIncome };

  // Job
  if (matches(['experience', 'years'])) return { profileKey: 'experienceYears', value: M3_TEST_PROFILE.experienceYears };
  if (matches(['qualification', 'degree', 'education'])) return { profileKey: 'qualification', value: M3_TEST_PROFILE.qualification };
  if (matches(['employer', 'company', 'organization'])) return { profileKey: 'currentCompany', value: M3_TEST_PROFILE.currentCompany };
  if (matches(['location', 'work_location'])) return { profileKey: 'preferredLocation', value: M3_TEST_PROFILE.preferredLocation };
  if (matches(['notice', 'notice_period'])) return { profileKey: 'noticePeriod', value: M3_TEST_PROFILE.noticePeriod };
  if (matches(['declaration', 'declare'])) return { profileKey: 'declaration', value: M3_TEST_PROFILE.declaration };

  return {};
}
