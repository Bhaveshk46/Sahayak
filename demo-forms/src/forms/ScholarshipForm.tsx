import React, { useState } from 'react';
import { CustomDropdown } from '../components/CustomDropdown';
import { FileDropZone } from '../components/FileDropZone';
import { FakeCaptcha } from '../components/FakeCaptcha';
import { GraduationCap, Send, CheckCircle2 } from 'lucide-react';

export const ScholarshipForm: React.FC = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    dob: '',
    gender: 'female',
    category: 'OBC',
    scheme: 'merit',
    collegeName: '',
    annualIncome: '',
    guardianOccupation: '',
  });

  const [dateError, setDateError] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const schemeOptions = [
    { label: 'Post-Matric Merit Scholarship (2025)', value: 'merit' },
    { label: 'National Higher Education Fellowship', value: 'national_fellowship' },
    { label: 'State STEM Women Scholarship Scheme', value: 'stem_women' },
    { label: 'Minority Student Excellence Grant', value: 'minority' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaVerified) {
      alert('Please complete the verification (CAPTCHA) first!');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4 text-white flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <GraduationCap className="w-7 h-7 text-blue-200" />
          <div>
            <h2 className="text-base font-bold">National Scholarship Portal (Mock)</h2>
            <p className="text-xs text-blue-100">Application for Higher Education Merit Financial Assistance</p>
          </div>
        </div>
        <span className="text-xs bg-blue-900/60 px-2 py-0.5 rounded font-mono border border-blue-400/30">
          NSP-2025-V2
        </span>
      </div>

      {submitted ? (
        <div className="p-10 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800">Application Submitted!</h3>
          <p className="text-xs text-slate-600">
            Reference ID: NSP-{Math.floor(100000 + Math.random() * 900000)}
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="text-xs text-blue-600 font-semibold underline mt-2"
          >
            Reset Form
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label htmlFor="student_name" className="block text-xs font-semibold text-slate-700 mb-1">
                Full Legal Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="student_name"
                name="full_name"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="e.g. Aditi Sharma"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            {/* Email Address */}
            <div>
              <label htmlFor="student_email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="student_email"
                name="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="aditi.sharma@example.com"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="student_phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number (Linked with Aadhaar) <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="student_phone"
                name="phone_number"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="9876543210"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            {/* Date of Birth with Deliberate Format Check */}
            <div>
              <label htmlFor="student_dob" className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="student_dob"
                name="date_of_birth"
                required
                value={formData.dob}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, dob: val });
                  // Flag if not DD-MM-YYYY or valid date
                  if (val && !/^\d{2}-\d{2}-\d{4}$/.test(val) && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                    setDateError('Please enter date in DD-MM-YYYY format');
                  } else {
                    setDateError(null);
                  }
                }}
                placeholder="DD-MM-YYYY"
                aria-invalid={dateError ? 'true' : 'false'}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
              {dateError && (
                <span role="alert" className="text-red-500 text-[11px] font-medium error-message mt-1 block">
                  ⚠️ {dateError}
                </span>
              )}
            </div>

            {/* Deliberate Error: Required Field Profile Lacks */}
            <div>
              <label htmlFor="guardian_occupation" className="block text-xs font-semibold text-slate-700 mb-1">
                Guardian Occupation <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="guardian_occupation"
                name="guardian_occupation"
                required
                value={formData.guardianOccupation}
                onChange={(e) => setFormData({ ...formData, guardianOccupation: e.target.value })}
                placeholder="e.g. Government Service / Agriculture"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            {/* Native Select: Category */}
            <div>
              <label htmlFor="social_category" className="block text-xs font-semibold text-slate-700 mb-1">
                Social Category <span className="text-red-500">*</span>
              </label>
              <select
                id="social_category"
                name="social_category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              >
                <option value="GENERAL">General</option>
                <option value="OBC">Other Backward Class (OBC)</option>
                <option value="SC">Scheduled Caste (SC)</option>
                <option value="ST">Scheduled Tribe (ST)</option>
                <option value="EWS">Economically Weaker Section (EWS)</option>
              </select>
            </div>

            {/* College Name */}
            <div>
              <label htmlFor="college_name" className="block text-xs font-semibold text-slate-700 mb-1">
                Institution / University Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="college_name"
                name="institution_name"
                required
                value={formData.collegeName}
                onChange={(e) => setFormData({ ...formData, collegeName: e.target.value })}
                placeholder="Indian Institute of Technology, Bombay"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>

          {/* Custom Dropdown: Scholarship Scheme */}
          <CustomDropdown
            id="scholarship_scheme_select"
            label="Applied Scholarship Scheme"
            options={schemeOptions}
            value={formData.scheme}
            onChange={(val) => setFormData({ ...formData, scheme: val })}
            required
          />

          {/* Annual Family Income */}
          <div>
            <label htmlFor="annual_family_income" className="block text-xs font-semibold text-slate-700 mb-1">
              Annual Family Gross Income (in INR) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="annual_family_income"
              name="annual_income"
              required
              min="0"
              value={formData.annualIncome}
              onChange={(e) => setFormData({ ...formData, annualIncome: e.target.value })}
              placeholder="e.g. 250000"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          {/* Document Uploads with Size Hints */}
          <div className="pt-2 border-t border-slate-200 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Mandatory Document Attachments
            </h3>

            {/* Slot 1: Income Certificate with strict 200 KB limit */}
            <FileDropZone
              id="income_certificate_file"
              name="income_certificate"
              label="Competent Authority Income Certificate"
              hint="Max size 200 KB, PDF only"
              accept=".pdf"
              maxSizeKB={200}
              required
            />

            {/* Slot 2: Marksheet with 500 KB limit */}
            <FileDropZone
              id="marksheet_file"
              name="previous_marksheet"
              label="Previous Qualifying Exam Marksheet"
              hint="Max size 500 KB, PDF or JPG"
              accept=".pdf,.jpg,.jpeg"
              required
            />
          </div>

          {/* Fake CAPTCHA Step */}
          <div className="pt-3 border-t border-slate-200">
            <FakeCaptcha verified={captchaVerified} onVerify={setCaptchaVerified} />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-2 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Scholarship Application</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
