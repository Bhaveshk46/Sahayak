import { describe, it, expect } from 'vitest';
import {
  formatDateValue,
  formatPhoneValue,
  matchOptionValue,
  formatNumberValue,
  formatValueForField,
} from './valueFormatter';
import { FormField } from '../types';

describe('Local Value Formatting & Normalization', () => {
  const baseField: FormField = {
    id: 'f1',
    name: 'test',
    label: 'Test Field',
    type: 'text',
    labelSource: 'label-for',
    labelConfidence: 0.9,
    required: false,
    selector: '#f1',
    isInsideIframe: false,
  };

  describe('Date Formatting', () => {
    it('formats ISO date (YYYY-MM-DD) to Indian DD/MM/YYYY for text inputs', () => {
      const res = formatDateValue('1999-08-15', baseField);
      expect(res.value).toBe('15/08/1999');
      expect(res.formatted).toBe(true);
    });

    it('formats text date (DD/MM/YYYY) to YYYY-MM-DD for HTML5 type="date"', () => {
      const dateField: FormField = { ...baseField, type: 'date' };
      const res = formatDateValue('15/08/1999', dateField);
      expect(res.value).toBe('1999-08-15');
      expect(res.formatted).toBe(true);
    });

    it('formats to DD-MM-YYYY when placeholder requests hyphens', () => {
      const hyphenField: FormField = { ...baseField, placeholder: 'DD-MM-YYYY' };
      const res = formatDateValue('1999-08-15', hyphenField);
      expect(res.value).toBe('15-08-1999');
      expect(res.formatted).toBe(true);
    });
  });

  describe('Phone Formatting', () => {
    it('normalizes 12-digit 91XXXXXXXXXX to standard 10-digit mobile number', () => {
      const res = formatPhoneValue('+91 98765 43210', baseField);
      expect(res.value).toBe('9876543210');
    });

    it('formats with +91 prefix when requested by placeholder or length', () => {
      const plus91Field: FormField = { ...baseField, placeholder: '+91 XXXXX XXXXX', maxLength: 13 };
      const res = formatPhoneValue('9876543210', plus91Field);
      expect(res.value).toBe('+919876543210');
      expect(res.formatted).toBe(true);
    });
  });

  describe('Option Matching & NeedsReview', () => {
    const categoryOptions = [
      { label: 'General / Open', value: 'GENERAL' },
      { label: 'Other Backward Class (OBC)', value: 'OBC' },
      { label: 'Scheduled Caste (SC)', value: 'SC' },
      { label: 'Scheduled Tribe (ST)', value: 'ST' },
      { label: 'Economically Weaker Section (EWS)', value: 'EWS' },
    ];

    it('matches "OBC" to "Other Backward Class (OBC)" without review', () => {
      const res = matchOptionValue('OBC', categoryOptions);
      expect(res.value).toBe('OBC');
      expect(res.needsReview).toBe(false);
    });

    it('matches lowercase "obc" to "OBC"', () => {
      const res = matchOptionValue('obc', categoryOptions);
      expect(res.value).toBe('OBC');
      expect(res.needsReview).toBe(false);
    });

    it('matches "General" to "GENERAL"', () => {
      const res = matchOptionValue('General', categoryOptions);
      expect(res.value).toBe('GENERAL');
      expect(res.needsReview).toBe(false);
    });

    it('matches gender variations ("Female" -> "female")', () => {
      const genderOptions = [
        { label: 'Female', value: 'female' },
        { label: 'Male', value: 'male' },
        { label: 'Other', value: 'other' },
      ];
      const res = matchOptionValue('Female', genderOptions);
      expect(res.value).toBe('female');
      expect(res.needsReview).toBe(false);
    });

    it('returns needsReview: true when value does not match any dropdown option', () => {
      const res = matchOptionValue('Special Category XYZ', categoryOptions);
      expect(res.needsReview).toBe(true);
      expect(res.reason).toContain('does not match any available option');
    });
  });

  describe('Number Formatting', () => {
    it('cleans currency symbols, commas, and INR labels', () => {
      const numField: FormField = { ...baseField, type: 'number' };
      const res = formatNumberValue('₹ 3,50,000 INR', numField);
      expect(res.value).toBe('350000');
      expect(res.formatted).toBe(true);
    });

    it('removes percentage symbol for percent fields', () => {
      const percentField: FormField = { ...baseField, type: 'number' };
      const res = formatNumberValue('89.5%', percentField);
      expect(res.value).toBe('89.5');
      expect(res.formatted).toBe(true);
    });
  });

  describe('formatValueForField Coordinator', () => {
    it('dispatches date formatting for dob key', () => {
      const dateField: FormField = { ...baseField, type: 'date' };
      const res = formatValueForField('25/12/2001', dateField, 'dob');
      expect(res.formattedValue).toBe('2001-12-25');
      expect(res.needsReview).toBe(false);
    });

    it('dispatches option matching for select fields', () => {
      const selectField: FormField = {
        ...baseField,
        type: 'select',
        options: [
          { label: 'Savings Account', value: 'savings' },
          { label: 'Current Account', value: 'current' },
        ],
      };
      const res = formatValueForField('Savings', selectField, 'bankAccountType');
      expect(res.formattedValue).toBe('savings');
      expect(res.needsReview).toBe(false);
    });
  });
});
