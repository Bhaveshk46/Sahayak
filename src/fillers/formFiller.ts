import { FormField } from '../types';

export interface FillResult {
  ok: boolean;
  reason?: string;
  previousValue?: string;
  newValue?: string;
  fieldId: string;
}

export interface UndoRecord {
  fieldId: string;
  selector: string;
  isInsideIframe: boolean;
  iframeIdentifier?: string;
  previousValue: string;
  type: FormField['type'];
  frameId?: number;
}

/**
 * Native value setter helper for React/Vue/Angular controlled inputs.
 * Uses the element's actual ownerWindow prototype to prevent "Illegal invocation"
 * errors across window/iframe boundaries.
 */
function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const win = element.ownerDocument?.defaultView || window;
  const proto = element instanceof win.HTMLInputElement
    ? win.HTMLInputElement.prototype
    : (win as any).HTMLTextAreaElement?.prototype || HTMLTextAreaElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * Dispatch necessary events so frameworks recognize the new value.
 */
function dispatchInputEvents(element: HTMLElement): void {
  const win = element.ownerDocument?.defaultView || window;
  const EventCtor = win.Event || Event;
  element.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new EventCtor('blur', { bubbles: true, cancelable: true }));
}

/**
 * Resolve target element inside document or specified iframe with multi-level fallbacks.
 * Never retains stale element references; dynamically re-queries DOM at fill time.
 */
export function resolveTargetElement(
  field: FormField,
  rootDoc: Document = document
): HTMLElement | null {
  // 1. Direct query on root document first (if content script runs inside this frame)
  try {
    if (field.selector) {
      const el = rootDoc.querySelector<HTMLElement>(field.selector);
      if (el) return el;
    }
  } catch {
    // Bad selector syntax protection
  }

  // 2. Fallback to ID without iframe prefix if field.id or selector has prefix
  if (field.id) {
    const rawId = field.id.includes('::') ? field.id.split('::').pop()! : field.id;
    const directIdEl = rootDoc.getElementById(rawId);
    if (directIdEl) return directIdEl;
  }

  // 3. Fallback to name attribute
  if (field.name) {
    try {
      const nameEl = rootDoc.querySelector<HTMLElement>(`[name="${CSS.escape(field.name)}"]`);
      if (nameEl) return nameEl;
    } catch {}
  }

  // 4. Walk into same-origin iframes if caller is parent document
  if (field.isInsideIframe) {
    const iframes = rootDoc.querySelectorAll<HTMLIFrameElement>('iframe, frame');
    for (const iframe of Array.from(iframes)) {
      const match =
        iframe.id === field.iframeIdentifier ||
        iframe.name === field.iframeIdentifier ||
        `iframe_${field.iframeIndex}` === field.iframeIdentifier;
      if (match || !field.iframeIdentifier) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc) {
            if (field.selector) {
              const el = doc.querySelector<HTMLElement>(field.selector);
              if (el) return el;
            }
            if (field.name) {
              const nameEl = doc.querySelector<HTMLElement>(`[name="${CSS.escape(field.name)}"]`);
              if (nameEl) return nameEl;
            }
          }
        } catch {
          // Cross-origin boundary
        }
      }
    }
  }

  return null;
}

/**
 * Core filler function: never throws, returns FillResult
 */
export async function fillFieldWithRetry(
  field: FormField,
  value: string,
  rootDoc: Document = document,
  maxRetries: number = 2,
  delayMs: number = 80
): Promise<FillResult> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const res = fillField(field, value, rootDoc);
    if (res.ok || attempt === maxRetries) {
      return res;
    }
    // Element might still be mounting during React state transition
    attempt++;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return fillField(field, value, rootDoc);
}
export function fillField(
  field: FormField,
  value: string,
  rootDoc: Document = document
): FillResult {
  try {
    // Hard Rule 2: Never touch CAPTCHA or submit
    if (field.type === 'checkbox' && (field.name.toLowerCase().includes('captcha') || field.id.toLowerCase().includes('captcha'))) {
      return {
        ok: false,
        reason: 'Skipped: Rule 2 forbids auto-completing CAPTCHA / OTP verification.',
        fieldId: field.id,
      };
    }

    if (field.type === 'file' || field.type === 'dropzone') {
      return {
        ok: false,
        reason: 'File attachment slots are managed by Quick-Attach in M6.',
        fieldId: field.id,
      };
    }

    const element = resolveTargetElement(field, rootDoc);
    if (!element) {
      return {
        ok: false,
        reason: `Element not found for selector: ${field.selector}`,
        fieldId: field.id,
      };
    }

    let previousValue = '';

    // 1. Text, Email, Tel, Number, Date
    if (['text', 'email', 'tel', 'number', 'date'].includes(field.type)) {
      const input = element as HTMLInputElement;
      previousValue = input.value || '';
      input.focus();
      setNativeInputValue(input, value);
      dispatchInputEvents(input);
      return { ok: true, previousValue, newValue: value, fieldId: field.id };
    }

    // 2. Textarea
    if (field.type === 'textarea') {
      const textarea = element as HTMLTextAreaElement;
      previousValue = textarea.value || '';
      textarea.focus();
      setNativeInputValue(textarea, value);
      dispatchInputEvents(textarea);
      return { ok: true, previousValue, newValue: value, fieldId: field.id };
    }

    // 3. Native Select
    if (field.type === 'select') {
      const select = element as HTMLSelectElement;
      previousValue = select.value || '';
      select.focus();

      // Find matching option by value or text
      let targetValue = value;
      const options = Array.from(select.options);
      const match = options.find(
        (o) =>
          o.value.toLowerCase() === value.toLowerCase() ||
          o.text.trim().toLowerCase() === value.toLowerCase() ||
          o.text.trim().toLowerCase().includes(value.toLowerCase())
      );
      if (match) {
        targetValue = match.value;
      }

      const win = select.ownerDocument?.defaultView || window;
      const selectProto = (win as any).HTMLSelectElement?.prototype || HTMLSelectElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(selectProto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(select, targetValue);
      } else {
        select.value = targetValue;
      }

      dispatchInputEvents(select);
      return { ok: true, previousValue, newValue: targetValue, fieldId: field.id };
    }

    // 4. Radio Group
    if (field.type === 'radio') {
      const doc = field.isInsideIframe && element.ownerDocument ? element.ownerDocument : rootDoc;
      const radios = Array.from(doc.querySelectorAll<HTMLInputElement>(field.selector));
      const currentChecked = radios.find((r) => r.checked);
      previousValue = currentChecked?.value || '';

      const targetRadio = radios.find(
        (r) =>
          r.value.toLowerCase() === value.toLowerCase() ||
          r.parentElement?.textContent?.trim().toLowerCase().includes(value.toLowerCase())
      );

      if (targetRadio) {
        targetRadio.focus();
        targetRadio.checked = true;
        dispatchInputEvents(targetRadio);
        return { ok: true, previousValue, newValue: targetRadio.value, fieldId: field.id };
      }

      return {
        ok: false,
        reason: `No radio option matches "${value}"`,
        fieldId: field.id,
      };
    }

    // 5. Checkbox
    if (field.type === 'checkbox') {
      const checkbox = element as HTMLInputElement;
      previousValue = String(checkbox.checked);
      const shouldCheck = value === 'true' || value === '1' || value === 'on' || value === 'yes';
      checkbox.focus();
      checkbox.checked = shouldCheck;
      dispatchInputEvents(checkbox);
      return { ok: true, previousValue, newValue: String(shouldCheck), fieldId: field.id };
    }

    // 6. Custom Dropdown (Combobox)
    if (field.type === 'custom-select') {
      previousValue = element.textContent?.trim() || '';

      // Step A: open dropdown if not open
      const trigger =
        element.querySelector<HTMLButtonElement>('button') ||
        (element instanceof HTMLButtonElement ? element : null) ||
        element;
      trigger.click();

      // Step B: find option by text or data-value
      const opts = element.querySelectorAll<HTMLElement>('[role="option"], [data-value], li');
      let targetOption: HTMLElement | null = null;

      for (const opt of Array.from(opts)) {
        const text = opt.textContent?.trim() || '';
        const val = opt.getAttribute('data-value') || '';
        if (
          val.toLowerCase() === value.toLowerCase() ||
          text.toLowerCase() === value.toLowerCase() ||
          text.toLowerCase().includes(value.toLowerCase())
        ) {
          targetOption = opt;
          break;
        }
      }

      if (targetOption) {
        targetOption.click();
        return {
          ok: true,
          previousValue,
          newValue: targetOption.textContent?.trim() || value,
          fieldId: field.id,
        };
      }

      return {
        ok: false,
        reason: `Could not find custom dropdown option for "${value}"`,
        fieldId: field.id,
      };
    }

    return {
      ok: false,
      reason: `Unsupported field type: ${field.type}`,
      fieldId: field.id,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `Fill error: ${err instanceof Error ? err.message : String(err)}`,
      fieldId: field.id,
    };
  }
}

/**
 * Undo a previously recorded fill operation
 */
export function undoFieldFill(
  record: UndoRecord,
  rootDoc: Document = document
): boolean {
  try {
    const dummyField: FormField = {
      id: record.fieldId,
      name: record.fieldId,
      type: record.type,
      label: '',
      labelSource: 'none',
      labelConfidence: 1,
      required: false,
      selector: record.selector,
      isInsideIframe: record.isInsideIframe,
      iframeIdentifier: record.iframeIdentifier,
    };

    const res = fillField(dummyField, record.previousValue, rootDoc);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Visual highlight indicator on active page element
 */
export function highlightField(
  field: FormField,
  status: 'preview' | 'success' | 'error',
  rootDoc: Document = document
): void {
  const element = resolveTargetElement(field, rootDoc);
  if (!element) return;

  const originalOutline = element.style.outline;
  const originalTransition = element.style.transition;

  element.style.transition = 'outline 0.2s ease-in-out';
  if (status === 'preview') {
    element.style.outline = '3px solid #3b82f6'; // Blue
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (status === 'success') {
    element.style.outline = '3px solid #10b981'; // Green
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.transition = originalTransition;
    }, 2000);
  } else if (status === 'error') {
    element.style.outline = '3px dashed #ef4444'; // Red
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
