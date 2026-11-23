/**
 * Parses maximum file size limits from portal hint texts or attribute strings.
 * Examples:
 *   "Max size 200 KB, PDF only" -> 200 * 1024 bytes (204,800 bytes)
 *   "File must be under 2MB" -> 2 * 1024 * 1024 bytes (2,097,152 bytes)
 *   "Maximum 500kb" -> 500 * 1024 bytes
 */
export function parseSizeLimitFromText(text: string): { maxSizeBytes: number; maxSizeKB: number; rawUnit: 'KB' | 'MB' } | null {
  if (!text) return null;

  // Match patterns like "max [size] 200 kb", "under 2 MB", "limit: 500kb", "up to 1.5MB"
  const regex = /(?:max(?:imum)?(?:\s+size|\s+file\s+size)?|under|up\s+to|limit[:\s]*|less\s+than)\s*[:\s]*(\d+(?:\.\d+)?)\s*(kb|mb|bytes?|b)/i;
  const match = text.match(regex);

  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (unit.startsWith('M')) {
      const bytes = Math.round(value * 1024 * 1024);
      return { maxSizeBytes: bytes, maxSizeKB: Math.round(value * 1024), rawUnit: 'MB' };
    } else if (unit.startsWith('K')) {
      const bytes = Math.round(value * 1024);
      return { maxSizeBytes: bytes, maxSizeKB: Math.round(value), rawUnit: 'KB' };
    }
  }

  // Fallback: standalone "200 KB" or "2 MB" if preceded or followed by size keywords
  const fallbackRegex = /(\d+(?:\.\d+)?)\s*(kb|mb)/i;
  if (/size|file|limit|upload/i.test(text)) {
    const fallbackMatch = text.match(fallbackRegex);
    if (fallbackMatch) {
      const value = parseFloat(fallbackMatch[1]);
      const unit = fallbackMatch[2].toUpperCase();
      if (unit.startsWith('M')) {
        return { maxSizeBytes: Math.round(value * 1024 * 1024), maxSizeKB: Math.round(value * 1024), rawUnit: 'MB' };
      } else {
        return { maxSizeBytes: Math.round(value * 1024), maxSizeKB: Math.round(value), rawUnit: 'KB' };
      }
    }
  }

  return null;
}

export interface SlotSizeLimitDetection {
  maxSizeBytes: number | null;
  maxSizeKB: number | null;
  detectedText: string | null;
  isPngOnly: boolean;
  acceptedTypes: string[];
}

/**
 * Detects maximum file size limits and accepted types from an upload slot's DOM environment.
 */
export function detectSlotSizeLimit(element: HTMLElement): SlotSizeLimitDetection {
  let isPngOnly = false;
  const acceptedTypes: string[] = [];

  // 1. Check accept attribute on element or associated file input
  const fileInput =
    element instanceof HTMLInputElement && element.type === 'file'
      ? element
      : element.querySelector<HTMLInputElement>('input[type="file"]') ||
        element.closest('[data-formpilot-dropzone-wrapper], .dropzone')?.querySelector<HTMLInputElement>('input[type="file"]');

  const accept = fileInput?.getAttribute('accept') || element.getAttribute('accept') || '';
  if (accept) {
    const rawTokens = accept.split(',').map((t) => t.trim().toLowerCase());
    acceptedTypes.push(...rawTokens);

    const hasPng = rawTokens.some((t) => t.includes('png'));
    const hasJpg = rawTokens.some((t) => t.includes('jpg') || t.includes('jpeg') || t.includes('image/*'));
    const hasPdf = rawTokens.some((t) => t.includes('pdf'));

    if (hasPng && !hasJpg && !hasPdf) {
      isPngOnly = true;
    }
  }

  // 2. Search for size limit phrases in surrounding text and attributes
  const candidateTexts: string[] = [];

  const directHint =
    element.getAttribute('data-hint') ||
    element.getAttribute('placeholder') ||
    element.getAttribute('title') ||
    element.getAttribute('aria-label');
  if (directHint) candidateTexts.push(directHint);

  const wrapper = element.closest('[data-formpilot-dropzone-wrapper], .dropzone, [data-dropzone], form, div');
  if (wrapper) {
    const hintEls = wrapper.querySelectorAll('.hint, [class*="hint"], small, [data-hint]');
    hintEls.forEach((h) => {
      if (h.textContent?.trim()) candidateTexts.push(h.textContent.trim());
    });

    const labels = wrapper.querySelectorAll('label, p, span');
    labels.forEach((l) => {
      const txt = l.textContent?.trim();
      if (txt && /size|kb|mb|limit|max/i.test(txt)) {
        candidateTexts.push(txt);
      }
    });
  }

  for (const text of candidateTexts) {
    const parsed = parseSizeLimitFromText(text);
    if (parsed) {
      return {
        maxSizeBytes: parsed.maxSizeBytes,
        maxSizeKB: parsed.maxSizeKB,
        detectedText: text,
        isPngOnly,
        acceptedTypes,
      };
    }
  }

  return {
    maxSizeBytes: null,
    maxSizeKB: null,
    detectedText: null,
    isPngOnly,
    acceptedTypes,
  };
}
