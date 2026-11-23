import { FormField } from '../types';

/**
 * Computes a fast, deterministic DJB2-style 64-bit hex hash of a string.
 */
function fastHash(str: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Computes a deterministic form signature based on URL origin and sorted field labels/types.
 */
export function computeFormSignature(
  urlOrOrigin: string,
  fields: Array<Pick<FormField, 'label' | 'type' | 'name'>>
): string {
  let origin = 'unknown';
  try {
    const parsed = new URL(urlOrOrigin);
    origin = parsed.origin;
  } catch {
    origin = urlOrOrigin.split('/')[0] || 'local';
  }

  const sortedFieldsStr = fields
    .map((f) => `${(f.label || '').trim().toLowerCase()}:${f.type}:${(f.name || '').trim().toLowerCase()}`)
    .sort()
    .join('|');

  const rawSignature = `${origin.toLowerCase()}#${sortedFieldsStr}`;
  return `sig_${fastHash(rawSignature)}`;
}
