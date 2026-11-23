import React, { useState, useEffect } from 'react';
import { ScholarshipForm } from './forms/ScholarshipForm';
import { JobApplicationForm } from './forms/JobApplicationForm';
import { KycForm } from './forms/KycForm';
import { IframeEmbeddedForm } from './forms/IframeEmbeddedForm';
import { SahayakLogoShowcase } from './components/SahayakLogoShowcase';
import { Shield, GraduationCap, Briefcase, FileCheck, Sparkles } from 'lucide-react';

export default function App() {
  const [activeForm, setActiveForm] = useState<'scholarship' | 'job' | 'kyc' | 'logos'>('scholarship');
  const [isIframeView, setIsIframeView] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('iframe') === 'true') {
      setIsIframeView(true);
    }
  }, []);

  // If loaded inside iframe sub-frame
  if (isIframeView) {
    return (
      <div className="p-2 bg-slate-50 min-h-screen">
        <IframeEmbeddedForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between font-sans">
      {/* Top Govt-Style Header Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-wider text-amber-400">DEMO FORMS SUITE</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">FormPilot Testbed & Evaluation Portal</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Simulated Controlled Form Environment</span>
          </div>
        </div>

        {/* Portal Branding Bar */}
        <div className="bg-slate-800/80 px-4 py-3 border-t border-slate-700/60">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                National Citizen Application & Statutory Services
              </h1>
              <p className="text-xs text-slate-400">
                Official mock environment for browser automation agent evaluation
              </p>
            </div>

            {/* Form Selection Tabs */}
            <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-700 space-x-1">
              <button
                onClick={() => setActiveForm('scholarship')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                  activeForm === 'scholarship'
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Scholarship</span>
              </button>

              <button
                onClick={() => setActiveForm('job')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                  activeForm === 'job'
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Job Application</span>
              </button>

              <button
                onClick={() => setActiveForm('kyc')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                  activeForm === 'kyc'
                    ? 'bg-purple-600 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>KYC + Iframe</span>
              </button>

              <button
                onClick={() => setActiveForm('logos')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                  activeForm === 'logos'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>✨ Sahayak Logos</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Form Display */}
      <main className="max-w-5xl mx-auto w-full px-4 py-8 flex-1">
        {activeForm === 'scholarship' && <ScholarshipForm />}
        {activeForm === 'job' && <JobApplicationForm />}
        {activeForm === 'kyc' && <KycForm />}
        {activeForm === 'logos' && <SahayakLogoShowcase />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-200/80 border-t border-slate-300 py-4 px-4 text-center text-xs text-slate-600">
        <p className="font-medium">FormPilot Benchmark Suite &copy; 2026</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Includes controlled React inputs, native selects, custom comboboxes, date fields, hidden file inputs, drag-and-drop zones, and iframe nesting.
        </p>
      </footer>
    </div>
  );
}
