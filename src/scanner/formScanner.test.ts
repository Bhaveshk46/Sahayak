import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanDocumentForms } from './formScanner';

describe('Form Scanner Comprehensive Multi-Form Evaluation (M2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('scans Scholarship Form fixture correctly with sizes and labels', () => {
    // Exact structural HTML matching ScholarshipForm
    document.body.innerHTML = `
      <form id="scholarship_form">
        <div>
          <label for="student_name">Full Legal Name *</label>
          <input type="text" id="student_name" name="full_name" required placeholder="e.g. Aditi Sharma" />
        </div>
        <div>
          <label for="student_email">Email Address *</label>
          <input type="email" id="student_email" name="email" required placeholder="aditi.sharma@example.com" />
        </div>
        <div>
          <label for="student_phone">Mobile Number (Linked with Aadhaar) *</label>
          <input type="tel" id="student_phone" name="phone_number" required placeholder="9876543210" />
        </div>
        <div>
          <label for="student_dob">Date of Birth *</label>
          <input type="date" id="student_dob" name="date_of_birth" required />
        </div>
        <div>
          <label for="social_category">Social Category *</label>
          <select id="social_category" name="social_category">
            <option value="GENERAL">General</option>
            <option value="OBC">Other Backward Class (OBC)</option>
            <option value="SC">Scheduled Caste (SC)</option>
            <option value="ST">Scheduled Tribe (ST)</option>
          </select>
        </div>
        <div>
          <label for="college_name">Institution / University Name *</label>
          <input type="text" id="college_name" name="institution_name" required />
        </div>
        <div>
          <label id="scholarship_scheme_select-label">Applied Scholarship Scheme *</label>
          <div id="scholarship_scheme_select" role="combobox" aria-labelledby="scholarship_scheme_select-label" data-formpilot-custom-dropdown="true">
            <ul role="listbox">
              <li role="option" data-value="merit">Post-Matric Merit Scholarship (2025)</li>
              <li role="option" data-value="national_fellowship">National Higher Education Fellowship</li>
              <li role="option" data-value="stem_women">State STEM Women Scholarship Scheme</li>
            </ul>
          </div>
        </div>
        <div>
          <label for="annual_family_income">Annual Family Gross Income (in INR) *</label>
          <input type="number" id="annual_family_income" name="annual_income" min="0" required />
        </div>
        <div data-formpilot-dropzone-wrapper="true">
          <div>
            <label for="income_certificate_file">Competent Authority Income Certificate *</label>
            <span class="hint">Max size 200 KB, PDF only</span>
          </div>
          <div data-formpilot-dropzone="true">
            <input type="file" id="income_certificate_file" name="income_certificate" accept=".pdf" required class="hidden" />
          </div>
        </div>
        <div data-formpilot-dropzone-wrapper="true">
          <div>
            <label for="marksheet_file">Previous Qualifying Exam Marksheet *</label>
            <span class="hint">Max size 500 KB, PDF or JPG</span>
          </div>
          <div data-formpilot-dropzone="true">
            <input type="file" id="marksheet_file" name="previous_marksheet" accept=".pdf,.jpg,.jpeg" required class="hidden" />
          </div>
        </div>
        <div data-formpilot-captcha="true">
          <label>
            <input type="checkbox" id="captcha_verified" name="captcha_verified" />
            <span>I'm not a robot</span>
          </label>
        </div>
      </form>
    `;

    const schema = scanDocumentForms();
    expect(schema.hasCaptcha).toBe(true);
    // 10 form fields + 1 captcha checkbox = 11 total
    expect(schema.fields.length).toBe(11);

    // Assert name & label resolution
    const nameField = schema.fields.find(f => f.name === 'full_name');
    expect(nameField).toBeDefined();
    expect(nameField?.label).toContain('Full Legal Name');
    expect(nameField?.labelSource).toBe('label-for');
    expect(nameField?.labelConfidence).toBe(1.0);
    expect(nameField?.required).toBe(true);

    // Assert custom dropdown
    const schemeField = schema.fields.find(f => f.type === 'custom-select');
    expect(schemeField).toBeDefined();
    expect(schemeField?.label).toContain('Applied Scholarship Scheme');
    expect(schemeField?.options?.length).toBe(3);

    // Assert file upload slots and size parser integration
    const incomeFile = schema.fields.find(f => f.name === 'income_certificate');
    expect(incomeFile).toBeDefined();
    expect(incomeFile?.type).toBe('file');
    expect(incomeFile?.accept).toBe('.pdf');
    expect(incomeFile?.maxSizeBytes).toBe(200 * 1024);

    const marksheetFile = schema.fields.find(f => f.name === 'previous_marksheet');
    expect(marksheetFile).toBeDefined();
    expect(marksheetFile?.maxSizeBytes).toBe(500 * 1024);

    // Save snapshot
    const snapshotsDir = path.resolve(process.cwd(), 'snapshots');
    if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });
    fs.writeFileSync(path.join(snapshotsDir, 'scholarship.json'), JSON.stringify(schema, null, 2));
  });

  it('scans Job Application Form fixture correctly with consolidated radio groups', () => {
    document.body.innerHTML = `
      <form id="job_application_form">
        <div>
          <label for="applicant_name">Candidate Full Name *</label>
          <input type="text" id="applicant_name" name="candidate_name" required placeholder="Rahul Verma" />
        </div>
        <div>
          <label for="applicant_email">Primary Contact Email *</label>
          <input type="email" id="applicant_email" name="applicant_email" required />
        </div>
        <div>
          <label for="applicant_phone">Phone Number *</label>
          <input type="tel" id="applicant_phone" name="applicant_phone" required />
        </div>
        <div>
          <label for="total_experience">Total Relevant Experience (Years) *</label>
          <input type="number" id="total_experience" name="experience_years" min="0" max="40" step="0.5" required />
        </div>
        <div>
          <label for="highest_qualification">Highest Educational Degree *</label>
          <select id="highest_qualification" name="highest_qualification">
            <option value="B.Tech">B.Tech / B.E.</option>
            <option value="M.Tech">M.Tech / M.E.</option>
            <option value="MCA">MCA</option>
          </select>
        </div>
        <div>
          <label for="current_employer">Current Employer / Organization</label>
          <input type="text" id="current_employer" name="current_company" />
        </div>
        <div>
          <label id="work_location_select-label">Preferred Work Location *</label>
          <div id="work_location_select" role="combobox" aria-labelledby="work_location_select-label" data-formpilot-custom-dropdown="true">
            <ul role="listbox">
              <li role="option" data-value="Bengaluru">Bengaluru</li>
              <li role="option" data-value="Hyderabad">Hyderabad</li>
            </ul>
          </div>
        </div>
        <div>
          <label class="radio-group-header">Notice Period Duration *</label>
          <div>
            <label><input type="radio" name="notice_period" value="immediate" /> Immediate</label>
            <label><input type="radio" name="notice_period" value="15_days" /> 15 Days</label>
            <label><input type="radio" name="notice_period" value="30_days" checked /> 30 Days</label>
            <label><input type="radio" name="notice_period" value="60_days" /> 60+ Days</label>
          </div>
        </div>
        <div data-formpilot-dropzone-wrapper="true">
          <div>
            <label for="resume_file_input">Updated Comprehensive Resume (CV) *</label>
            <span class="hint">Max size 500 KB, PDF only</span>
          </div>
          <div data-formpilot-dropzone="true">
            <input type="file" id="resume_file_input" name="curriculum_vitae" accept=".pdf" required class="hidden" />
          </div>
        </div>
        <div data-formpilot-dropzone-wrapper="true">
          <div>
            <label for="passport_photo_input">Recent Passport Size Photograph *</label>
            <span class="hint">Max size 100 KB, JPG or PNG only</span>
          </div>
          <div data-formpilot-dropzone="true">
            <input type="file" id="passport_photo_input" name="passport_photo" accept=".jpg,.jpeg,.png" required class="hidden" />
          </div>
        </div>
        <div>
          <label>
            <input type="checkbox" id="applicant_declaration" name="applicant_declaration" required />
            <span>I hereby declare that all details furnished above are accurate</span>
          </label>
        </div>
        <div data-formpilot-captcha="true">
          <input type="checkbox" id="captcha_box" name="captcha_box" />
        </div>
      </form>
    `;

    const schema = scanDocumentForms();
    expect(schema.hasCaptcha).toBe(true);

    // Rule 1: Radios MUST be consolidated into ONE field with all 4 options
    const radioFields = schema.fields.filter(f => f.type === 'radio');
    expect(radioFields.length).toBe(1);
    expect(radioFields[0].name).toBe('notice_period');
    expect(radioFields[0].options?.length).toBe(4);
    expect(radioFields[0].currentValue).toBe('30_days');
    expect(radioFields[0].label).toContain('Notice Period Duration');

    // Total fields:
    // candidate_name, applicant_email, applicant_phone, experience_years, highest_qualification,
    // current_company, preferred_location, notice_period (radio group), curriculum_vitae, passport_photo,
    // applicant_declaration, captcha_box = 12 fields
    expect(schema.fields.length).toBe(12);

    // Assert min/max/step validation attributes
    const expField = schema.fields.find(f => f.name === 'experience_years');
    expect(expField?.min).toBe('0');
    expect(expField?.max).toBe('40');

    // Assert photo limit
    const photoField = schema.fields.find(f => f.name === 'passport_photo');
    expect(photoField?.maxSizeBytes).toBe(100 * 1024);
    expect(photoField?.accept).toBe('.jpg,.jpeg,.png');

    // Save snapshot
    const snapshotsDir = path.resolve(process.cwd(), 'snapshots');
    fs.writeFileSync(path.join(snapshotsDir, 'job.json'), JSON.stringify(schema, null, 2));
  });

  it('scans KYC Form fixture correctly with same-origin iframe extraction', () => {
    // Main KYC frame
    document.body.innerHTML = `
      <form id="kyc_form">
        <div>
          <label for="legal_name">Full Legal Name (as on PAN/Aadhaar) *</label>
          <input type="text" id="legal_name" name="full_legal_name" required />
        </div>
        <div>
          <label for="pan_number">Permanent Account Number (PAN) *</label>
          <input type="text" id="pan_number" name="pan_card_number" maxlength="10" required />
        </div>
        <div>
          <label for="aadhaar_number">12-digit Aadhaar Number *</label>
          <input type="text" id="aadhaar_number" name="aadhaar_number" maxlength="12" required />
        </div>
        <div>
          <label for="father_name">Father's / Spouse's Full Name *</label>
          <input type="text" id="father_name" name="father_name" required />
        </div>
        <div>
          <label for="dob_field">Date of Birth *</label>
          <input type="date" id="dob_field" name="date_of_birth" required />
        </div>
        <div>
          <label for="kyc_gender">Gender *</label>
          <select id="kyc_gender" name="gender">
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label id="state_domicile_select-label">State / Union Territory of Residence *</label>
          <div id="state_domicile_select" role="combobox" aria-labelledby="state_domicile_select-label" data-formpilot-custom-dropdown="true">
            <ul role="listbox">
              <li role="option" data-value="Maharashtra">Maharashtra</li>
              <li role="option" data-value="Delhi">Delhi</li>
            </ul>
          </div>
        </div>
        <div>
          <label for="permanent_address">Permanent Address Line *</label>
          <textarea id="permanent_address" name="residential_address" required></textarea>
        </div>
        <div data-formpilot-dropzone-wrapper="true">
          <div>
            <label for="aadhaar_doc_upload">Aadhaar Card (Masked e-Aadhaar) *</label>
            <span class="hint">Max size 300 KB, PDF only</span>
          </div>
          <div data-formpilot-dropzone="true">
            <input type="file" id="aadhaar_doc_upload" name="aadhaar_document" accept=".pdf" required class="hidden" />
          </div>
        </div>
        <div data-formpilot-dropzone-wrapper="true">
          <div>
            <label for="pan_doc_upload">PAN Card Clear Scan *</label>
            <span class="hint">Max size 200 KB, JPG or PDF</span>
          </div>
          <div data-formpilot-dropzone="true">
            <input type="file" id="pan_doc_upload" name="pan_card_document" accept=".pdf,.jpg,.jpeg" required class="hidden" />
          </div>
        </div>
        <div data-formpilot-captcha="true">
          <input type="checkbox" id="kyc_captcha" name="kyc_captcha" />
        </div>
        <iframe id="kyc_bank_iframe" name="kyc_bank_frame"></iframe>
      </form>
    `;

    // Mock iframe contentDocument
    const iframe = document.getElementById('kyc_bank_iframe') as HTMLIFrameElement;
    const mockDoc = document.implementation.createHTMLDocument('Bank Verification Frame');
    mockDoc.body.innerHTML = `
      <form id="bank_subform">
        <div>
          <label for="bank_account_holder">Bank Account Beneficiary Name *</label>
          <input type="text" id="bank_account_holder" name="bank_beneficiary_name" required />
        </div>
        <div>
          <label for="bank_account_number">Bank Account Number *</label>
          <input type="text" id="bank_account_number" name="account_number" required />
        </div>
        <div>
          <label for="bank_ifsc_code">Bank IFSC Code *</label>
          <input type="text" id="bank_ifsc_code" name="ifsc_code" required />
        </div>
        <div>
          <label for="bank_account_type">Account Type</label>
          <select id="bank_account_type" name="account_type">
            <option value="savings">Savings Account</option>
            <option value="current">Current Account</option>
          </select>
        </div>
        <div data-formpilot-dropzone-wrapper="true">
          <div>
            <label for="cancelled_cheque_file">Passbook Front Page / Cancelled Cheque *</label>
            <span class="hint">Max size 150 KB, PDF or JPG only</span>
          </div>
          <div data-formpilot-dropzone="true">
            <input type="file" id="cancelled_cheque_file" name="cancelled_cheque" accept=".pdf,.jpg,.jpeg" required class="hidden" />
          </div>
        </div>
      </form>
    `;

    Object.defineProperty(iframe, 'contentDocument', {
      value: mockDoc,
      configurable: true,
    });

    const schema = scanDocumentForms();

    // Main KYC: 10 fields + 1 captcha = 11 fields
    // Embedded frame: 5 fields
    // Total = 16 fields
    expect(schema.fields.length).toBe(16);

    const iframeFields = schema.fields.filter(f => f.isInsideIframe);
    expect(iframeFields.length).toBe(5);
    expect(iframeFields.every(f => f.iframeIdentifier === 'kyc_bank_iframe')).toBe(true);

    // Check bank frame fields
    const chequeFile = schema.fields.find(f => f.name === 'cancelled_cheque');
    expect(chequeFile?.maxSizeBytes).toBe(150 * 1024);
    expect(chequeFile?.isInsideIframe).toBe(true);

    // Check PAN & Aadhaar max lengths
    const panField = schema.fields.find(f => f.name === 'pan_card_number');
    expect(panField?.maxLength).toBe(10);
    const aadhaarField = schema.fields.find(f => f.name === 'aadhaar_number');
    expect(aadhaarField?.maxLength).toBe(12);

    // Save snapshot
    const snapshotsDir = path.resolve(process.cwd(), 'snapshots');
    fs.writeFileSync(path.join(snapshotsDir, 'kyc.json'), JSON.stringify(schema, null, 2));
  });
});
