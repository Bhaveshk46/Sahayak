import { scanDocumentForms } from '../src/scanner/formScanner';
import { ExtensionMessage, FormSchema } from '../src/types';
import { fillFieldWithRetry, undoFieldFill, highlightField, UndoRecord } from '../src/fillers/formFiller';
import { QuickAttachManager } from '../src/attach/quickAttachManager';
import { scanPageValidationErrors } from '../src/recovery/errorScanner';
import { RecoveryEngine } from '../src/recovery/recoveryEngine';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const isIframe = window.self !== window.top;
    console.log(`[FormPilot] content script loaded (${isIframe ? 'IFRAME' : 'TOP'})`, location.href);

    let cachedSchema: FormSchema | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let scanCount = 0;

    // Initialize M6 QuickAttachManager for upload slots
    const quickAttachManager = new QuickAttachManager(document);
    quickAttachManager.init();

    // Initialize M8 RecoveryEngine for validation error handling
    const recoveryEngine = new RecoveryEngine();

    function attachIframeListeners() {
      if (isIframe) return; // Only top frame manages iframe load listeners
      try {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((iframe) => {
          if (!iframe.hasAttribute('data-fp-listener-attached')) {
            iframe.setAttribute('data-fp-listener-attached', 'true');
            iframe.addEventListener('load', () => {
              console.log('[FormPilot] iframe load event detected, waiting for content to render...');
              setTimeout(() => {
                runScanAndReport('iframe load event (parent re-scan)');
              }, 500);
            });
          }
        });
      } catch {
        // Safe to ignore
      }
    }

    function runScanAndReport(triggerReason: string = 'initial'): FormSchema {
      try {
        scanCount++;
        const schema = scanDocumentForms();
        cachedSchema = schema;

        const iframeFieldCount = schema.fields.filter(f => f.isInsideIframe).length;
        console.info(
          `[FormPilot] Scan #${scanCount} (${isIframe ? 'IFRAME' : 'TOP'}): ` +
          `${schema.fields.length} fields found (${iframeFieldCount} from iframes) ` +
          `on ${location.href} (trigger: ${triggerReason})`
        );

        if (!isIframe) {
          attachIframeListeners();
        }

        chrome.runtime.sendMessage({
          type: 'FORM_SCHEMA_OBSERVED',
          payload: schema
        } as ExtensionMessage).catch(() => {});

        return schema;
      } catch (err) {
        console.error('[FormPilot] Scan failed:', err);
        const emptySchema: FormSchema = {
          id: `schema_err_${Date.now()}`,
          url: location.href,
          title: document.title || 'Web Form',
          fields: [],
          hasCaptcha: false,
          timestamp: Date.now()
        };
        return emptySchema;
      }
    }

    // 1. Initial scan
    const initialSchema = runScanAndReport('initial load');

    // 2. React / SPA mount polling
    const shouldPoll = isIframe || initialSchema.fields.length === 0;
    if (shouldPoll) {
      const pollDelays = [200, 500, 1000, 2000, 3000];
      pollDelays.forEach((delay) => {
        setTimeout(() => {
          if (isIframe || !cachedSchema || cachedSchema.fields.length === 0) {
            runScanAndReport(`SPA mount poll +${delay}ms`);
          }
        }, delay);
      });
    }

    // 3. Notify background script
    chrome.runtime.sendMessage({
      type: 'CONTENT_SCRIPT_MOUNTED',
      payload: { url: location.href, isIframe }
    } as ExtensionMessage).catch(() => {});

    // 4. Runtime message listeners
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'TRIGGER_SCAN') {
        const schema = runScanAndReport('manual trigger from side panel');
        sendResponse({ success: true, schema, isIframe });
        return true;
      }

      if (message.type === 'GET_ACTIVE_SCHEMA') {
        const schema = cachedSchema || runScanAndReport('get schema request');
        sendResponse({ success: true, schema, isIframe });
        return true;
      }

      if (message.type === 'HIGHLIGHT_FIELD') {
        highlightField(message.payload.field, message.payload.status);
        sendResponse({ success: true });
        return true;
      }

      // Handle targeted frame fill request or broadcast fill request
      if (message.type === 'FILL_FIELDS_IN_FRAME' || message.type === 'FILL_FIELDS') {
        (async () => {
          const results = [];
          const undoRecords: UndoRecord[] = [];

          for (const item of message.payload.items) {
            const res = await fillFieldWithRetry(item.field, item.value, document, 2, 80);
            results.push(res);
            if (res.ok && res.previousValue !== undefined) {
              undoRecords.push({
                fieldId: item.field.id,
                selector: item.field.selector,
                isInsideIframe: item.field.isInsideIframe,
                iframeIdentifier: item.field.iframeIdentifier,
                previousValue: res.previousValue,
                type: item.field.type,
                frameId: item.field.frameId,
              });
              highlightField(item.field, 'success');
            } else if (!res.ok) {
              highlightField(item.field, 'error');
            }
          }

          // M8 Error Scanner: scan for portal validation errors after fill
          setTimeout(async () => {
            const detectedErrors = scanPageValidationErrors(document, cachedSchema?.fields || []);
            for (const error of detectedErrors) {
              const res = await recoveryEngine.attemptAutoRecovery(error, {
                doc: document,
                fields: cachedSchema?.fields || [],
                profileRecords: [],
              });
              if (res.recovered) {
                console.log(`[FormPilot M8 Recovery] Fixed ${res.fieldId}: ${res.actionTaken}`);
              } else if (res.needsYou) {
                console.warn(`[FormPilot M8 Recovery] Field ${res.fieldId} requires user attention: "${res.exactPortalMessage}"`);
              }
            }
          }, 150);

          // Re-scan to reflect newly registered values
          setTimeout(() => {
            runScanAndReport('after fillFields');
          }, 200);

          sendResponse({ success: true, results, undoRecords });
        })();

        return true; // async
      }

      if (message.type === 'UNDO_FILLS_IN_FRAME' || message.type === 'UNDO_FILLS') {
        let undoneCount = 0;
        for (const record of message.payload.records) {
          const ok = undoFieldFill(record);
          if (ok) undoneCount++;
        }

        setTimeout(() => {
          runScanAndReport('after undoFills');
        }, 200);

        sendResponse({ success: true, undoneCount });
        return true;
      }

      if (message.type === 'TOGGLE_QUICK_ATTACH') {
        quickAttachManager.setVisible(message.payload.visible);
        sendResponse({ success: true, visible: message.payload.visible });
        return false;
      }

      return false;
    });

    // 5. MutationObserver
    const observer = new MutationObserver(() => {
      if (!isIframe) attachIframeListeners();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        runScanAndReport('DOM mutation');
      }, 250);
    });

    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'disabled', 'src']
      });
    }
  }
});
