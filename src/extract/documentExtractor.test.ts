import { describe, it, expect } from 'vitest';
import { extractDocumentData } from './documentExtractor';

describe('Document Extractor Integration Tests', () => {
  it('extracts structured fields from plain text document', async () => {
    const textContent = `
      GOVERNMENT OF INDIA
      Name: Rahul Vikram Verma
      Date of Birth: 12/04/1999
      Permanent Account Number: ABCDE5678G
      Aadhaar No: 5432 9876 1234
      Address: 124 Green Park, New Delhi - 110016
      Mobile: 9876543210
      Email: rahul.verma@example.com
    `;

    const blob = new Blob([textContent], { type: 'text/plain' });
    const results = await extractDocumentData(blob, 'Aadhaar_Document.txt', 'aadhaar');

    const map = new Map(results.map((r) => [r.key, r.value]));

    expect(map.get('fullName')).toBe('Rahul Vikram Verma');
    expect(map.get('panNumber')).toBe('ABCDE5678G');
    expect(map.get('aadhaarNumber')).toBe('543298761234');
    expect(map.get('dob')).toBe('1999-04-12');
    expect(map.get('pincode')).toBe('110016');
    expect(map.get('mobile')).toBe('9876543210');
    expect(map.get('email')).toBe('rahul.verma@example.com');
  });

  it('extracts fields from file name hints when text is minimal', async () => {
    const blob = new Blob(['sample empty binary'], { type: 'application/octet-stream' });
    const results = await extractDocumentData(blob, 'PAN_ABCDE1234F_9876543210.pdf', 'pan');

    const map = new Map(results.map((r) => [r.key, r.value]));
    expect(map.get('panNumber')).toBe('ABCDE1234F');
    expect(map.get('mobile')).toBe('9876543210');
  });
});
