import React, { useState } from 'react';
import { CustomDropdown } from '../components/CustomDropdown';
import { FileDropZone } from '../components/FileDropZone';
import { FakeCaptcha } from '../components/FakeCaptcha';
import { ShieldCheck, Send, CheckCircle2, AlertTriangle } from 'lucide-react';

export const KycForm: React.FC = () => {
  const [formData, setFormData] = useState({
    legalName: '',
    panNumber: '',
    aadhaarNumber: '',
    fatherName: '',
    dob: '',
    gender: 'male',
    state: 'Maharashtra',
    address: '',
    pincode: '',
  });

  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const stateOptions = [
    { label: 'Maharashtra', value: 'Maharashtra' },
    { label: 'Delhi (NCT)', value: 'Delhi' },
    { label: 'Karnataka', value: 'Karnataka' },
    { label: 'Gujarat', value: 'Gujarat' },
    { label: 'Tamil Nadu', value: 'Tamil Nadu' },
    { label: 'Uttar Pradesh', value: 'Uttar Pradesh' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaVerified) {
      alert('Please complete the CAPTCHA step before submitting!');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-purple-800 to-indigo-900 px-6 py-4 text-white flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ShieldCheck className="w-7 h-7 text-purple-200" />
          <div>
            <h2 className="text-base font-bold">Central e-KYC Registry Portal (Mock)</h2>
            <p className="text-xs text-purple-100">Statutory Identity & Financial Profile Verification</p>
          </div>
        </div>
        <span className="text-xs bg-purple-950/70 px-2 py-0.5 rounded font-mono border border-purple-400/30">
          CKYC-SECURE
        </span>
      </div>

      {submitted ? (
        <div className="p-10 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800">KYC Verification Initiated!</h3>
          <p className="text-xs text-slate-600">
            CKYC Acknowledgment Number: CKYC-{Math.floor(10000000 + Math.random() * 90000000)}
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="text-xs text-purple-600 font-semibold underline mt-2"
          >
            Start New Verification
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Legal Name */}
            <div>
              <label htmlFor="legal_name" className="block text-xs font-semibold text-slate-700 mb-1">
                Full Legal Name (as on PAN/Aadhaar) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="legal_name"
                name="full_legal_name"
                required
                value={formData.legalName}
                onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                placeholder="Rajesh Kumar Patel"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-purple-500 text-slate-800"
              />
            </div>

            {/* Permanent Account Number (PAN) */}
            <div>
              <label htmlFor="pan_number" className="block text-xs font-semibold text-slate-700 mb-1">
                Permanent Account Number (PAN) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="pan_number"
                name="pan_card_number"
                required
                maxLength={10}
                value={formData.panNumber}
                onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                placeholder="ABCDE1234F"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-purple-500 text-slate-800 uppercase font-mono"
              />
            </div>

            {/* Aadhaar Number */}
            <div>
              <label htmlFor="aadhaar_number" className="block text-xs font-semibold text-slate-700 mb-1">
                12-digit Aadhaar Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="aadhaar_number"
                name="aadhaar_number"
                required
                maxLength={12}
                value={formData.aadhaarNumber}
                onChange={(e) => setFormData({ ...formData, aadhaarNumber: e.target.value })}
                placeholder="987654321012"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-purple-500 text-slate-800 font-mono"
              />
            </div>

            {/* Father's Name */}
            <div>
              <label htmlFor="father_name" className="block text-xs font-semibold text-slate-700 mb-1">
                Father's / Spouse's Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="father_name"
                name="father_name"
                required
                value={formData.fatherName}
                onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                placeholder="Suresh Patel"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-purple-500 text-slate-800"
              />
            </div>

            {/* Date of Birth */}
            <div>
              <label htmlFor="dob_field" className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="dob_field"
                name="date_of_birth"
                required
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-purple-500 text-slate-800"
              />
            </div>

            {/* Gender Native Select */}
            <div>
              <label htmlFor="kyc_gender" className="block text-xs font-semibold text-slate-700 mb-1">
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                id="kyc_gender"
                name="gender"
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-purple-500 bg-white text-slate-800"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Transgender / Other</option>
              </select>
            </div>
          </div>

          {/* Custom Dropdown: State */}
          <CustomDropdown
            id="state_domicile_select"
            label="State / Union Territory of Residence"
            options={stateOptions}
            value={formData.state}
            onChange={(val) => setFormData({ ...formData, state: val })}
            required
          />

          {/* Permanent Address */}
          <div>
            <label htmlFor="permanent_address" className="block text-xs font-semibold text-slate-700 mb-1">
              Permanent Address Line <span className="text-red-500">*</span>
            </label>
            <textarea
              id="permanent_address"
              name="residential_address"
              required
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Flat 402, Sunshine Heights, MG Road..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-purple-500 text-slate-800"
            />
          </div>

          {/* Document Uploads with Strict Hints */}
          <div className="pt-2 border-t border-slate-200 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Proof of Identity & Address (POI & POA)
            </h3>

            {/* Slot 1: Aadhaar PDF with 300 KB limit */}
            <FileDropZone
              id="aadhaar_doc_upload"
              name="aadhaar_document"
              label="Aadhaar Card (Masked e-Aadhaar)"
              hint="Max size 300 KB, PDF only"
              accept=".pdf"
              required
            />

            {/* Slot 2: PAN Card with 200 KB limit */}
            <FileDropZone
              id="pan_doc_upload"
              name="pan_card_document"
              label="PAN Card Clear Scan"
              hint="Max size 200 KB, JPG or PDF"
              accept=".pdf,.jpg,.jpeg"
              required
            />
          </div>

          {/* Embedded Sub-Form inside an IFRAME */}
          <div className="pt-3 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center space-x-1">
              <span>Direct Bank Account Verification Sub-Form</span>
              <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-mono">
                &lt;iframe&gt;
              </span>
            </label>
            <iframe
              id="kyc_bank_iframe"
              name="kyc_bank_frame"
              title="Bank Account Verification Frame"
              src="/?iframe=true"
              className="w-full h-80 border-2 border-dashed border-indigo-200 rounded-lg"
            />
          </div>

          {/* Fake CAPTCHA Step */}
          <div className="pt-2 border-t border-slate-200">
            <FakeCaptcha verified={captchaVerified} onVerify={setCaptchaVerified} />
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-purple-800 hover:bg-purple-900 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-2 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit KYC For Verification</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
