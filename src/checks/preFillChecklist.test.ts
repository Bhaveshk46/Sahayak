import { describe, it, expect, beforeEach } from 'vitest';
import { compareNames } from './nameMatcher';
import { checkDocumentExpiry } from './expiryChecker';
import { runPreFillChecklist, normalizeDate } from './preFillChecklist';
import { scanPageValidationErrors, classifyErrorText } from '../recovery/errorScanner';
import { RecoveryEngine } from '../recovery/recoveryEngine';
import { FormField } from '../types';
import { ProfileRecord } from '../types/profile';

describe('M8 Pre-Fill Checklist & Error Recovery Evaluation', () => {
  describe('Name Mismatch Detection Across Documents', () => {
    it('detects exact name matches with high similarity', () => {
      const res = compareNames('ADITI RAMESH SHARMA', 'ADITI RAMESH SHARMA');
      expect(res.match).toBe(true);
      expect(res.confidence).toBe(1.0);
      expect(res.isInitialsMatch).toBe(false);
    });

    it('detects token reordering (e.g. Surname First vs Given Name First)', () => {
      const res = compareNames('SHARMA ADITI R', 'ADITI R SHARMA');
      expect(res.match).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
      expect(res.isInitialsMatch).toBe(false);
    });

    it('detects initials expansion ("A. R. Sharma" vs "Aditi Ramesh Sharma")', () => {
      const res = compareNames('A. R. Sharma', 'Aditi Ramesh Sharma');
      expect(res.match).toBe(true);
      expect(res.isInitialsMatch).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('flags true name discrepancies as error (e.g. wrong middle name / different person)', () => {
      const res = compareNames('Aditi Suresh Sharma', 'Aditi Ramesh Sharma');
      expect(res.match).toBe(false);
      expect(res.confidence).toBeLessThan(0.85);
    });
  });

  describe('DOB Mismatch Detection', () => {
    it('normalizes dates across formats (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)', () => {
      expect(normalizeDate('2002-05-14')).toBe('14-05-2002');
      expect(normalizeDate('14/05/2002')).toBe('14-05-2002');
      expect(normalizeDate('14-05-2002')).toBe('14-05-2002');
    });

    it('flags DOB discrepancy across documents', () => {
      const fields: FormField[] = [
        {
          id: 'dob_field',
          name: 'date_of_birth',
          label: 'Date of Birth',
          type: 'date',
          selector: '#dob_field',
          required: true,
          labelSource: 'label-for',
          labelConfidence: 1.0,
          isInsideIframe: false,
        },
      ];

      const profile: ProfileRecord[] = [
        {
          key: 'dob',
          value: '14-05-2002',
          confidence: 0.95,
          source: 'sarvam',
          sourceDocId: 'doc_aadhaar',
          verifiedByUser: true,
          updatedAt: Date.now(),
        },
        {
          key: 'dob_marksheet',
          value: '15-08-2001',
          confidence: 0.9,
          source: 'sarvam',
          sourceDocId: 'doc_10th_marksheet',
          verifiedByUser: true,
          updatedAt: Date.now(),
        },
      ];

      const res = runPreFillChecklist(fields, [], profile, []);
      const dobIssue = res.issues.find((i) => i.category === 'dob-mismatch');
      expect(dobIssue).toBeDefined();
      expect(dobIssue?.severity).toBe('error');
      expect(dobIssue?.title).toContain('Date of Birth Mismatch');
    });
  });

  describe('Document Expiry Rules', () => {
    it('flags an income certificate issued > 1 year ago as expired/stale', () => {
      // 2 years ago
      const twoYearsAgoMs = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
      const res = checkDocumentExpiry(
        {
          name: 'State Tehsildar Income Certificate 2022',
          type: 'income_certificate',
          addedAt: twoYearsAgoMs,
        },
        { incomeCertValidityYears: 1 }
      );

      expect(res.isExpired).toBe(true);
      expect(res.reason).toContain('year(s) old');
    });

    it('passes an income certificate issued within the validity window', () => {
      // 3 months ago
      const threeMonthsAgoMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const res = checkDocumentExpiry(
        {
          name: 'Income Certificate 2025',
          type: 'income_certificate',
          addedAt: threeMonthsAgoMs,
        },
        { incomeCertValidityYears: 1 }
      );

      expect(res.isExpired).toBe(false);
    });
  });

  describe('Error Scanner & Error-to-Field Mapping', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('classifies error text into proper categories', () => {
      expect(classifyErrorText('File size exceeds 200 KB limit')).toBe('FILE_TOO_LARGE');
      expect(classifyErrorText('Please enter date in DD-MM-YYYY format')).toBe('INVALID_DATE');
      expect(classifyErrorText('This field is mandatory / required')).toBe('EMPTY_REQUIRED');
      expect(classifyErrorText('Unsupported file format, PDF only')).toBe('WRONG_FORMAT');
    });

    it('maps aria-invalid and alert errors to their corresponding form input', () => {
      document.body.innerHTML = `
        <form id="test-form">
          <div class="form-group">
            <label for="income_cert">Income Certificate</label>
            <input type="file" id="income_cert" name="income_cert" aria-invalid="true" />
            <div role="alert" class="error-msg">File size exceeds maximum allowed 200 KB</div>
          </div>
          <div class="form-group">
            <label for="birth_date">Date of Birth</label>
            <input type="text" id="birth_date" name="birth_date" class="is-invalid" value="2002/05/14" />
            <span class="error-text">Please enter date in DD-MM-YYYY format</span>
          </div>
        </form>
      `;

      const fields: FormField[] = [
        {
          id: 'income_cert',
          name: 'income_cert',
          label: 'Income Certificate',
          type: 'file',
          selector: '#income_cert',
          required: true,
          labelSource: 'label-for',
          labelConfidence: 1.0,
          isInsideIframe: false,
        },
        {
          id: 'birth_date',
          name: 'birth_date',
          label: 'Date of Birth',
          type: 'text',
          selector: '#birth_date',
          required: true,
          labelSource: 'label-for',
          labelConfidence: 1.0,
          isInsideIframe: false,
        },
      ];

      const detectedErrors = scanPageValidationErrors(document, fields);
      expect(detectedErrors.length).toBeGreaterThanOrEqual(2);

      const fileError = detectedErrors.find((e) => e.errorType === 'FILE_TOO_LARGE');
      expect(fileError).toBeDefined();
      expect(fileError?.fieldId).toBe('income_cert');

      const dateError = detectedErrors.find((e) => e.errorType === 'INVALID_DATE');
      expect(dateError).toBeDefined();
      expect(dateError?.fieldId).toBe('birth_date');
    });
  });

  describe('Single-Retry Limit & Error Recovery Engine', () => {
    it('fixes obvious errors ONCE automatically and caps retries at 1 (never loops)', async () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="guardian_name" name="guardian_name" value="" />
        </form>
      `;

      const fields: FormField[] = [
        {
          id: 'guardian_name',
          name: 'guardian_name',
          label: 'Guardian Name',
          type: 'text',
          selector: '#guardian_name',
          required: true,
          labelSource: 'label-for',
          labelConfidence: 1.0,
          isInsideIframe: false,
        },
      ];

      const profile: ProfileRecord[] = [
        {
          key: 'guardian_name',
          value: 'Ramesh Sharma',
          confidence: 0.9,
          source: 'manual',
          verifiedByUser: true,
          updatedAt: Date.now(),
        },
      ];

      const engine = new RecoveryEngine();
      expect(engine.canRetry('guardian_name')).toBe(true);

      const inputEl = document.getElementById('guardian_name') as HTMLInputElement;

      // Attempt 1: Auto-recovery succeeds
      const error1 = {
        id: 'err_guardian',
        errorText: 'Guardian Name is required',
        errorType: 'EMPTY_REQUIRED' as const,
        fieldId: 'guardian_name',
        errorElement: inputEl,
        associatedInput: inputEl,
      };

      const result1 = await engine.attemptAutoRecovery(error1, {
        doc: document,
        fields,
        profileRecords: profile,
      });

      expect(result1.recovered).toBe(true);
      expect(result1.needsYou).toBe(false);
      expect(engine.getRetryCount('guardian_name')).toBe(1);
      expect(engine.canRetry('guardian_name')).toBe(false);

      // Attempt 2: If the error somehow persists, it must NOT loop; mark "needs-you" with exact portal message
      const result2 = await engine.attemptAutoRecovery(error1, {
        doc: document,
        fields,
        profileRecords: profile,
      });

      expect(result2.recovered).toBe(false);
      expect(result2.needsYou).toBe(true);
      expect(result2.exactPortalMessage).toBe('Guardian Name is required');
    });
  });
});
