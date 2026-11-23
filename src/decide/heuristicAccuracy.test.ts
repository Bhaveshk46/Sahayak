import { describe, it, expect } from 'vitest';
import { matchFieldHeuristically, matchFileSlot } from './heuristicMatcher';
import { FormField } from '../types';

interface FormEvaluationTarget {
  name: string;
  fields: Array<{
    field: FormField;
    expectedKey: string | null;
  }>;
}

describe('Heuristic Matcher Generality & Accuracy Evaluation (M5)', () => {
  // Form 1: National Scholarship Portal Form
  const scholarshipFormTargets: FormEvaluationTarget = {
    name: 'ScholarshipForm',
    fields: [
      {
        field: {
          id: 'student_name',
          name: 'full_name',
          label: 'Full Legal Name',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#student_name',
          isInsideIframe: false,
        },
        expectedKey: 'fullName',
      },
      {
        field: {
          id: 'student_email',
          name: 'email',
          label: 'Email Address',
          type: 'email',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#student_email',
          isInsideIframe: false,
        },
        expectedKey: 'email',
      },
      {
        field: {
          id: 'student_phone',
          name: 'phone_number',
          label: 'Mobile Number (Linked with Aadhaar)',
          type: 'tel',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#student_phone',
          isInsideIframe: false,
        },
        expectedKey: 'mobile',
      },
      {
        field: {
          id: 'student_dob',
          name: 'date_of_birth',
          label: 'Date of Birth',
          type: 'date',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#student_dob',
          isInsideIframe: false,
        },
        expectedKey: 'dob',
      },
      {
        field: {
          id: 'social_category',
          name: 'social_category',
          label: 'Social Category',
          type: 'select',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#social_category',
          isInsideIframe: false,
        },
        expectedKey: 'category',
      },
      {
        field: {
          id: 'college_name',
          name: 'institution_name',
          label: 'Institution / University Name',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#college_name',
          isInsideIframe: false,
        },
        expectedKey: 'institution',
      },
      {
        field: {
          id: 'annual_family_income',
          name: 'annual_income',
          label: 'Annual Family Gross Income (in INR)',
          type: 'number',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#annual_family_income',
          isInsideIframe: false,
        },
        expectedKey: 'annualIncome',
      },
      {
        field: {
          id: 'captcha_code',
          name: 'captcha',
          label: 'Security Captcha',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#captcha_code',
          isInsideIframe: false,
        },
        expectedKey: null,
      },
    ],
  };

  // Form 2: Public Sector Recruitment Job Application Form
  const jobApplicationFormTargets: FormEvaluationTarget = {
    name: 'JobApplicationForm',
    fields: [
      {
        field: {
          id: 'applicant_name',
          name: 'candidate_name',
          label: 'Candidate Full Name',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#applicant_name',
          isInsideIframe: false,
        },
        expectedKey: 'fullName',
      },
      {
        field: {
          id: 'applicant_email',
          name: 'applicant_email',
          label: 'Primary Contact Email',
          type: 'email',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#applicant_email',
          isInsideIframe: false,
        },
        expectedKey: 'email',
      },
      {
        field: {
          id: 'applicant_phone',
          name: 'applicant_phone',
          label: 'Phone Number',
          type: 'tel',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#applicant_phone',
          isInsideIframe: false,
        },
        expectedKey: 'mobile',
      },
      {
        field: {
          id: 'applicant_qualification',
          name: 'qualification',
          label: 'Highest Educational Qualification / Degree',
          type: 'select',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#applicant_qualification',
          isInsideIframe: false,
        },
        expectedKey: 'course',
      },
      {
        field: {
          id: 'job_captcha',
          name: 'captcha_input',
          label: 'Enter Verification Code Shown Above',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#job_captcha',
          isInsideIframe: false,
        },
        expectedKey: null,
      },
    ],
  };

  // Form 3: Central e-KYC Registry Form (with embedded banking iframe)
  const kycFormTargets: FormEvaluationTarget = {
    name: 'KycForm',
    fields: [
      {
        field: {
          id: 'legal_name',
          name: 'full_legal_name',
          label: 'Full Legal Name (as on PAN/Aadhaar)',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#legal_name',
          isInsideIframe: false,
        },
        expectedKey: 'fullName',
      },
      {
        field: {
          id: 'pan_number',
          name: 'pan_card_number',
          label: 'Permanent Account Number (PAN)',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#pan_number',
          isInsideIframe: false,
        },
        expectedKey: 'panNumber',
      },
      {
        field: {
          id: 'aadhaar_number',
          name: 'aadhaar_number',
          label: '12-Digit Aadhaar (UIDAI) Number',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#aadhaar_number',
          isInsideIframe: false,
        },
        expectedKey: 'aadhaarNumber',
      },
      {
        field: {
          id: 'father_name',
          name: 'father_name',
          label: "Father's Full Name",
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#father_name',
          isInsideIframe: false,
        },
        expectedKey: 'fatherName',
      },
      {
        field: {
          id: 'dob',
          name: 'date_of_birth',
          label: 'Date of Birth (DOB)',
          type: 'date',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#dob',
          isInsideIframe: false,
        },
        expectedKey: 'dob',
      },
      {
        field: {
          id: 'residential_address',
          name: 'address',
          label: 'Residential Communication Address',
          type: 'textarea',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#residential_address',
          isInsideIframe: false,
        },
        expectedKey: 'address',
      },
      {
        field: {
          id: 'pincode',
          name: 'postal_pincode',
          label: 'Postal PIN Code',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#pincode',
          isInsideIframe: false,
        },
        expectedKey: 'pincode',
      },
      // Iframe fields
      {
        field: {
          id: 'bank_account_holder',
          name: 'bank_beneficiary_name',
          label: 'Bank Account Beneficiary Name',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#bank_account_holder',
          isInsideIframe: true,
        },
        expectedKey: 'fullName',
      },
      {
        field: {
          id: 'bank_account_number',
          name: 'account_number',
          label: 'Bank Account Number',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#bank_account_number',
          isInsideIframe: true,
        },
        expectedKey: 'bankAccount',
      },
      {
        field: {
          id: 'bank_ifsc_code',
          name: 'ifsc_code',
          label: 'Bank Branch IFSC Code',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#bank_ifsc_code',
          isInsideIframe: true,
        },
        expectedKey: 'ifsc',
      },
      {
        field: {
          id: 'bank_account_type',
          name: 'account_type',
          label: 'Type of Bank Account',
          type: 'select',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#bank_account_type',
          isInsideIframe: true,
        },
        expectedKey: 'bankAccountType',
      },
    ],
  };

  // Form 4: Extra Fixture Form (Requirement 9: Hindi label + Placeholder-only field)
  const extraFixtureFormTargets: FormEvaluationTarget = {
    name: 'DifferentlyWordedFixtureForm',
    fields: [
      {
        field: {
          id: 'hindi_name_inp',
          name: 'candidate_hindi_name',
          label: 'उमेदवाराचे नाव / आवेदक का नाम (Full Name)',
          type: 'text',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#hindi_name_inp',
          isInsideIframe: false,
        },
        expectedKey: 'fullName',
      },
      {
        field: {
          id: 'uid_placeholder_only',
          name: 'uid_field',
          label: '',
          placeholder: 'Enter 12-digit UID',
          type: 'text',
          labelSource: 'placeholder',
          labelConfidence: 0.75,
          required: true,
          selector: '#uid_placeholder_only',
          isInsideIframe: false,
        },
        expectedKey: 'aadhaarNumber',
      },
      {
        field: {
          id: 'hindi_income_inp',
          name: 'income_hindi',
          label: 'वार्षिक पारिवारिक आय (Annual Income)',
          type: 'number',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#hindi_income_inp',
          isInsideIframe: false,
        },
        expectedKey: 'annualIncome',
      },
      {
        field: {
          id: 'contact_cell',
          name: 'cell_no',
          label: 'Contact Cell Phone',
          type: 'tel',
          labelSource: 'label-for',
          labelConfidence: 0.9,
          required: true,
          selector: '#contact_cell',
          isInsideIframe: false,
        },
        expectedKey: 'mobile',
      },
      {
        field: {
          id: 'security_code',
          name: 'security_code',
          label: 'Security Code',
          type: 'text',
          hint: 'Enter code shown above',
          labelSource: 'label-for',
          labelConfidence: 0.95,
          required: true,
          selector: '#security_code',
          isInsideIframe: false,
        },
        expectedKey: null,
      },
    ],
  };

  const evaluateForm = (target: FormEvaluationTarget) => {
    let correct = 0;
    const details: Array<{ fieldId: string; expected: string | null; matched: string | null; confidence: number }> = [];

    for (const item of target.fields) {
      const match = matchFieldHeuristically(item.field);
      const isCorrect = match.profileKey === item.expectedKey;
      if (isCorrect) correct++;
      details.push({
        fieldId: item.field.id,
        expected: item.expectedKey,
        matched: match.profileKey,
        confidence: match.confidence,
      });
    }

    const accuracy = (correct / target.fields.length) * 100;
    if (accuracy < 90) {
      console.log(`[FAILED DETAILS] ${target.name}:`, JSON.stringify(details, null, 2));
    }
    return { name: target.name, total: target.fields.length, correct, accuracy, details };
  };

  it('achieves >= 90% heuristic accuracy on ScholarshipForm', () => {
    const result = evaluateForm(scholarshipFormTargets);
    console.log(`[Accuracy] ${result.name}: ${result.correct}/${result.total} (${result.accuracy.toFixed(1)}%)`);
    expect(result.accuracy).toBeGreaterThanOrEqual(90);
  });

  it('achieves >= 90% heuristic accuracy on JobApplicationForm', () => {
    const result = evaluateForm(jobApplicationFormTargets);
    console.log(`[Accuracy] ${result.name}: ${result.correct}/${result.total} (${result.accuracy.toFixed(1)}%)`);
    expect(result.accuracy).toBeGreaterThanOrEqual(90);
  });

  it('achieves >= 90% heuristic accuracy on KycForm (including iframe fields)', () => {
    const result = evaluateForm(kycFormTargets);
    console.log(`[Accuracy] ${result.name}: ${result.correct}/${result.total} (${result.accuracy.toFixed(1)}%)`);
    expect(result.accuracy).toBeGreaterThanOrEqual(90);
  });

  it('achieves >= 90% heuristic accuracy on DifferentlyWordedFixtureForm (Hindi & placeholder-only)', () => {
    const result = evaluateForm(extraFixtureFormTargets);
    console.log(`[Accuracy] ${result.name}: ${result.correct}/${result.total} (${result.accuracy.toFixed(1)}%)`);
    expect(result.accuracy).toBeGreaterThanOrEqual(90);
  });

  it('correctly maps file slots to document types', () => {
    const fileSlot: FormField = {
      id: 'income_file',
      name: 'income_proof',
      label: 'Competent Authority Income Certificate',
      type: 'file',
      labelSource: 'label-for',
      labelConfidence: 0.95,
      required: true,
      selector: '#income_file',
      isInsideIframe: false,
    };

    const res = matchFileSlot(fileSlot);
    expect(res).toBeDefined();
    expect(res?.documentType).toBe('income_certificate');
  });
});
