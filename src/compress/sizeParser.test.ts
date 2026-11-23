import { describe, it, expect } from 'vitest';
import { parseSizeLimitFromText } from './sizeParser';

describe('Size Limit Parser', () => {
  it('parses "Max size 200 KB, PDF only"', () => {
    const result = parseSizeLimitFromText('Max size 200 KB, PDF only');
    expect(result).not.toBeNull();
    expect(result?.maxSizeKB).toBe(200);
    expect(result?.maxSizeBytes).toBe(204800);
    expect(result?.rawUnit).toBe('KB');
  });

  it('parses "Max size 500 KB, PDF or JPG"', () => {
    const result = parseSizeLimitFromText('Max size 500 KB, PDF or JPG');
    expect(result).not.toBeNull();
    expect(result?.maxSizeKB).toBe(500);
    expect(result?.maxSizeBytes).toBe(512000);
  });

  it('parses MB limits like "File must be under 2MB"', () => {
    const result = parseSizeLimitFromText('File must be under 2MB');
    expect(result).not.toBeNull();
    expect(result?.maxSizeKB).toBe(2048);
    expect(result?.maxSizeBytes).toBe(2097152);
    expect(result?.rawUnit).toBe('MB');
  });

  it('parses "up to 1.5 MB"', () => {
    const result = parseSizeLimitFromText('Allowed file size: up to 1.5 MB');
    expect(result).not.toBeNull();
    expect(result?.maxSizeKB).toBe(1536);
  });

  it('returns null on irrelevant texts', () => {
    const result = parseSizeLimitFromText('Please enter your full name as per Aadhaar');
    expect(result).toBeNull();
  });
});
