import { describe, it, expect, vi } from 'vitest';
import {
  matchFieldsWithGemini,
  buildGeminiMatchingPrompt,
  FieldMetadata,
  DEFAULT_PROFILE_KEYS,
} from './geminiMatcher';

describe('Gemini Field Matcher (M5 Decision Engine)', () => {
  const sampleFields: FieldMetadata[] = [
    {
      id: 'inp_fullname',
      name: 'candidate_full_name',
      label: 'Candidate Full Name (As per Aadhaar/10th)',
      type: 'text',
      placeholder: 'Enter full name',
    },
    {
      id: 'inp_dob',
      name: 'date_of_birth',
      label: 'Date of Birth (DD/MM/YYYY)',
      type: 'date',
    },
    {
      id: 'inp_category',
      name: 'social_category',
      label: 'Reservation Category',
      type: 'select',
      options: ['General', 'OBC', 'SC', 'ST', 'EWS'],
    },
    {
      id: 'inp_annual_income',
      name: 'family_annual_income',
      label: 'Annual Family Income (in INR)',
      type: 'number',
    },
    {
      id: 'inp_bank_ifsc',
      name: 'ifsc_code',
      label: 'Bank Branch IFSC Code',
      type: 'text',
      isInsideIframe: true,
    },
    {
      id: 'inp_captcha',
      name: 'captcha_code',
      label: 'Security Captcha',
      type: 'text',
      hint: 'Type the characters shown in the image',
    },
  ];

  it('RULE 1 PRIVACY TEST: Request payload must NEVER contain sensitive profile values', async () => {
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
                      matches: [
                        { fieldId: 'inp_fullname', profileKey: 'fullName', confidence: 0.98, explanation: 'Full name' },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const sensitiveUserValues = [
      'Priya Sharma',
      'priya.sharma99@gmail.com',
      '9876543210',
      '543210987654', // Aadhaar number
      'ABCDE1234F',   // PAN number
      '500000',        // Income
      'SBIN0001234',  // IFSC
    ];

    await matchFieldsWithGemini({
      fields: sampleFields,
      profileKeys: DEFAULT_PROFILE_KEYS,
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(capturedBody).toBeDefined();
    for (const secret of sensitiveUserValues) {
      expect(capturedBody).not.toContain(secret);
    }

    // Prompt must contain only candidate keys and field metadata
    expect(capturedBody).toContain('Candidate Full Name');
    expect(capturedBody).toContain('fullName');
    expect(capturedBody).toContain('annualIncome');
  });

  it('successfully maps form fields from Gemini JSON response', async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  matches: [
                    {
                      fieldId: 'inp_fullname',
                      profileKey: 'fullName',
                      confidence: 0.98,
                      explanation: 'Matches candidate legal full name',
                    },
                    {
                      fieldId: 'inp_dob',
                      profileKey: 'dob',
                      confidence: 0.95,
                      explanation: 'Matches date of birth',
                    },
                    {
                      fieldId: 'inp_category',
                      profileKey: 'category',
                      confidence: 0.92,
                      explanation: 'Reservation category maps to category',
                    },
                    {
                      fieldId: 'inp_annual_income',
                      profileKey: 'annualIncome',
                      confidence: 0.94,
                      explanation: 'Annual family income maps to annualIncome',
                    },
                    {
                      fieldId: 'inp_bank_ifsc',
                      profileKey: 'ifsc',
                      confidence: 0.99,
                      explanation: 'Bank IFSC code maps to ifsc',
                    },
                    {
                      fieldId: 'inp_captcha',
                      profileKey: null,
                      confidence: 0.0,
                      explanation: 'Preserved for user (Rule 2: CAPTCHA / OTP guard)',
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGeminiResponse,
    });

    const decisions = await matchFieldsWithGemini({
      fields: sampleFields,
      profileKeys: DEFAULT_PROFILE_KEYS,
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(decisions).toHaveLength(6);

    const nameDecision = decisions.find((d) => d.fieldId === 'inp_fullname');
    expect(nameDecision?.profileKey).toBe('fullName');
    expect(nameDecision?.confidence).toBe(0.98);

    const ifscDecision = decisions.find((d) => d.fieldId === 'inp_bank_ifsc');
    expect(ifscDecision?.profileKey).toBe('ifsc');
    expect(ifscDecision?.isIframe).toBe(true);

    const captchaDecision = decisions.find((d) => d.fieldId === 'inp_captcha');
    expect(captchaDecision?.profileKey).toBeNull();
    expect(captchaDecision?.confidence).toBe(0.0);
  });

  it('strips markdown code blocks (```json ... ```) gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '```json\n{"matches":[{"fieldId":"inp_fullname","profileKey":"fullName","confidence":0.97,"explanation":"Legal name"}]}\n```',
                },
              ],
            },
          },
        ],
      }),
    });

    const decisions = await matchFieldsWithGemini({
      fields: [sampleFields[0]],
      profileKeys: DEFAULT_PROFILE_KEYS,
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0].profileKey).toBe('fullName');
    expect(decisions[0].confidence).toBe(0.97);
  });

  it('rejects profile keys not present in candidate list', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    matches: [
                      {
                        fieldId: 'inp_fullname',
                        profileKey: 'nonExistentHallucinatedKey',
                        confidence: 0.95,
                        explanation: 'Hallucinated',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const decisions = await matchFieldsWithGemini({
      fields: [sampleFields[0]],
      profileKeys: ['fullName', 'email'],
      apiKey: 'test-api-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(decisions[0].profileKey).toBeNull();
  });

  it('throws friendly error on 400 Invalid API Key', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'API_KEY_INVALID' } }),
    });

    await expect(
      matchFieldsWithGemini({
        fields: sampleFields,
        profileKeys: DEFAULT_PROFILE_KEYS,
        apiKey: 'bad-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(/Invalid Google Gemini API key/);
  });

  it('throws friendly error on 429 Rate Limit', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    await expect(
      matchFieldsWithGemini({
        fields: sampleFields,
        profileKeys: DEFAULT_PROFILE_KEYS,
        apiKey: 'test-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(/rate limit exceeded/);
  });

  it('buildGeminiMatchingPrompt builds formatted prompt with schema metadata and candidate keys', () => {
    const prompt = buildGeminiMatchingPrompt(sampleFields, ['fullName', 'email', 'dob']);
    expect(prompt).toContain('AVAILABLE_PROFILE_KEYS');
    expect(prompt).toContain('FORM_FIELDS_TO_MATCH');
    expect(prompt).toContain('Candidate Full Name');
    expect(prompt).toContain('CRITICAL PRIVACY & SECURITY RULES');
  });
});
