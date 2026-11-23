export * from './messages';

export type FormFieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'tel'
  | 'date'
  | 'select'
  | 'custom-select'
  | 'radio'
  | 'checkbox'
  | 'textarea'
  | 'file'
  | 'dropzone'
  | 'password'
  | 'unknown';

export type LabelSource =
  | 'label-for'
  | 'wrapping-label'
  | 'aria-labelledby'
  | 'aria-label'
  | 'placeholder'
  | 'title'
  | 'nearby-text'
  | 'name-attr'
  | 'none';

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormField {
  id: string;
  name: string;
  type: FormFieldType;
  label: string;
  labelSource: LabelSource;
  labelConfidence: number; // 0.0–1.0
  placeholder?: string;
  required: boolean;
  options?: FormFieldOption[];
  hint?: string;
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  pattern?: string;
  currentValue?: string;
  selector: string;
  isInsideIframe: boolean;
  iframeIndex?: number;
  iframeIdentifier?: string;
  frameId?: number;
}

export interface FormSchema {
  id: string;
  url: string;
  title: string;
  fields: FormField[];
  hasCaptcha: boolean;
  timestamp: number;
}

export type AgentStep = 'OBSERVED' | 'DECIDED' | 'ACTED' | 'NEEDS_YOU' | 'PROFILE';

export interface AgentStatusState {
  currentStep: AgentStep;
  statusText: string;
  fieldCount: number;
  mappedCount: number;
  filledCount: number;
  needsUserCount: number;
  hasCaptcha: boolean;
  lastUpdated: number;
}

export interface ApiConfig {
  provider: 'gemini' | 'claude';
  geminiApiKey: string;
  claudeApiKey: string;
  sarvamApiKey?: string;
  geminiModel: string;
  claudeModel: string;
}

export interface LLMProvider {
  name: 'gemini' | 'claude';
  extractProfileFromOcr(ocrText: string, apiKey: string): Promise<Record<string, unknown>>;
  mapFields(
    fields: Array<{ id: string; label: string; type: string; options?: string[]; hint?: string }>,
    profileKeys: string[],
    apiKey: string
  ): Promise<Array<{ fieldId: string; profileKey: string; confidence: number; explanation?: string }>>;
}

export interface ProfileRecord {
  id: string;
  label: string;
  value: string;
  confidence: number;
  sourceDocId?: string;
  verifiedByUser: boolean;
}
