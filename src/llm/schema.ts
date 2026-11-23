import { z } from 'zod';

export const LLMMappingItemSchema = z.object({
  fieldId: z.string(),
  profileKey: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().default(''),
});

export const LLMMappingResponseSchema = z.object({
  mappings: z.array(LLMMappingItemSchema),
  unmatchedFields: z.array(z.string()).default([]),
  missingProfileKeys: z.array(z.string()).default([]),
});

export type LLMMappingItem = z.infer<typeof LLMMappingItemSchema>;
export type LLMMappingResponse = z.infer<typeof LLMMappingResponseSchema>;

export interface LLMFieldInput {
  id: string;
  label: string;
  type: string;
  options?: string[];
  hint?: string;
  placeholder?: string;
  required?: boolean;
  accept?: string;
}

export interface ProfileKeyDescriptor {
  key: string;
  description: string;
}
