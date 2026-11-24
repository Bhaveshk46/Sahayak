import React, { useState } from 'react';
import { FileDropZone } from '../components/FileDropZone';
import { Landmark } from 'lucide-react';

export const IframeEmbeddedForm: React.FC = () => {
  const [bankData, setBankData] = useState({
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    accountHolderName: '',
    accountType: 'savings',
  });

  return (
    <div className="p-4 bg-slate-50 border border-slate-300 rounded-lg">
      <div className="flex items-center space-x-2 pb-2 mb-3 border-b border-slate-200 text-slate-800">
        <Landmark className="w-5 h-5 text-indigo-600" />
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider">
            Direct Bank Disbursal Verification (Embedded Frame)
          </h4>
          <p className="text-[10px] text-slate-500">
            FormPilot scans across same-origin iframes with <code>all_frames: true</code>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="bank_account_holder" className="block text-[11px] font-semibold text-slate-700 mb-1">
            Bank Account Beneficiary Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="bank_account_holder"
            name="bank_beneficiary_name"
            required
            value={bankData.accountHolderName}
            onChange={(e) => setBankData({ ...bankData, accountHolderName: e.target.value })}
            placeholder="Aditi Sharma"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-indigo-500 bg-white text-slate-800"
          />
        </div>

        <div>
          <label htmlFor="bank_account_number" className="block text-[11px] font-semibold text-slate-700 mb-1">
            Bank Account Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="bank_account_number"
            name="account_number"
            required
            value={bankData.accountNumber}
            onChange={(e) => setBankData({ ...bankData, accountNumber: e.target.value })}
            placeholder="123456789012"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-indigo-500 bg-white text-slate-800"
          />
        </div>

        <div>
          <label htmlFor="bank_ifsc_code" className="block text-[11px] font-semibold text-slate-700 mb-1">
            Bank IFSC Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="bank_ifsc_code"
            name="ifsc_code"
            required
            value={bankData.ifscCode}
            onChange={(e) => setBankData({ ...bankData, ifscCode: e.target.value.toUpperCase() })}
            placeholder="SBIN0001234"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-indigo-500 bg-white text-slate-800 uppercase"
          />
        </div>

        <div>
          <label htmlFor="bank_account_type" className="block text-[11px] font-semibold text-slate-700 mb-1">
            Account Type
          </label>
          <select
            id="bank_account_type"
            name="account_type"
            value={bankData.accountType}
            onChange={(e) => setBankData({ ...bankData, accountType: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md shadow-2xs focus:ring-2 focus:ring-indigo-500 bg-white text-slate-800"
          >
            <option value="savings">Savings Account</option>
            <option value="current">Current Account</option>
            <option value="salary">Salary Account</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <FileDropZone
          id="cancelled_cheque_file"
          name="cancelled_cheque"
          label="Passbook Front Page / Cancelled Cheque"
          hint="Max size 150 KB, PDF or JPG only"
          accept=".pdf,.jpg,.jpeg"
          required
        />
      </div>
    </div>
  );
};
