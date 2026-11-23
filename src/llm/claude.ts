import { LLMFieldInput, LLMMappingResponse, LLMMappingResponseSchema, ProfileKeyDescriptor } from './schema';
import { buildLLMMappingPrompt, getStandardProfileKeyDescriptors } from './prompt';
import { LLMProvider } from '../types';

export class ClaudeProvider implements LLMProvider {
  name: 'claude' = 'claude';
  private apiKey: string;
  private model: string;
  private fetchFn: typeof fetch;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022', fetchFn: typeof fetch = fetch) {
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
      throw new Error('Claude API key is required.');
    }

    const prompt = buildLLMMappingPrompt(fields, descriptors);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const textResponse = await this.callClaudeApi(prompt, key);
        const parsedJson = JSON.parse(textResponse.replace(/```json\s*|```\s*$/g, '').trim());
        const validated = LLMMappingResponseSchema.parse(parsedJson);
        return validated;
      } catch (err: any) {
        lastError = err;
        console.warn(`[ClaudeProvider] Attempt ${attempt} failed:`, err?.message || err);
        if (attempt === 1) {
          await new Promise((res) => setTimeout(res, 200));
        }
      }
    }

    throw new Error(`Claude LLM mapping failed validation after retry: ${lastError?.message || 'Invalid output'}`);
  }

  private async callClaudeApi(prompt: string, apiKey: string): Promise<string> {
    const response = await this.fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.content?.[0]?.text;
    if (!candidateText) {
      throw new Error('Empty response from Claude.');
    }
    return candidateText;
  }
}
