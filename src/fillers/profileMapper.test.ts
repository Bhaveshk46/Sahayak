import { describe, it, expect } from 'vitest';
import { mapFieldToRealProfile } from './profileMapper';
import { FormField } from '../types';
import { ProfileRecord } from '../types/profile';

describe('M4 Profile Mapper & Confidence Gate Tests', () => {
  const dummyField = (overrides: Partial<FormField>): FormField => ({
    id: 'name_input',
    name: 'legal_name',
    type: 'text',
    label: 'Full Legal Name',
    labelSource: 'label-for',
    labelConfidence: 1.0,
    required: true,
    selector: '#legal_name',
    isInsideIframe: false,
    ...overrides,
  });

  const sampleProfileRecords: ProfileRecord[] = [
    {
      key: 'fullName',
      value: 'Aditi Ramesh Sharma',
      confidence: 0.95,
      source: 'sarvam',
      verifiedByUser: false,
      updatedAt: Date.now(),
    },
    {
      key: 'panNumber',
      value: 'ABCDE1234F',
      confidence: 0.9,
      source: 'regex',
      verifiedByUser: false, // Unverified regex entry
      updatedAt: Date.now(),
    },
    {
      key: 'pincode',
      value: '411001',
      confidence: 0.65, // Low confidence
      source: 'sarvam',
      verifiedByUser: false,
      updatedAt: Date.now(),
    },
    {
      key: 'aadhaarNumber',
      value: '987654321012',
      confidence: 0.85,
      source: 'regex',
      verifiedByUser: true, // User confirmed!
      updatedAt: Date.now(),
    },
  ];

  it('maps high-confidence Sarvam field directly for filling', () => {
    const field = dummyField({ label: 'Applicant Legal Name', name: 'applicant_name' });
    const result = mapFieldToRealProfile(field, sampleProfileRecords);

    expect(result.profileKey).toBe('fullName');
    expect(result.value).toBe('Aditi Ramesh Sharma');
    expect(result.unconfirmed).toBe(false);
  });

  it('blocks unverified regex-only records until user confirms in Profile tab', () => {
    const panField = dummyField({ label: 'Permanent Account Number (PAN)', name: 'pan_number' });
    const result = mapFieldToRealProfile(panField, sampleProfileRecords);

    // Should NOT provide value for auto-filling and should be marked unconfirmed
    expect(result.profileKey).toBe('panNumber');
    expect(result.unconfirmed).toBe(true);
    expect(result.value).toBeUndefined();
    expect(result.reason).toContain('Requires user confirmation');
  });

  it('blocks low-confidence (<0.75) records until user confirms', () => {
    const pinField = dummyField({ label: 'Postal Pincode', name: 'pincode' });
    const result = mapFieldToRealProfile(pinField, sampleProfileRecords);

    expect(result.profileKey).toBe('pincode');
    expect(result.unconfirmed).toBe(true);
    expect(result.value).toBeUndefined();
    expect(result.reason).toContain('Requires user confirmation');
  });

  it('allows verified records to be filled even if source was regex', () => {
    const aadhaarField = dummyField({ label: 'Aadhaar UID', name: 'aadhaar_number' });
    const result = mapFieldToRealProfile(aadhaarField, sampleProfileRecords);

    expect(result.profileKey).toBe('aadhaarNumber');
    expect(result.value).toBe('987654321012');
    expect(result.unconfirmed).toBe(false);
  });

  it('returns empty when no matching profile key exists', () => {
    const unknownField = dummyField({ label: 'Favorite Hobby', name: 'hobby' });
    const result = mapFieldToRealProfile(unknownField, sampleProfileRecords);

    expect(result.profileKey).toBeUndefined();
    expect(result.value).toBeUndefined();
  });
});
