import { FormField, FormFieldOption, FormFieldType, FormSchema, LabelSource } from '../types';
import { parseSizeLimitFromText } from '../compress/sizeParser';

// ─── Label resolution ───────────────────────────────────────────────

interface LabelResult {
  label: string;
  source: LabelSource;
  confidence: number;
}

/**
 * Resolve a human-readable label for a form element.
 * Order: label[for] → wrapping <label> → aria-labelledby → aria-label →
 *        placeholder → title → nearest preceding text → name attr → none.
 */
export function findLabelForElement(
  element: HTMLElement,
  rootDoc: Document | ShadowRoot = document,
): LabelResult {
  // 1. <label for="id">
  if (element.id) {
    const labelElem = rootDoc.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (labelElem) {
      const text = cleanLabelText(labelElem);
      if (text) return { label: text, source: 'label-for', confidence: 1.0 };
    }
  }

  // 2. Wrapping <label>
  const parentLabel = element.closest('label');
  if (parentLabel) {
    const text = cleanLabelText(parentLabel);
    if (text) return { label: text, source: 'wrapping-label', confidence: 0.95 };
  }

  // 3. aria-labelledby
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const doc = rootDoc instanceof Document ? rootDoc : document;
    const ids = ariaLabelledBy.split(/\s+/);
    const parts = ids
      .map(id => doc.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return { label: parts.join(' '), source: 'aria-labelledby', confidence: 0.95 };
    }
  }

  // 4. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel?.trim()) {
    return { label: ariaLabel.trim(), source: 'aria-label', confidence: 0.9 };
  }

  // 5. Nearest preceding text — walk up the DOM looking for siblings/headings
  const nearbyLabel = findNearbyLabelText(element);
  if (nearbyLabel) {
    return { label: nearbyLabel, source: 'nearby-text', confidence: 0.75 };
  }

  // 6. placeholder
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.placeholder?.trim()) {
      return { label: element.placeholder.trim(), source: 'placeholder', confidence: 0.6 };
    }
  }

  // 7. title attribute
  const title = element.getAttribute('title');
  if (title?.trim()) {
    return { label: title.trim(), source: 'title', confidence: 0.5 };
  }

  // 8. name attribute (humanised)
  const name = element.getAttribute('name');
  if (name?.trim()) {
    const humanised = name
      .replace(/[_\-\[\]]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
    return { label: humanised, source: 'name-attr', confidence: 0.3 };
  }

  return { label: 'Unnamed Field', source: 'none', confidence: 0 };
}

/** Remove inner inputs/buttons from a cloned label and return trimmed text. */
function cleanLabelText(label: Element): string {
  const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input, select, textarea, button, svg').forEach(el => el.remove());
  return clone.textContent?.trim().replace(/\s+/g, ' ') ?? '';
}

/** Walk preceding siblings and parent's preceding siblings to find label-like text. */
function findNearbyLabelText(element: HTMLElement): string | undefined {
  const labelTags = new Set(['LABEL', 'SPAN', 'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TH', 'DT', 'LEGEND']);

  // Check preceding siblings
  let prev = element.previousElementSibling;
  while (prev) {
    if (labelTags.has(prev.tagName)) {
      const text = prev.textContent?.trim();
      if (text && text.length > 0 && text.length < 120) return text;
    }
    prev = prev.previousElementSibling;
  }

  // Walk up to 3 parent levels and check parent's preceding siblings
  let container: HTMLElement | null = element.parentElement;
  for (let depth = 0; depth < 3 && container; depth++) {
    let pSib = container.previousElementSibling;
    while (pSib) {
      if (labelTags.has(pSib.tagName)) {
        const text = pSib.textContent?.trim();
        if (text && text.length > 0 && text.length < 120) return text;
      }
      pSib = pSib.previousElementSibling;
    }
    container = container.parentElement;
  }

  return undefined;
}

// ─── Hint / size detection ──────────────────────────────────────────

/**
 * Find hint text near an element: walk up 4 ancestor levels looking for
 * elements whose text contains size/format keywords.
 */
export function findHintNearElement(element: HTMLElement): string | undefined {
  const hintSelectors = ['.hint', '.help-text', '.form-text', 'small', 'p', 'span'];
  const hintPattern = /max|kb|mb|pdf|format|required|allowed|size|limit|jpg|png|jpeg|doc|upload|accept/i;

  let currentContainer: HTMLElement | null = element.parentElement;
  let depth = 0;

  while (currentContainer && depth < 4) {
    for (const sel of hintSelectors) {
      const hintElems = currentContainer.querySelectorAll(sel);
      for (const h of Array.from(hintElems)) {
        if (h !== element && !h.contains(element)) {
          const text = h.textContent?.trim();
          if (text && text.length > 2 && text.length < 200 && hintPattern.test(text)) {
            return text;
          }
        }
      }
    }

    // Also check container's next sibling
    const nextSibling = currentContainer.nextElementSibling;
    if (nextSibling && ['P', 'SMALL', 'SPAN', 'DIV'].includes(nextSibling.tagName)) {
      const text = nextSibling.textContent?.trim();
      if (text && hintPattern.test(text)) {
        return text;
      }
    }

    currentContainer = currentContainer.parentElement;
    depth++;
  }

  return undefined;
}

// ─── CAPTCHA detection ──────────────────────────────────────────────

export function hasCaptchaInRoot(root: Document | ShadowRoot): boolean {
  return Boolean(
    root.querySelector(
      '.g-recaptcha, .h-captcha, .cf-turnstile, [data-formpilot-captcha], ' +
      '[id*="captcha" i], [class*="captcha" i], ' +
      'iframe[src*="recaptcha"], iframe[src*="turnstile"]'
    )
  );
}

// ─── Stable field ID generation ─────────────────────────────────────

function makeStableId(
  el: HTMLElement,
  framePrefix: string,
  fieldIndex: number,
): string {
  // Prefer the element's own id — it's most stable
  if (el.id) return `${framePrefix}${el.id}`;
  // Then name + type (radios share name so caller handles groups separately)
  const name = el.getAttribute('name');
  const type = (el as HTMLInputElement).type ?? el.tagName.toLowerCase();
  if (name) return `${framePrefix}${name}__${type}__${fieldIndex}`;
  // Fallback: tagname + index (least stable but deterministic within one scan)
  return `${framePrefix}fp_${el.tagName.toLowerCase()}_${fieldIndex}`;
}

// ─── Field extraction ───────────────────────────────────────────────

function extractFieldsFromRoot(
  root: Document | ShadowRoot,
  isInsideIframe: boolean,
  iframeIdentifier?: string,
  iframeIndex?: number,
): FormField[] {
  const fields: FormField[] = [];
  const framePrefix = iframeIdentifier ? `${iframeIdentifier}::` : '';

  // Collect all candidate elements
  const elements = root.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), ' +
    'select, textarea, ' +
    '[data-formpilot-custom-dropdown], [data-formpilot-dropzone], [role="combobox"]'
  );

  // ── Phase 1: group radio buttons by name ──────────────────────────
  const radioGroups = new Map<string, HTMLInputElement[]>();
  const nonRadioElements: HTMLElement[] = [];

  elements.forEach((el) => {
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const groupName = el.getAttribute('name') || '__unnamed_radio__';
      const existing = radioGroups.get(groupName) || [];
      existing.push(el);
      radioGroups.set(groupName, existing);
    } else {
      nonRadioElements.push(el);
    }
  });

  let fieldIndex = 0;
  const seenIds = new Set<string>();

  // ── Phase 2: emit one field per radio group ───────────────────────
  for (const [groupName, radios] of radioGroups) {
    fieldIndex++;
    const id = `${framePrefix}radiogroup_${groupName}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Collect options from every radio in the group
    const options: FormFieldOption[] = radios.map(r => {
      const lbl = findLabelForElement(r, root);
      return {
        label: lbl.label,
        value: r.value,
      };
    });

    // The group label: look for a <legend>, <label>, or heading that wraps/precedes all radios
    const groupLabel = resolveRadioGroupLabel(radios);
    const required = radios.some(r => r.hasAttribute('required') || r.getAttribute('aria-required') === 'true');

    const selector = `input[name="${CSS.escape(groupName)}"]`;

    fields.push({
      id,
      name: groupName,
      type: 'radio',
      label: groupLabel.label,
      labelSource: groupLabel.source,
      labelConfidence: groupLabel.confidence,
      required,
      options,
      selector,
      currentValue: radios.find(r => r.checked)?.value ?? '',
      isInsideIframe,
      iframeIndex,
      iframeIdentifier,
    });
  }

  // ── Phase 3: process remaining (non-radio) elements ───────────────
  for (const el of nonRadioElements) {
    // Dropzone container wrapping a real file input → skip container
    if (el.hasAttribute('data-formpilot-dropzone') && el.querySelector('input[type="file"]')) {
      continue;
    }

    // Skip duplicate combobox if its id already processed
    const isCombobox = el.hasAttribute('data-formpilot-custom-dropdown') || el.getAttribute('role') === 'combobox';

    // Visibility: skip hidden elements unless file input (often hidden behind styled UI)
    const isFileInput = el instanceof HTMLInputElement && el.type === 'file';
    if (!isFileInput) {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
        // Check if parent has class 'hidden' (Tailwind) — file inputs use this pattern
        if (!el.classList.contains('hidden') && !el.closest('[data-formpilot-dropzone]')) {
          continue;
        }
      }
    }

    fieldIndex++;
    const stableId = makeStableId(el, framePrefix, fieldIndex);
    if (seenIds.has(stableId)) continue;
    seenIds.add(stableId);

    const nameAttr = el.getAttribute('name') || el.id || stableId;
    const labelResult = findLabelForElement(el, root);
    const hint = findHintNearElement(el);

    const required =
      el.hasAttribute('required') ||
      el.getAttribute('aria-required') === 'true' ||
      /\*/.test(labelResult.label);

    let type: FormFieldType = 'text';
    let options: FormFieldOption[] | undefined;
    let accept: string | undefined;
    let multiple: boolean | undefined;
    let placeholder: string | undefined;
    let maxLength: number | undefined;
    let min: string | undefined;
    let max: string | undefined;
    let pattern: string | undefined;

    if (el instanceof HTMLInputElement) {
      placeholder = el.placeholder || undefined;

      if (el.type === 'file') {
        type = 'file';
        accept = el.accept || undefined;
        multiple = el.multiple || undefined;
      } else if (el.type === 'checkbox') {
        type = 'checkbox';
      } else if (el.type === 'password') {
        type = 'password';
      } else if (['number', 'email', 'tel', 'date'].includes(el.type)) {
        type = el.type as FormFieldType;
      } else {
        type = 'text';
      }

      // Validation attributes
      if (el.maxLength > 0 && el.maxLength < 524288) maxLength = el.maxLength;
      if (el.min) min = el.min;
      if (el.max) max = el.max;
      if (el.pattern) pattern = el.pattern;

    } else if (el instanceof HTMLSelectElement) {
      type = 'select';
      multiple = el.multiple || undefined;
      options = Array.from(el.options).map(opt => ({
        label: opt.text.trim(),
        value: opt.value,
      }));

    } else if (el instanceof HTMLTextAreaElement) {
      type = 'textarea';
      placeholder = el.placeholder || undefined;
      if (el.maxLength > 0 && el.maxLength < 524288) maxLength = el.maxLength;

    } else if (isCombobox) {
      type = 'custom-select';
      const opts = el.querySelectorAll('[role="option"], [data-value]');
      if (opts.length > 0) {
        options = Array.from(opts).map(opt => ({
          label: opt.textContent?.trim() || '',
          value: opt.getAttribute('data-value') || opt.textContent?.trim() || '',
        }));
      }

    } else if (el.hasAttribute('data-formpilot-dropzone')) {
      type = 'dropzone';
    }

    // Parse maxSizeBytes from hint text
    let maxSizeBytes: number | undefined;
    if (hint && (type === 'file' || type === 'dropzone')) {
      const parsed = parseSizeLimitFromText(hint);
      if (parsed) maxSizeBytes = parsed.maxSizeBytes;
    }

    // Build selector
    let selector = '';
    if (el.id) {
      selector = `#${CSS.escape(el.id)}`;
    } else if (el.getAttribute('name')) {
      selector = `[name="${CSS.escape(el.getAttribute('name')!)}"]`;
    } else {
      selector = `[data-fp-id="${stableId}"]`;
      el.setAttribute('data-fp-id', stableId);
    }

    fields.push({
      id: stableId,
      name: nameAttr,
      type,
      label: labelResult.label,
      labelSource: labelResult.source,
      labelConfidence: labelResult.confidence,
      placeholder,
      required,
      options,
      hint,
      accept,
      multiple,
      maxSizeBytes,
      maxLength,
      min,
      max,
      pattern,
      selector,
      currentValue: (el as HTMLInputElement).value ?? '',
      isInsideIframe,
      iframeIndex,
      iframeIdentifier,
    });
  }

  return fields;
}

/** Resolve the label for a radio group: <fieldset>/<legend>, or the shared container's heading. */
function resolveRadioGroupLabel(
  radios: HTMLInputElement[],
): LabelResult {
  const first = radios[0];

  // Check for <fieldset>/<legend>
  const fieldset = first.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend?.textContent?.trim()) {
      return { label: legend.textContent.trim(), source: 'wrapping-label', confidence: 0.95 };
    }
  }

  // Walk up to find a preceding label/heading before the radio container
  let container: HTMLElement | null = first.parentElement;
  for (let i = 0; i < 4 && container; i++) {
    // Check previous sibling of container
    let prev = container.previousElementSibling;
    while (prev) {
      if (['LABEL', 'LEGEND', 'H3', 'H4', 'H5', 'P', 'SPAN', 'DIV'].includes(prev.tagName)) {
        const text = prev.textContent?.trim();
        if (text && text.length < 120) {
          return { label: text, source: 'nearby-text', confidence: 0.65 };
        }
      }
      prev = prev.previousElementSibling;
    }

    // Check if the container has a direct preceding <label> (the React pattern in demo forms)
    const sibLabel = container.parentElement?.querySelector(':scope > label');
    if (sibLabel && !sibLabel.querySelector('input')) {
      const text = sibLabel.textContent?.trim();
      if (text && text.length < 120) {
        return { label: text, source: 'label-for', confidence: 0.9 };
      }
    }

    container = container.parentElement;
  }

  // Fallback: use group name
  const name = first.getAttribute('name');
  if (name) {
    return {
      label: name.replace(/[_\-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim(),
      source: 'name-attr',
      confidence: 0.3,
    };
  }

  return { label: 'Unnamed Radio Group', source: 'none', confidence: 0 };
}

// ─── Top-level scan ─────────────────────────────────────────────────

export function scanDocumentForms(root: Document | ShadowRoot = document): FormSchema {
  const isTopWindowAnIframe =
    typeof window !== 'undefined' && typeof window.top !== 'undefined'
      ? window.self !== window.top
      : false;

  const allFields: FormField[] = [];
  let hasCaptcha = false;

  // 1. Scan current document/root
  const currentDocFields = extractFieldsFromRoot(root, isTopWindowAnIframe);
  allFields.push(...currentDocFields);

  if (hasCaptchaInRoot(root)) {
    hasCaptcha = true;
  }

  // 2. Walk into same-origin iframes
  try {
    const iframes = root.querySelectorAll<HTMLIFrameElement>('iframe, frame');
    let iframeIdx = 0;

    iframes.forEach((iframe) => {
      iframeIdx++;
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const iframeId = iframe.id || iframe.name || `iframe_${iframeIdx}`;
          const iframeFields = extractFieldsFromRoot(iframeDoc, true, iframeId, iframeIdx);
          allFields.push(...iframeFields);

          if (hasCaptchaInRoot(iframeDoc)) {
            hasCaptcha = true;
          }
        }
      } catch {
        // Cross-origin: handled by all_frames: true
      }
    });
  } catch {
    // DOM query issues
  }

  const url = typeof window !== 'undefined' ? window.location?.href ?? '' : '';
  const title = typeof document !== 'undefined' ? document.title || 'Web Form' : 'Web Form';

  return {
    id: `schema_${Date.now()}`,
    url,
    title,
    fields: allFields,
    hasCaptcha,
    timestamp: Date.now(),
  };
}
