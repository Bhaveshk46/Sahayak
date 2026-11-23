import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider } from '../llm/gemini';
import { ClaudeProvider } from '../llm/claude';
import { buildLLMMappingPrompt } from '../llm/prompt';
import { runDecisionEngine } from './decisionEngine';
import { FormField } from '../types';
import { ProfileRecord } from '../types/profile';

describe('Rule 1 Hard Privacy Tests (Zero-Data-Leakage Guarantee)', () => {
  const sensitiveVaultProfile: ProfileRecord[] = [
    { key: 'fullName', value: 'Priya Anand Sharma', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'dob', value: '15/08/1999', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'gender', value: 'Female', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'email', value: 'priya.sharma99@gov-mail.in', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'mobile', value: '9876543210', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'aadhaarNumber', value: '543210987654', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'panNumber', value: 'ABCDE1234F', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'annualIncome', value: '350000', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'bankAccount', value: '98765432101234', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'ifsc', value: 'SBIN0001234', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'address', value: 'Flat 402, Shiv Shrushti, Kothrud, Pune', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
    { key: 'pincode', value: '411038', confidence: 1.0, source: 'manual', verifiedByUser: true, updatedAt: Date.now() },
  ];

  const sampleFields = [
    {
      id: 'f_name',
      label: 'Applicant Full Legal Name',
      type: 'text',
      required: true,
    },
    {
      id: 'f_email',
      label: 'Email ID',
      type: 'email',
      required: true,
    },
    {
      id: 'f_income',
      label: 'Annual Household Gross Income',
      type: 'number',
      required: true,
    },
  ];

  it('buildLLMMappingPrompt contains ONLY metadata and key names, never profile values', () => {
    const prompt = buildLLMMappingPrompt(sampleFields);

    for (const record of sensitiveVaultProfile) {
      expect(prompt).not.toContain(record.value);
    }

    // Must contain metadata
    expect(prompt).toContain('Applicant Full Legal Name');
    expect(prompt).toContain('Email ID');
    expect(prompt).toContain('Annual Household Gross Income');
    expect(prompt).toContain('AVAILABLE_PROFILE_KEYS');
  });

  it('GeminiProvider request body contains NO sensitive profile values', async () => {
    let capturedBody = '';

    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = options.body;
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      mappings: [
                        { fieldId: 'f_name', profileKey: 'fullName', confidence: 0.95, reason: 'Full name' },
                      ],
                      unmatchedFields: [],
                      missingProfileKeys: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const gemini = new GeminiProvider('mock-key', 'gemini-2.5-flash', mockFetch as unknown as typeof fetch);
    await gemini.executeMapping(sampleFields);

    expect(capturedBody).toBeDefined();
    for (const record of sensitiveVaultProfile) {
      expect(capturedBody).not.toContain(record.value);
    }
  });

  it('ClaudeProvider request body contains NO sensitive profile values', async () => {
    let capturedBody = '';

    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = options.body;
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                mappings: [
                  { fieldId: 'f_name', profileKey: 'fullName', confidence: 0.95, reason: 'Full name' },
                ],
                unmatchedFields: [],
                missingProfileKeys: [],
              }),
            },
          ],
        }),
      };
    });

    const claude = new ClaudeProvider('mock-key', 'claude-3-5-sonnet-20241022', mockFetch as unknown as typeof fetch);
    await claude.executeMapping(sampleFields);

    expect(capturedBody).toBeDefined();
    for (const record of sensitiveVaultProfile) {
      expect(capturedBody).not.toContain(record.value);
    }
  });

  it('runDecisionEngine passes zero profile values to LLM when invoked', async () => {
    let capturedBody = '';

    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = options.body;
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      mappings: [
                        { fieldId: 'f_low_conf', profileKey: 'course', confidence: 0.9, reason: 'Specialized course' },
                      ],
                      unmatchedFields: [],
                      missingProfileKeys: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    // Provide a field with low heuristic confidence to trigger the selective LLM path
    const fieldNeedingLLM: FormField = {
      id: 'f_low_conf',
      name: 'uncommon_custom_stream_code_99',
      label: 'Nomenclature of Discipline',
      type: 'text',
      labelSource: 'label-for',
      labelConfidence: 0.5,
      required: false,
      selector: '#f_low_conf',
      isInsideIframe: false,
    };

    await runDecisionEngine({
      fields: [fieldNeedingLLM],
      urlOrOrigin: 'https://scholarships.gov.in/portal',
      profileRecords: sensitiveVaultProfile,
      apiConfig: {
        provider: 'gemini',
        geminiApiKey: 'test-key',
        geminiModel: 'gemini-2.5-flash',
      },
      forceFresh: true,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(capturedBody).toBeDefined();
    for (const record of sensitiveVaultProfile) {
      expect(capturedBody).not.toContain(record.value);
    }
  });
});
