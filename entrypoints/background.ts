import { ExtensionMessage, FormSchema, FormField, ApiConfig } from '../src/types';
import { createExtractionJob, pollJobStatus, fetchJobResults, createParseFallbackJob } from '../src/ocr/sarvam';
import { hexToBuffer, bufferToHex } from '../src/storage/crypto';
import { GeminiProvider, ClaudeProvider } from '../src/llm';
import {
  getAllStoredDocuments,
  getDocumentDecryptedBlob,
  initializeOrUnlockStorage,
  lockStorage,
  isStorageUnlocked,
} from '../src/storage/db';

export const DEFAULT_GEMINI_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
export const DEFAULT_SARVAM_KEY = (import.meta as any).env?.VITE_SARVAM_API_KEY || '';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export default defineBackground(() => {
  console.log('[FormPilot Background] Service worker initialized.');

  // Set side panel to open on action (extension icon) click
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('[FormPilot Background] Could not set panel behavior:', err);
    });
  }

  // Support keyboard shortcut to open side panel
  if (chrome.commands?.onCommand) {
    chrome.commands.onCommand.addListener(async (command) => {
      if (command === '_execute_action') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id && chrome.sidePanel?.open) {
          chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        }
      }
    });
  }

  // Inject content script into existing open tabs on install/reload
  chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['content-scripts/content.js']
          }).catch(() => {
            // Tab may not allow scripting (e.g. chrome webstore), safe to ignore
          });
        }
      }
    });
  });

  // Multi-frame schema storage: tabId -> (frameId -> FormSchema)
  const tabFrameSchemas = new Map<number, Map<number, FormSchema>>();

  function getAggregatedSchema(tabId: number): FormSchema | null {
    const frames = tabFrameSchemas.get(tabId);
    if (!frames || frames.size === 0) return null;

    const allFields: FormField[] = [];
    const seenKeys = new Set<string>();
    let hasCaptcha = false;
    let mainUrl = '';
    let mainTitle = '';

    // Sort by frameId: 0 (top frame) first
    const sorted = Array.from(frames.entries()).sort(([a], [b]) => a - b);

    // If frame 0 exists and has fields, check if frame 0 already scanned inner iframes
    const frame0Schema = frames.get(0);
    const topFrameHasIframeFields = frame0Schema?.fields.some(f => f.isInsideIframe) ?? false;

    for (const [frameId, schema] of sorted) {
      if (frameId === 0) {
        mainUrl = schema.url;
        mainTitle = schema.title;
      } else if (topFrameHasIframeFields) {
        // If the top frame (frame 0) already reached into same-origin iframes
        // and extracted their fields with iframe prefixes, skip child frame schemas
        // to avoid duplicate entries!
        continue;
      }
      if (schema.hasCaptcha) hasCaptcha = true;

      for (const field of schema.fields) {
        // Tag field with its native frameId so fillers can route specifically to this frame
        const fieldWithFrameId: FormField = {
          ...field,
          frameId: field.frameId !== undefined ? field.frameId : frameId,
        };

        // Unique key across frames to prevent duplicate counting
        const uniqueKey = `${fieldWithFrameId.id}_${fieldWithFrameId.name}_${fieldWithFrameId.selector}`;
        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          allFields.push(fieldWithFrameId);
        }
      }
    }

    return {
      id: `schema_tab_${tabId}_${Date.now()}`,
      url: mainUrl || sorted[0][1].url,
      title: mainTitle || sorted[0][1].title,
      fields: allFields,
      hasCaptcha,
      timestamp: Date.now()
    };
  }

  function broadcastAggregatedSchema(tabId: number): void {
    const aggregated = getAggregatedSchema(tabId);
    if (aggregated) {
      const frames = tabFrameSchemas.get(tabId);
      console.log(
        `[FormPilot Background] Broadcasting aggregated schema for tab ${tabId}: ` +
        `${frames?.size || 0} frames, ${aggregated.fields.length} total fields ` +
        `(${aggregated.fields.filter(f => f.isInsideIframe).length} from iframes)`
      );
      chrome.runtime.sendMessage({
        type: 'FORM_SCHEMA_OBSERVED',
        payload: aggregated
      } as ExtensionMessage).catch(() => {});
    }
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId ?? 0;

    if (message.type === 'CONTENT_SCRIPT_MOUNTED') {
      const isIframe = message.payload.isIframe;
      console.log(
        `[FormPilot Background] Tab ${tabId} frame ${frameId} ` +
        `(${isIframe ? 'IFRAME' : 'TOP'}) mounted: ${message.payload.url}`
      );
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'FORM_SCHEMA_OBSERVED') {
      if (tabId != null) {
        let frames = tabFrameSchemas.get(tabId);
        if (!frames) {
          frames = new Map();
          tabFrameSchemas.set(tabId, frames);
        }
        frames.set(frameId, message.payload);

        // Broadcast aggregated schema to side panel
        broadcastAggregatedSchema(tabId);
      }
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'TRIGGER_SCAN_ALL_FRAMES') {
      // Side panel requests a full multi-frame scan
      const targetTabId = (message as { type: string; payload?: { tabId?: number } }).payload?.tabId;
      if (!targetTabId) {
        sendResponse({ success: false, error: 'No tabId' });
        return false;
      }

      // Clear existing schemas for this tab so we get fresh data
      tabFrameSchemas.delete(targetTabId);

      // Send TRIGGER_SCAN to ALL frames in the tab
      chrome.tabs.sendMessage(targetTabId, { type: 'TRIGGER_SCAN' } as ExtensionMessage, () => {
        // The top frame responds here, but iframe frames also receive the message
        // and will send FORM_SCHEMA_OBSERVED independently.
        // Wait a moment for all frames to report in, then send aggregated result.
        setTimeout(() => {
          const aggregated = getAggregatedSchema(targetTabId);
          sendResponse({ success: true, schema: aggregated });
          // Also broadcast
          broadcastAggregatedSchema(targetTabId);
        }, 800);
      });

      return true; // async response
    }

    if (message.type === 'GET_ACTIVE_SCHEMA') {
      const targetTabId = message.payload?.tabId;

      if (targetTabId && tabFrameSchemas.has(targetTabId)) {
        const aggregated = getAggregatedSchema(targetTabId);
        sendResponse({ success: true, payload: aggregated });
        return false;
      }

      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([activeTab]) => {
        const id = targetTabId || activeTab?.id;
        if (id && tabFrameSchemas.has(id)) {
          sendResponse({ success: true, payload: getAggregatedSchema(id) });
        } else {
          sendResponse({ success: true, payload: null });
        }
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });

      return true;
    }

    if (message.type === 'INJECT_AND_SCAN') {
      const targetId = message.payload.tabId;

      // Clear stale data
      tabFrameSchemas.delete(targetId);

      chrome.scripting.executeScript({
        target: { tabId: targetId, allFrames: true },
        files: ['content-scripts/content.js']
      }).then(() => {
        // Wait for all frames (including iframes) to scan and report
        setTimeout(() => {
          // Trigger scan in all frames
          chrome.tabs.sendMessage(targetId, { type: 'TRIGGER_SCAN' }, () => {
            // Wait for iframe frames to also report their schemas
            setTimeout(() => {
              const aggregated = getAggregatedSchema(targetId);
              sendResponse({ success: true, schema: aggregated });
            }, 600);
          });
        }, 300);
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    if (message.type === 'SARVAM_EXTRACT_DOCUMENT') {
      const { docType, docName, mimeType, blobDataHex, language } = message.payload;

      chrome.storage.local.get(['sarvamApiKey']).then(async (items) => {
        const apiKey = items.sarvamApiKey || DEFAULT_SARVAM_KEY;
        if (!apiKey) {
          sendResponse({
            success: false,
            error: 'No Sarvam AI API subscription key found in .env or storage. Please check your .env file or use local regex extraction.',
          });
          return;
        }

        try {
          const rawBytes = hexToBuffer(blobDataHex);
          const fileBlob = new Blob([rawBytes.buffer as ArrayBuffer], { type: mimeType });

          console.log(`[FormPilot Background] Submitting Sarvam extract job for ${docName} (${docType})...`);
          const { jobId } = await createExtractionJob(fileBlob, docType, apiKey, language || 'en-IN');
          console.log(`[FormPilot Background] Sarvam job created: ${jobId}. Polling status...`);

          await pollJobStatus(jobId, apiKey, 60, 2000);
          console.log(`[FormPilot Background] Sarvam job completed. Fetching results...`);

          let results = await fetchJobResults(jobId, apiKey);
          const fieldsCount = Object.keys(results || {}).length;

          // If extract returned little or no fields, use digitise/parse endpoint as fallback
          if (fieldsCount === 0 || (results.extracted_data && Object.keys(results.extracted_data).length === 0)) {
            console.log(`[FormPilot Background] Extract returned minimal data for ${docName}. Invoking parse fallback...`);
            try {
              const parseJobId = await createParseFallbackJob(fileBlob, apiKey, language || 'en-IN');
              await pollJobStatus(parseJobId, apiKey, 60, 2000);
              const parseResults = await fetchJobResults(parseJobId, apiKey);
              sendResponse({ success: true, results, parseResults, fallbackUsed: true, jobId });
              return;
            } catch (fallbackErr) {
              console.warn('[FormPilot Background] Parse fallback failed, using extract results:', fallbackErr);
            }
          }

          sendResponse({ success: true, results, jobId });
        } catch (err) {
          console.error('[FormPilot Background] Sarvam extraction failed:', err);
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      });

      return true; // async response
    }

    if (message.type === 'SARVAM_PARSE_DOCUMENT') {
      const { docName, mimeType, blobDataHex, language } = message.payload;

      chrome.storage.local.get(['sarvamApiKey']).then(async (items) => {
        const apiKey = items.sarvamApiKey || DEFAULT_SARVAM_KEY;
        if (!apiKey) {
          sendResponse({ success: false, error: 'No Sarvam AI API key configured in .env or storage.' });
          return;
        }

        try {
          const rawBytes = hexToBuffer(blobDataHex);
          const fileBlob = new Blob([rawBytes.buffer as ArrayBuffer], { type: mimeType });

          console.log(`[FormPilot Background] Submitting Sarvam parse job for ${docName}...`);
          const jobId = await createParseFallbackJob(fileBlob, apiKey, language || 'en-IN');
          await pollJobStatus(jobId, apiKey, 60, 2000);
          const results = await fetchJobResults(jobId, apiKey);
          sendResponse({ success: true, results, jobId });
        } catch (err) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      });

      return true;
    }

    if (message.type === 'GET_API_CONFIG') {
      chrome.storage.local.get(['geminiApiKey', 'claudeApiKey', 'sarvamApiKey', 'elevenLabsApiKey', 'voiceEnabled', 'provider', 'geminiModel', 'claudeModel']).then((items) => {
        const config: ApiConfig = {
          provider: (items.provider as 'gemini' | 'claude') || 'gemini',
          geminiApiKey: items.geminiApiKey || DEFAULT_GEMINI_KEY,
          claudeApiKey: items.claudeApiKey || '',
          sarvamApiKey: items.sarvamApiKey || DEFAULT_SARVAM_KEY,
          elevenLabsApiKey: items.elevenLabsApiKey || '',
          voiceEnabled: Boolean(items.voiceEnabled),
          geminiModel: items.geminiModel || DEFAULT_GEMINI_MODEL,
          claudeModel: items.claudeModel || 'claude-3-5-sonnet-20241022'
        };
        sendResponse({ success: true, payload: config });
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    if (message.type === 'SET_API_CONFIG') {
      chrome.storage.local.set(message.payload).then(() => {
        sendResponse({ success: true });
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    if (message.type === 'MATCH_FIELDS_WITH_LLM') {
      const { fields, model, provider: reqProvider } = (message as any).payload;
      chrome.storage.local.get(['geminiApiKey', 'claudeApiKey', 'geminiModel', 'claudeModel', 'provider']).then(async (items) => {
        const activeProvider = reqProvider || items.provider || 'gemini';
        const apiKey = activeProvider === 'gemini'
          ? (items.geminiApiKey || DEFAULT_GEMINI_KEY)
          : (items.claudeApiKey || '');
        const selectedModel = activeProvider === 'gemini'
          ? (model || items.geminiModel || DEFAULT_GEMINI_MODEL)
          : (model || items.claudeModel || 'claude-3-5-sonnet-20241022');

        try {
          const llm = activeProvider === 'gemini'
            ? new GeminiProvider(apiKey, selectedModel)
            : new ClaudeProvider(apiKey, selectedModel);

          const result = await llm.executeMapping(fields);
          sendResponse({
            success: true,
            matches: result.mappings.map((m) => ({
              fieldId: m.fieldId,
              profileKey: m.profileKey,
              confidence: m.confidence,
              explanation: m.reason,
            })),
            unmatchedFields: result.unmatchedFields,
            missingProfileKeys: result.missingProfileKeys,
            model: selectedModel,
            provider: activeProvider,
          });
        } catch (err: any) {
          console.warn('[FormPilot Background] LLM field matching error:', err);
          sendResponse({ success: false, error: err?.message || String(err) });
        }
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    if (message.type === 'VERIFY_GEMINI_KEY') {
      const apiKey = (message as any).payload?.apiKey || DEFAULT_GEMINI_KEY;
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`)
        .then(async (r) => {
          if (r.ok) {
            sendResponse({ success: true, status: 'valid' });
          } else {
            const errTxt = await r.text();
            sendResponse({ success: false, error: `HTTP ${r.status}: ${errTxt}` });
          }
        })
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true;
    }

    if (message.type === 'VERIFY_ELEVENLABS_KEY') {
      const apiKey = (message as any).payload?.apiKey;
      if (!apiKey || !apiKey.trim()) {
        sendResponse({ success: false, error: 'Please enter an ElevenLabs API key' });
        return true;
      }
      fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey.trim() }
      })
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            const tier = data.subscription?.tier || 'connected';
            sendResponse({ success: true, tier });
          } else {
            const errTxt = await r.text();
            sendResponse({ success: false, error: `HTTP ${r.status}: ${errTxt}` });
          }
        })
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true;
    }

    if (message.type === 'FILL_FIELDS') {
      const targetTabId = message.payload.tabId || tabId;
      if (!targetTabId) {
        sendResponse({ success: false, error: 'No active tabId for fill' });
        return false;
      }

      // Group items by frameId (default to 0 for top frame)
      const frameGroups = new Map<number, Array<{ field: FormField; value: string }>>();
      for (const item of message.payload.items) {
        const fid = item.field.frameId ?? 0;
        const grp = frameGroups.get(fid) || [];
        grp.push(item);
        frameGroups.set(fid, grp);
      }

      const allResults: Array<{ ok: boolean; reason?: string; fieldId: string }> = [];
      const allUndoRecords: any[] = [];
      let pendingGroups = frameGroups.size;

      if (pendingGroups === 0) {
        sendResponse({ success: true, results: [], undoRecords: [] });
        return false;
      }

      frameGroups.forEach((items, fid) => {
        chrome.tabs.sendMessage(
          targetTabId,
          {
            type: 'FILL_FIELDS_IN_FRAME',
            payload: { items },
          } as ExtensionMessage,
          { frameId: fid },
          (resp) => {
            if (resp?.results) {
              allResults.push(...resp.results);
            }
            if (resp?.undoRecords) {
              allUndoRecords.push(...resp.undoRecords);
            }
            pendingGroups--;
            if (pendingGroups === 0) {
              sendResponse({
                success: true,
                results: allResults,
                undoRecords: allUndoRecords,
              });
            }
          }
        );
      });

      return true;
    }

    if (message.type === 'UNDO_FILLS') {
      const targetTabId = message.payload.tabId || tabId;
      if (!targetTabId) {
        sendResponse({ success: false, error: 'No active tabId for undo' });
        return false;
      }

      const frameGroups = new Map<number, any[]>();
      for (const record of message.payload.records) {
        const fid = record.frameId ?? 0;
        const grp = frameGroups.get(fid) || [];
        grp.push(record);
        frameGroups.set(fid, grp);
      }

      let totalUndone = 0;
      let pendingGroups = frameGroups.size;

      if (pendingGroups === 0) {
        sendResponse({ success: true, undoneCount: 0 });
        return false;
      }

      frameGroups.forEach((records, fid) => {
        chrome.tabs.sendMessage(
          targetTabId,
          {
            type: 'UNDO_FILLS_IN_FRAME',
            payload: { records },
          } as ExtensionMessage,
          { frameId: fid },
          (resp) => {
            if (resp?.undoneCount) {
              totalUndone += resp.undoneCount;
            }
            pendingGroups--;
            if (pendingGroups === 0) {
              sendResponse({ success: true, undoneCount: totalUndone });
            }
          }
        );
      });

      return true;
    }

    if (message.type === 'UNLOCK_STORAGE') {
      (async () => {
        try {
          if (chrome.storage?.session) {
            await chrome.storage.session.set({ formpilot_session_pass: message.payload.passphrase });
          }
          const success = await initializeOrUnlockStorage(message.payload.passphrase);
          sendResponse({ success });
        } catch (err: any) {
          sendResponse({ success: false, error: err?.message || 'Unlock failed' });
        }
      })();
      return true;
    }

    if (message.type === 'LOCK_STORAGE') {
      lockStorage();
      if (chrome.storage?.session) {
        chrome.storage.session.remove('formpilot_session_pass').catch(() => {});
      }
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'GET_STORED_DOCUMENTS_METADATA') {
      (async () => {
        try {
          if (!isStorageUnlocked() && chrome.storage?.session) {
            const sessionData = await chrome.storage.session.get('formpilot_session_pass');
            if (sessionData?.formpilot_session_pass) {
              await initializeOrUnlockStorage(sessionData.formpilot_session_pass);
            }
          }
          const documents = await getAllStoredDocuments();
          sendResponse({ success: true, documents, isVaultUnlocked: isStorageUnlocked() });
        } catch (err: any) {
          sendResponse({ success: false, error: err?.message || 'Failed to fetch documents' });
        }
      })();
      return true;
    }

    if (message.type === 'GET_DECRYPTED_DOCUMENT_FOR_ATTACH') {
      const { docId } = message.payload;
      (async () => {
        try {
          // If service worker slept, check chrome.storage.session to restore key
          if (!isStorageUnlocked() && chrome.storage?.session) {
            const sessionData = await chrome.storage.session.get('formpilot_session_pass');
            if (sessionData?.formpilot_session_pass) {
              await initializeOrUnlockStorage(sessionData.formpilot_session_pass);
            }
          }

          if (!isStorageUnlocked()) {
            sendResponse({ success: false, error: 'Vault is locked. Open Side Panel to unlock.' });
            return;
          }

          const allDocs = await getAllStoredDocuments();
          const meta = allDocs.find((d) => d.id === docId);
          if (!meta) {
            sendResponse({ success: false, error: 'Document metadata not found' });
            return;
          }
          const decryptedBlob = await getDocumentDecryptedBlob(docId);
          const arrayBuffer = await decryptedBlob.arrayBuffer();
          const blobBytesHex = bufferToHex(arrayBuffer);
          sendResponse({
            success: true,
            blobBytesHex,
            mimeType: meta.mimeType || decryptedBlob.type,
            name: meta.name,
          });
        } catch (err: any) {
          console.error('[Background] Decrypt for attach failed:', err);
          sendResponse({ success: false, error: err?.message || 'Decryption failed' });
        }
      })();
      return true;
    }

    return false;
  });
});
