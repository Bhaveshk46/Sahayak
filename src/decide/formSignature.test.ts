import { describe, it, expect, beforeEach } from 'vitest';
import { computeFormSignature } from './formSignature';
import { getCachedMapping, setCachedMapping, clearMappingCache } from '../storage/db';

describe('Form Signature & Dexie Mapping Cache', () => {
  beforeEach(async () => {
    await clearMappingCache();
  });

  const fields1 = [
    { label: 'Full Legal Name', type: 'text' as const, name: 'full_name' },
    { label: 'Date of Birth', type: 'date' as const, name: 'dob' },
    { label: 'Mobile Number', type: 'tel' as const, name: 'phone' },
  ];

  const fieldsPermuted = [
    { label: 'Mobile Number', type: 'tel' as const, name: 'phone' },
    { label: 'Full Legal Name', type: 'text' as const, name: 'full_name' },
    { label: 'Date of Birth', type: 'date' as const, name: 'dob' },
  ];

  it('computes identical signature regardless of field ordering', () => {
    const sig1 = computeFormSignature('https://scholarships.gov.in/app', fields1);
    const sig2 = computeFormSignature('https://scholarships.gov.in/app', fieldsPermuted);
    expect(sig1).toBe(sig2);
  });

  it('computes different signatures for different origins or fields', () => {
    const sig1 = computeFormSignature('https://scholarships.gov.in/app', fields1);
    const sig2 = computeFormSignature('https://recruitment.gov.in/apply', fields1);
    expect(sig1).not.toBe(sig2);
  });

  it('stores and retrieves cached mappings in Dexie', async () => {
    const sig = computeFormSignature('https://test.gov.in', fields1);
    const testMappings = [
      { fieldId: 'f1', profileKey: 'fullName', confidence: 0.98, reason: 'Test' },
      { fieldId: 'f2', profileKey: 'dob', confidence: 0.95, reason: 'Test' },
    ];

    await setCachedMapping(sig, 'https://test.gov.in', testMappings);
    const retrieved = await getCachedMapping(sig);

    expect(retrieved).toBeDefined();
    expect(retrieved?.formSignature).toBe(sig);
    expect(retrieved?.mappings).toHaveLength(2);
    expect(retrieved?.mappings[0].profileKey).toBe('fullName');
  });

  it('clears mapping cache properly', async () => {
    const sig = computeFormSignature('https://test.gov.in', fields1);
    await setCachedMapping(sig, 'https://test.gov.in', [
      { fieldId: 'f1', profileKey: 'fullName', confidence: 0.98, reason: 'Test' },
    ]);

    await clearMappingCache();
    const retrieved = await getCachedMapping(sig);
    expect(retrieved).toBeUndefined();
  });
});
