import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';
import { LLMMappingResponseSchema } from './schema';

describe('LLM Provider Output Validation & Retry Handling', () => {
  it('LLMMappingResponseSchema validates conformant mapping output', () => {
    const validJson = {
      mappings: [
        { fieldId: 'name', profileKey: 'fullName', confidence: 0.95, reason: 'Exact match' },
        { fieldId: 'dob', profileKey: 'dob', confidence: 0.9, reason: 'Date of birth' },
        { fieldId: 'captcha', profileKey: null, confidence: 0.0, reason: 'Rule 2: CAPTCHA guard' },
      ],
      unmatchedFields: ['field_unknown'],
      missingProfileKeys: ['incomeCertificate'],
    };

    const parsed = LLMMappingResponseSchema.parse(validJson);
    expect(parsed.mappings).toHaveLength(3);
    expect(parsed.mappings[0].profileKey).toBe('fullName');
    expect(parsed.mappings[2].profileKey).toBeNull();
  });

  it('LLMMappingResponseSchema rejects out-of-range confidence scores', () => {
    const invalidJson = {
      mappings: [{ fieldId: 'name', profileKey: 'fullName', confidence: 1.5, reason: 'Bad' }],
    };

    expect(() => LLMMappingResponseSchema.parse(invalidJson)).toThrow();
  });

  it('GeminiProvider retries once on invalid JSON, then succeeds on 2nd attempt', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // Return malformed JSON first
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'NOT_VALID_JSON{oops' }] } }],
          }),
        };
      }
      // Return valid JSON on second attempt
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
                        { fieldId: 'f1', profileKey: 'fullName', confidence: 0.95, reason: 'Recovered' },
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

    const gemini = new GeminiProvider('test-key', 'gemini-2.5-flash', mockFetch as unknown as typeof fetch);
    const result = await gemini.executeMapping([{ id: 'f1', label: 'Full Name', type: 'text' }]);

    expect(callCount).toBe(2);
    expect(result.mappings[0].profileKey).toBe('fullName');
  });

  it('GeminiProvider throws after 2 failed attempts so decisionEngine can fall back', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"broken": true}' }] } }],
      }),
    });

    const gemini = new GeminiProvider('test-key', 'gemini-2.5-flash', mockFetch as unknown as typeof fetch);

    await expect(
      gemini.executeMapping([{ id: 'f1', label: 'Full Name', type: 'text' }])
    ).rejects.toThrow(/Gemini LLM mapping failed validation after retry/);
  });

  it('ClaudeProvider validates response schema successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              mappings: [{ fieldId: 'f1', profileKey: 'fullName', confidence: 0.96, reason: 'Valid' }],
              unmatchedFields: [],
              missingProfileKeys: [],
            }),
          },
        ],
      }),
    });

    const claude = new ClaudeProvider('test-key', 'claude-3-5-sonnet-20241022', mockFetch as unknown as typeof fetch);
    const result = await claude.executeMapping([{ id: 'f1', label: 'Full Name', type: 'text' }]);

    expect(result.mappings[0].profileKey).toBe('fullName');
  });
});
