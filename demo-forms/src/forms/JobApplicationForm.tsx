import React, { useState } from 'react';
import { CustomDropdown } from '../components/CustomDropdown';
import { FileDropZone } from '../components/FileDropZone';
import { FakeCaptcha } from '../components/FakeCaptcha';
import { Briefcase, Send, CheckCircle2 } from 'lucide-react';

export const JobApplicationForm: React.FC = () => {
  const [formData, setFormData] = useState({
    candidateName: '',
    email: '',
    phone: '',
    experienceYears: '3',
    currentCompany: '',
    currentSalary: '',
    expectedSalary: '',
    qualification: 'B.Tech / B.E.',
    preferredLocation: 'Bengaluru',
    noticePeriod: '30_days',
    linkedIn: '',
    declaration: false,
  });

  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const locationOptions = [
    { label: 'Bengaluru (Karnataka)', value: 'Bengaluru' },
    { label: 'Hyderabad (Telangana)', value: 'Hyderabad' },
    { label: 'Pune (Maharashtra)', value: 'Pune' },
    { label: 'Gurugram / NCR', value: 'Gurugram' },
    { label: 'Remote / Flexible', value: 'Remote' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaVerified) {
      alert('Please complete the CAPTCHA verification before submitting!');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-800 px-6 py-4 text-white flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Briefcase className="w-7 h-7 text-emerald-200" />
          <div>
            <h2 className="text-base font-bold">Public Sector Recruitment Portal (Mock)</h2>
            <p className="text-xs text-emerald-100">Senior Systems Engineer & Specialist Officer Cadre</p>
          </div>
        </div>
        <span className="text-xs bg-emerald-900/60 px-2 py-0.5 rounded font-mono border border-emerald-400/30">
          RECRUIT-2025
        </span>
      </div>

      {submitted ? (
        <div className="p-10 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800">Job Application Submitted!</h3>
          <p className="text-xs text-slate-600">
            Candidate Application No: APP-{Math.floor(100000 + Math.random() * 900000)}
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="text-xs text-emerald-600 font-semibold underline mt-2"
          >
            Submit Another Application
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Candidate Name */}
            <div>
              <label htmlFor="applicant_name" className="block text-xs font-semibold text-slate-700 mb-1">
                Candidate Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="applicant_name"
                name="candidate_name"
                required
                value={formData.candidateName}
                onChange={(e) => setFormData({ ...formData, candidateName: e.target.value })}
                placeholder="Rahul Verma"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="applicant_email" className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Contact Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="applicant_email"
                name="applicant_email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="rahul.verma@example.com"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="applicant_phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="applicant_phone"
                name="applicant_phone"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="9823012345"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            {/* Total Experience */}
            <div>
              <label htmlFor="total_experience" className="block text-xs font-semibold text-slate-700 mb-1">
                Total Relevant Experience (Years) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="total_experience"
                name="experience_years"
                min="0"
                max="40"
                step="0.5"
                required
                value={formData.experienceYears}
                onChange={(e) => setFormData({ ...formData, experienceYears: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            {/* Highest Qualification Native Select */}
            <div>
              <label htmlFor="highest_qualification" className="block text-xs font-semibold text-slate-700 mb-1">
                Highest Educational Degree <span className="text-red-500">*</span>
              </label>
              <select
                id="highest_qualification"
                name="highest_qualification"
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-emerald-500 bg-white text-slate-800"
              >
                <option value="B.Tech / B.E.">B.Tech / B.E. in Engineering</option>
                <option value="M.Tech / M.E.">M.Tech / M.E.</option>
                <option value="MCA">MCA / M.Sc Computer Science</option>
                <option value="Ph.D">Ph.D in Relevant Discipline</option>
                <option value="Other">Other Graduate Degree</option>
              </select>
            </div>

            {/* Current Company */}
            <div>
              <label htmlFor="current_employer" className="block text-xs font-semibold text-slate-700 mb-1">
                Current Employer / Organization
              </label>
              <input
                type="text"
                id="current_employer"
                name="current_company"
                value={formData.currentCompany}
                onChange={(e) => setFormData({ ...formData, currentCompany: e.target.value })}
                placeholder="Tech Mahindra / Infosys"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>

          {/* Custom Dropdown: Preferred Work Location */}
          <CustomDropdown
            id="work_location_select"
            label="Preferred Work Location"
            options={locationOptions}
            value={formData.preferredLocation}
            onChange={(val) => setFormData({ ...formData, preferredLocation: val })}
            required
          />

          {/* Notice Period Radios */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Notice Period Duration <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: 'Immediate', val: 'immediate' },
                { label: '15 Days', val: '15_days' },
                { label: '30 Days', val: '30_days' },
                { label: '60+ Days', val: '60_days' },
              ].map((opt) => (
                <label
                  key={opt.val}
                  className={`flex items-center space-x-2 p-2 border rounded-md cursor-pointer text-xs transition ${
                    formData.noticePeriod === opt.val
                      ? 'border-emerald-600 bg-emerald-50/50 font-semibold text-emerald-900'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="notice_period"
                    value={opt.val}
                    checked={formData.noticePeriod === opt.val}
                    onChange={(e) => setFormData({ ...formData, noticePeriod: e.target.value })}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Attachments */}
          <div className="pt-2 border-t border-slate-200 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Document Uploads
            </h3>

            {/* Resume Upload: 500 KB Limit */}
            <FileDropZone
              id="resume_file_input"
              name="curriculum_vitae"
              label="Updated Comprehensive Resume (CV)"
              hint="Max size 500 KB, PDF only"
              accept=".pdf"
              required
            />

            {/* Passport Photo Upload: 100 KB limit */}
            <FileDropZone
              id="passport_photo_input"
              name="passport_photo"
              label="Recent Passport Size Photograph"
              hint="Max size 100 KB, JPG or PNG only"
              accept=".jpg,.jpeg,.png"
              required
            />
          </div>

          {/* Declaration Checkbox */}
          <div className="pt-2">
            <label className="flex items-start space-x-2 cursor-pointer">
              <input
                type="checkbox"
                id="applicant_declaration"
                name="applicant_declaration"
                required
                checked={formData.declaration}
                onChange={(e) => setFormData({ ...formData, declaration: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <span className="text-[11px] text-slate-600 leading-tight">
                I hereby declare that all details furnished above are accurate and true to the best of my knowledge.
              </span>
            </label>
          </div>

          {/* Fake CAPTCHA */}
          <div className="pt-2 border-t border-slate-200">
            <FakeCaptcha verified={captchaVerified} onVerify={setCaptchaVerified} />
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-2 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Job Application</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
