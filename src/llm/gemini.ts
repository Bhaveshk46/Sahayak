import { LLMFieldInput, LLMMappingResponse, LLMMappingResponseSchema, ProfileKeyDescriptor } from './schema';
import { buildLLMMappingPrompt, getStandardProfileKeyDescriptors } from './prompt';
import { LLMProvider } from '../types';

export class GeminiProvider implements LLMProvider {
  name: 'gemini' = 'gemini';
  private apiKey: string;
  private model: string;
  private fetchFn: typeof fetch;

  constructor(apiKey: string, model: string = 'gemini-2.5-flash', fetchFn: typeof fetch = fetch) {
    this.apiKey = apiKey.trim();
    this.model = model;
    this.fetchFn = fetchFn;
  }

  async extractProfileFromOcr(_ocrText: string, _apiKey: string): Promise<Record<string, unknown>> {
    return {};
  }

  async mapFields(
    fields: Array<{ id: string; label: string; type: string; options?: string[]; hint?: string }>,
    _profileKeys: string[],
    apiKey: string
  ): Promise<Array<{ fieldId: string; profileKey: string; confidence: number; explanation?: string }>> {
    const keyToUse = apiKey || this.apiKey;
    const response = await this.executeMapping(fields, getStandardProfileKeyDescriptors(), keyToUse);
    return response.mappings.map((m) => ({
      fieldId: m.fieldId,
      profileKey: m.profileKey || '',
      confidence: m.confidence,
      explanation: m.reason,
    }));
  }

  async executeMapping(
    fields: LLMFieldInput[],
    descriptors: ProfileKeyDescriptor[] = getStandardProfileKeyDescriptors(),
    apiKeyOverride?: string
  ): Promise<LLMMappingResponse> {
    const key = (apiKeyOverride || this.apiKey).trim();
    if (!key) {
      throw new Error('Gemini API key is required.');
    }

    const prompt = buildLLMMappingPrompt(fields, descriptors);

    // Call with 1 retry on invalid JSON or Zod schema validation failure
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const textResponse = await this.callGeminiApi(prompt, key);
        const parsedJson = JSON.parse(textResponse.replace(/```json\s*|```\s*$/g, '').trim());
        const validated = LLMMappingResponseSchema.parse(parsedJson);
        return validated;
      } catch (err: any) {
        lastError = err;
        console.warn(`[GeminiProvider] Attempt ${attempt} failed:`, err?.message || err);
        if (attempt === 1) {
          // Retry once with a brief pause
          await new Promise((res) => setTimeout(res, 200));
        }
      }
    }

    throw new Error(`Gemini LLM mapping failed validation after retry: ${lastError?.message || 'Invalid output'}`);
  }

  private async callGeminiApi(prompt: string, apiKey: string): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Empty response from Gemini.');
    }
    return candidateText;
  }
}
