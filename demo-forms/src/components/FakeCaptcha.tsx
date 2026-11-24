import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface FakeCaptchaProps {
  verified: boolean;
  onVerify: (val: boolean) => void;
}

export const FakeCaptcha: React.FC<FakeCaptchaProps> = ({ verified, onVerify }) => {
  return (
    <div
      data-formpilot-captcha="true"
      className="p-3 bg-slate-50 border border-slate-300 rounded-lg max-w-sm flex items-center justify-between shadow-2xs"
    >
      <div className="flex items-center space-x-3">
        <input
          type="checkbox"
          id="mock_captcha_check"
          name="captcha_verified"
          checked={verified}
          onChange={(e) => onVerify(e.target.checked)}
          className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
        />
        <label htmlFor="mock_captcha_check" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
          I'm not a robot
        </label>
      </div>

      <div className="flex flex-col items-end text-[9px] text-slate-400">
        <ShieldAlert className="w-5 h-5 text-blue-500" />
        <span className="font-semibold text-slate-500">reCAPTCHA (Mock)</span>
        <span>Privacy - Terms</span>
      </div>
    </div>
  );
};
