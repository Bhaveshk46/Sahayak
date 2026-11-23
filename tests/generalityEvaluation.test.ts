import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanDocumentForms } from '../src/scanner/formScanner';
import { matchFieldHeuristically, matchFileSlot } from '../src/decide/heuristicMatcher';

interface ExpectedFieldEval {
  expectedLabelContains: string;
  expectedType: string;
  expectedProfileKey?: string;
  expectedDocType?: string;
}

interface FormBenchmark {
  name: string;
  fixturePath: string;
  expectedCount: number;
  expectedFields: ExpectedFieldEval[];
}

describe('Generality Benchmark Evaluation on 5 Real Public Form Snapshots', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const benchmarks: FormBenchmark[] = [
    {
      name: 'Google Form (Scholarship)',
      fixturePath: path.resolve(__dirname, 'fixtures/real-forms/google-form.html'),
      expectedCount: 6,
      expectedFields: [
        { expectedLabelContains: 'Full Legal Name', expectedType: 'text', expectedProfileKey: 'fullName' },
        { expectedLabelContains: 'Email Address', expectedType: 'email', expectedProfileKey: 'email' },
        { expectedLabelContains: 'Mobile Number', expectedType: 'tel', expectedProfileKey: 'mobile' },
        { expectedLabelContains: 'Date of Birth', expectedType: 'date', expectedProfileKey: 'dob' },
        { expectedLabelContains: 'Gender', expectedType: 'radio', expectedProfileKey: 'gender' },
        { expectedLabelContains: 'Income Certificate', expectedType: 'file', expectedDocType: 'income_certificate' },
      ],
    },
    {
      name: 'Job Application Form',
      fixturePath: path.resolve(__dirname, 'fixtures/real-forms/job-application.html'),
      expectedCount: 7,
      expectedFields: [
        { expectedLabelContains: 'First Name', expectedType: 'text', expectedProfileKey: 'firstName' },
        { expectedLabelContains: 'Last Name', expectedType: 'text', expectedProfileKey: 'lastName' },
        { expectedLabelContains: 'Email Address', expectedType: 'email', expectedProfileKey: 'email' },
        { expectedLabelContains: 'Phone Number', expectedType: 'tel', expectedProfileKey: 'mobile' },
        { expectedLabelContains: 'Employer or University Name', expectedType: 'text', expectedProfileKey: 'institution' },
        { expectedLabelContains: 'Resume', expectedType: 'file' },
        { expectedLabelContains: 'Cover Letter', expectedType: 'textarea' },
      ],
    },
    {
      name: 'Portal Citizen Registration',
      fixturePath: path.resolve(__dirname, 'fixtures/real-forms/registration.html'),
      expectedCount: 7,
      expectedFields: [
        { expectedLabelContains: 'Full Legal Name', expectedType: 'text', expectedProfileKey: 'fullName' },
        { expectedLabelContains: 'Email Address', expectedType: 'email', expectedProfileKey: 'email' },
        { expectedLabelContains: 'Mobile Number', expectedType: 'tel', expectedProfileKey: 'mobile' },
        { expectedLabelContains: 'Birth Date', expectedType: 'date', expectedProfileKey: 'dob' },
        { expectedLabelContains: 'Social Category', expectedType: 'select', expectedProfileKey: 'category' },
        { expectedLabelContains: 'Create Portal Password', expectedType: 'password' },
        { expectedLabelContains: 'declare', expectedType: 'checkbox' },
      ],
    },
    {
      name: 'Public Grievance Contact Form',
      fixturePath: path.resolve(__dirname, 'fixtures/real-forms/contact-form.html'),
      expectedCount: 6,
      expectedFields: [
        { expectedLabelContains: 'Applicant Name', expectedType: 'text', expectedProfileKey: 'fullName' },
        { expectedLabelContains: 'Official Email ID', expectedType: 'email', expectedProfileKey: 'email' },
        { expectedLabelContains: 'Phone / Contact Number', expectedType: 'tel', expectedProfileKey: 'mobile' },
        { expectedLabelContains: 'Grievance / Subject Category', expectedType: 'radio' },
        { expectedLabelContains: 'Description of Issue', expectedType: 'textarea' },
        { expectedLabelContains: 'Supporting Document', expectedType: 'file' },
      ],
    },
    {
      name: 'Bank KYC Verification',
      fixturePath: path.resolve(__dirname, 'fixtures/real-forms/bank-kyc.html'),
      expectedCount: 11,
      expectedFields: [
        { expectedLabelContains: 'Account Holder Legal Name', expectedType: 'text', expectedProfileKey: 'fullName' },
        { expectedLabelContains: 'Permanent Account Number', expectedType: 'text', expectedProfileKey: 'panNumber' },
        { expectedLabelContains: '12-Digit Aadhaar', expectedType: 'text', expectedProfileKey: 'aadhaarNumber' },
        { expectedLabelContains: 'Date of Birth', expectedType: 'date', expectedProfileKey: 'dob' },
        { expectedLabelContains: 'Mobile Number', expectedType: 'tel', expectedProfileKey: 'mobile' },
        { expectedLabelContains: 'Registered Email ID', expectedType: 'email', expectedProfileKey: 'email' },
        { expectedLabelContains: 'Gross Income', expectedType: 'number', expectedProfileKey: 'annualIncome' },
        { expectedLabelContains: 'Permanent Residential Address', expectedType: 'textarea', expectedProfileKey: 'address' },
        { expectedLabelContains: 'PIN Code', expectedType: 'text', expectedProfileKey: 'pincode' },
        { expectedLabelContains: 'PAN Card Document', expectedType: 'file', expectedDocType: 'pan' },
        { expectedLabelContains: 'Proof of Address', expectedType: 'file', expectedDocType: 'aadhaar' },
      ],
    },
  ];

  for (const benchmark of benchmarks) {
    it(`evaluates ${benchmark.name}`, () => {
      const html = fs.readFileSync(benchmark.fixturePath, 'utf-8');
      document.body.innerHTML = html;

      const schema = scanDocumentForms();
      console.log(`\n========================================`);
      console.log(`FORM BENCHMARK: ${benchmark.name}`);
      console.log(`Scanned Field Count: ${schema.fields.length} (Expected: ${benchmark.expectedCount})`);

      schema.fields.forEach((f, idx) => {
        const matchRes = matchFieldHeuristically(f);
        let fileSlotInfo = '';
        if (f.type === 'file' || f.type === 'dropzone') {
          const slotRes = matchFileSlot(f);
          fileSlotInfo = ` -> Doc: ${slotRes.documentType} (${(slotRes.confidence * 100).toFixed(0)}%)`;
        }
        console.log(
          `  [#${idx + 1}] ID="${f.id}" Type="${f.type}" Label="${f.label}" (src: ${f.labelSource}, conf: ${f.labelConfidence.toFixed(2)})` +
          ` -> Map: ${matchRes.profileKey || 'null'} (${(matchRes.confidence * 100).toFixed(0)}%)${fileSlotInfo}`
        );
      });

      expect(schema.fields.length).toBeGreaterThanOrEqual(benchmark.expectedCount);
    });
  }
});
