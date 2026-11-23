import { FormField } from '../types';

export type PortalErrorType =
  | 'FILE_TOO_LARGE'
  | 'WRONG_FORMAT'
  | 'EMPTY_REQUIRED'
  | 'INVALID_OPTION'
  | 'INVALID_DATE'
  | 'GENERIC_INVALID';

export interface PortalValidationError {
  id: string;
  fieldId?: string;
  fieldName?: string;
  selector?: string;
  errorText: string;
  errorType: PortalErrorType;
  errorElement: HTMLElement;
  associatedInput?: HTMLElement;
}

/**
 * Classifies an error message text into an actionable category for auto-recovery.
 */
export function classifyErrorText(text: string): PortalErrorType {
  const lower = text.toLowerCase();
  if (/too large|exceeds|max(?:imum)?\s*size|file\s*limit/i.test(lower)) {
    return 'FILE_TOO_LARGE';
  }
  if (/date|dd[-/]mm[-/]yyyy|yyyy[-/]mm[-/]dd|invalid date/i.test(lower)) {
    return 'INVALID_DATE';
  }
  if (/format|extension|pdf only|jpg only|jpeg only|png only|unsupported file/i.test(lower)) {
    return 'WRONG_FORMAT';
  }
  if (/select a valid|option|choice|please select/i.test(lower)) {
    return 'INVALID_OPTION';
  }
  if (/required|mandatory|cannot be (?:empty|blank)|must (?:enter|provide)/i.test(lower)) {
    return 'EMPTY_REQUIRED';
  }
  return 'GENERIC_INVALID';
}

/**
 * Scans the active document/page for portal validation errors and maps each error to its form field.
 */
export function scanPageValidationErrors(
  doc: Document = document,
  knownFields: FormField[] = []
): PortalValidationError[] {
  const errors: PortalValidationError[] = [];
  const seenElements = new Set<HTMLElement>();

  // 1. Elements marked aria-invalid="true"
  const ariaInvalidEls = doc.querySelectorAll<HTMLElement>('[aria-invalid="true"]');
  ariaInvalidEls.forEach((el) => {
    if (seenElements.has(el)) return;
    seenElements.add(el);

    // Look for description or nearby message
    let msg = el.getAttribute('aria-errormessage') || el.getAttribute('aria-describedby') || '';
    if (msg) {
      const descEl = doc.getElementById(msg);
      if (descEl?.textContent) msg = descEl.textContent.trim();
    }
    if (!msg) {
      msg = el.getAttribute('title') || 'Field is marked invalid by portal.';
    }

    const field = matchElementToField(el, knownFields);
    errors.push({
      id: `err_aria_${el.id || el.getAttribute('name') || Date.now()}`,
      fieldId: field?.id || el.id,
      fieldName: field?.name || el.getAttribute('name') || undefined,
      selector: field?.selector,
      errorText: msg,
      errorType: classifyErrorText(msg),
      errorElement: el,
      associatedInput: el,
    });
  });

  // 2. Elements with role="alert" or error classes
  const errorSelectors = [
    '[role="alert"]',
    '.error-message',
    '.invalid-feedback',
    '.field-error',
    '.text-danger',
    '.text-red-500',
    '.form-error',
    '[class*="error-text"]',
  ];

  const candidateEls = doc.querySelectorAll<HTMLElement>(errorSelectors.join(', '));
  candidateEls.forEach((el) => {
    if (seenElements.has(el)) return;

    // Check visibility
    const isExplicitlyHidden =
      el.style.display === 'none' ||
      el.style.visibility === 'hidden' ||
      el.hasAttribute('hidden') ||
      el.classList.contains('hidden');
    if (isExplicitlyHidden) return;

    const text = el.textContent?.trim();
    if (!text || text.length < 3) return;

    // Verify it contains an error phrase
    if (!/invalid|required|error|exceeds|too large|format|select|missing/i.test(text)) {
      return;
    }

    seenElements.add(el);

    // Map error element to its associated form input / field
    const associatedInput = findAssociatedInputForError(el, doc);
    const field = associatedInput ? matchElementToField(associatedInput, knownFields) : undefined;

    errors.push({
      id: `err_el_${el.id || Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fieldId: field?.id || associatedInput?.id,
      fieldName: field?.name || associatedInput?.getAttribute('name') || undefined,
      selector: field?.selector,
      errorText: text,
      errorType: classifyErrorText(text),
      errorElement: el,
      associatedInput: associatedInput || undefined,
    });
  });

  return errors;
}

/**
 * Finds the nearest input or form control associated with an error message element.
 */
export function findAssociatedInputForError(errorEl: HTMLElement, doc: Document): HTMLElement | null {
  // 1. Check aria-describedby backlinks
  if (errorEl.id) {
    const pointed = doc.querySelector<HTMLElement>(`[aria-describedby~="${errorEl.id}"], [aria-errormessage="${errorEl.id}"]`);
    if (pointed) return pointed;
  }

  // 2. Check enclosing form group or dropzone wrapper
  const wrapper = errorEl.closest<HTMLElement>(
    '[data-formpilot-dropzone-wrapper], .form-group, .field, [class*="space-y"], [class*="form-control"]'
  );
  if (wrapper) {
    const input = wrapper.querySelector<HTMLElement>('input, select, textarea, [data-formpilot-dropzone="true"]');
    if (input && input !== errorEl) return input;
  }

  // 3. Check preceding sibling
  let prev = errorEl.previousElementSibling;
  while (prev) {
    if (prev instanceof HTMLInputElement || prev instanceof HTMLSelectElement || prev instanceof HTMLTextAreaElement) {
      return prev;
    }
    const inner = prev.querySelector<HTMLElement>('input, select, textarea');
    if (inner) return inner;
    prev = prev.previousElementSibling;
  }

  // 4. Check parent container
  const parent = errorEl.parentElement;
  if (parent) {
    const siblingInput = parent.querySelector<HTMLElement>('input, select, textarea');
    if (siblingInput && siblingInput !== errorEl) return siblingInput;
  }

  return null;
}

function matchElementToField(el: HTMLElement, knownFields: FormField[]): FormField | undefined {
  if (el.id) {
    const f = knownFields.find((k) => k.id === el.id);
    if (f) return f;
  }

  const name = el.getAttribute('name');
  if (name) {
    const f = knownFields.find((k) => k.name === name);
    if (f) return f;
  }

  return undefined;
}

