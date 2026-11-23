import { describe, it, expect } from 'vitest';
import { extractFromTextWithRegex } from './regex';
import { autoClassifyDocument } from './classifier';

describe('M4 Local RegEx Extraction Tests', () => {
  it('extracts Aadhaar, PAN, DOB, IFSC, pincode, mobile, email, fullName, and bank details from text', () => {
    const rawDocumentText = `
      GOVERNMENT OF INDIA / INCOME TAX DEPARTMENT
      Name: Aditi Ramesh Sharma
      Father's Name: Ramesh Sharma
      Gender: Female
      Permanent Account Number: ABCDE1234F
      Date of Birth: 15/08/2001
      Aadhaar No: 9876 5432 1012
      Address: Flat 402, Sunshine Heights, Mumbai - 400001
      Contact Mobile: +91 9876543210
      Email: aditi.sharma@example.com
      Account Number: 123456789012
      Account Type: Savings
      Bank Account IFSC: SBIN0001234
    `;

    const results = extractFromTextWithRegex(rawDocumentText);
    const map = new Map(results.map((r) => [r.key, r.value]));

    expect(map.get('fullName')).toBe('Aditi Ramesh Sharma');
    expect(map.get('fatherName')).toBe('Ramesh Sharma');
    expect(map.get('gender')).toBe('female');
    expect(map.get('panNumber')).toBe('ABCDE1234F');
    expect(map.get('aadhaarNumber')).toBe('987654321012');
    expect(map.get('dob')).toBe('2001-08-15');
    expect(map.get('ifsc')).toBe('SBIN0001234');
    expect(map.get('bankAccount')).toBe('123456789012');
    expect(map.get('bankAccountType')).toBe('savings');
    expect(map.get('pincode')).toBe('400001');
    expect(map.get('mobile')).toBe('9876543210');
    expect(map.get('email')).toBe('aditi.sharma@example.com');

    // All should be tagged as source: 'regex'
    expect(results.every((r) => r.source === 'regex')).toBe(true);
  });

  it('extracts educational details from marksheet text', () => {
    const marksheetText = `
      PUNE STATE UNIVERSITY
      Candidate Name: Aditi Ramesh Sharma
      Course: Bachelor of Technology (Computer Science)
      Institution: Pune Institute of Technology
      Marks Percentage: 88.4%
    `;

    const results = extractFromTextWithRegex(marksheetText);
    const map = new Map(results.map((r) => [r.key, r.value]));

    expect(map.get('fullName')).toBe('Aditi Ramesh Sharma');
    expect(map.get('marksPercent')).toBe('88.4');
    expect(map.get('institution')).toContain('Pune');
    expect(map.get('course')).toContain('Bachelor of Technology');
  });

  it('auto-classifies documents from filename and content keywords', () => {
    const aadhaarClass = autoClassifyDocument('my_aadhaar_card.png');
    expect(aadhaarClass.type).toBe('aadhaar');
    expect(aadhaarClass.tags).toContain('identity');

    const panClass = autoClassifyDocument('scan_pan_tax.jpg');
    expect(panClass.type).toBe('pan');

    const bankClass = autoClassifyDocument('sbi_passbook_copy.pdf');
    expect(bankClass.type).toBe('bank_passbook');

    const markClass = autoClassifyDocument('12th_marksheet_final.png');
    expect(markClass.type).toBe('marksheet');
  });
});
