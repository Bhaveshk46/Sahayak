import { FormSchema, FormField, AgentStep, ApiConfig } from './index';

export type ExtensionMessage =
  | { type: 'CONTENT_SCRIPT_MOUNTED'; payload: { url: string; isIframe: boolean } }
  | { type: 'TRIGGER_SCAN' }
  | { type: 'TRIGGER_SCAN_ALL_FRAMES'; payload: { tabId: number } }
  | { type: 'FORM_SCHEMA_OBSERVED'; payload: FormSchema }
  | { type: 'GET_ACTIVE_SCHEMA'; payload?: { tabId?: number } }
  | { type: 'ACTIVE_SCHEMA_RESPONSE'; payload: FormSchema | null }
  | { type: 'INJECT_AND_SCAN'; payload: { tabId: number } }
  | { type: 'STEP_CHANGED'; payload: { step: AgentStep; detail?: string } }
  | { type: 'GET_API_CONFIG' }
  | { type: 'API_CONFIG_RESPONSE'; payload: ApiConfig }
  | { type: 'SET_API_CONFIG'; payload: Partial<ApiConfig> }
  | { type: 'FILL_FIELDS'; payload: { items: Array<{ field: FormField; value: string }>; tabId?: number } }
  | { type: 'FILL_FIELDS_IN_FRAME'; payload: { items: Array<{ field: FormField; value: string }> } }
  | { type: 'FILL_FIELDS_RESPONSE'; payload: { results: Array<{ ok: boolean; reason?: string; fieldId: string }>; undoRecords: Array<any> } }
  | { type: 'UNDO_FILLS'; payload: { records: Array<any>; tabId?: number } }
  | { type: 'UNDO_FILLS_IN_FRAME'; payload: { records: Array<any> } }
  | { type: 'HIGHLIGHT_FIELD'; payload: { field: FormField; status: 'preview' | 'success' | 'error' } }
  | { type: 'SARVAM_EXTRACT_DOCUMENT'; payload: { docId: string; docType: any; docName: string; mimeType: string; blobDataHex: string; language?: string } }
  | { type: 'SARVAM_PARSE_DOCUMENT'; payload: { docId: string; docName: string; mimeType: string; blobDataHex: string; language?: string } }
  | { type: 'MATCH_FIELDS_WITH_LLM'; payload: { fields: any[]; profileKeys?: string[]; model?: string } }
  | { type: 'VERIFY_GEMINI_KEY'; payload: { apiKey: string } }
  | { type: 'VERIFY_ELEVENLABS_KEY'; payload: { apiKey: string } }
  | { type: 'UNLOCK_STORAGE'; payload: { passphrase: string } }
  | { type: 'LOCK_STORAGE' }
  | { type: 'GET_STORED_DOCUMENTS_METADATA' }
  | { type: 'GET_DECRYPTED_DOCUMENT_FOR_ATTACH'; payload: { docId: string } }
  | { type: 'TOGGLE_QUICK_ATTACH'; payload: { visible: boolean } }
  | { type: 'GUIDED_FALLBACK_TRIGGERED'; payload: { slotLabel: string; documentId: string; documentName: string; documentType: string } }
  | { type: 'MIC_PERMISSION_GRANTED' }
  | { type: 'LOG_EVENT'; payload: { level: 'info' | 'warn' | 'error'; message: string; data?: unknown } };

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  schema?: FormSchema;
  error?: string;
}
