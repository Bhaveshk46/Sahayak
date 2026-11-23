import React from 'react';
import { Sparkles, Shield, Feather, CheckCircle } from 'lucide-react';

export function SahayakLogoShowcase() {
  return (
    <div className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl border border-slate-800 space-y-10">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Official Brand Identity Concepts</span>
        </div>
        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-indigo-300">
          Sahayak (सहायक) Logo Suite
        </h2>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">
          High-definition vector logos designed for browser toolbar icons, Chrome Web Store, and hackathon presentation slides.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* LOGO 1: THE VIDYAPEETH WING (RECOMMENDED) */}
        <div className="bg-slate-800/90 border-2 border-amber-500/50 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 shadow-lg hover:border-amber-400 transition relative">
          <div className="absolute -top-3 px-3 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-black uppercase rounded-full tracking-wider">
            ★ Recommended Winner
          </div>

          <div className="w-36 h-36 flex items-center justify-center p-2">
            <svg width="128" height="128" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="showcaseBg1" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4338CA"/>
                  <stop offset="1" stopColor="#1E1B4B"/>
                </linearGradient>
                <linearGradient id="showcaseGold1" x1="30" y1="20" x2="90" y2="100" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FDE047"/>
                  <stop offset="0.5" stopColor="#F59E0B"/>
                  <stop offset="1" stopColor="#D97706"/>
                </linearGradient>
                <linearGradient id="showcaseCheck1" x1="40" y1="60" x2="85" y2="75" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#34D399"/>
                  <stop offset="1" stopColor="#059669"/>
                </linearGradient>
              </defs>
              <rect width="120" height="120" rx="28" fill="url(#showcaseBg1)"/>
              <rect x="1" y="1" width="118" height="118" rx="27" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
              <path d="M78 24C65 26 48 36 40 50C32 64 34 78 42 86C48 92 56 94 62 92C54 84 52 74 58 64C64 54 75 42 86 34C89 31 85 24 78 24Z" fill="url(#showcaseGold1)"/>
              <path d="M84 32C76 46 64 62 52 72C46 77 40 80 34 82C40 81 48 78 56 72C68 63 80 47 88 34C89 32 86 31 84 32Z" fill="#FEF08A" opacity="0.8"/>
              <path d="M46 62L58 74L86 42" stroke="url(#showcaseCheck1)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M46 62L58 74L86 42" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
            </svg>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-lg text-white">1. The Vidyapeeth Wing</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Classical Indian <strong>Kalam</strong> (quill feather of scholarship) fused into an aerodynamic wing and emerald checkmark.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap gap-1.5 justify-center text-[10px]">
            <span className="px-2 py-0.5 bg-slate-900 text-amber-300 rounded border border-slate-700">Scholarships</span>
            <span className="px-2 py-0.5 bg-slate-900 text-emerald-300 rounded border border-slate-700">Autopilot</span>
            <span className="px-2 py-0.5 bg-slate-900 text-indigo-300 rounded border border-slate-700">Assistance</span>
          </div>
        </div>

        {/* LOGO 2: THE CITIZEN SHIELD */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 shadow-lg hover:border-slate-600 transition">
          <div className="w-36 h-36 flex items-center justify-center p-2">
            <svg width="128" height="128" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="showcaseBg2" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#1E293B"/>
                  <stop offset="1" stopColor="#0F172A"/>
                </linearGradient>
                <linearGradient id="showcaseShield" x1="20" y1="20" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3B82F6"/>
                  <stop offset="0.5" stopColor="#2563EB"/>
                  <stop offset="1" stopColor="#1D4ED8"/>
                </linearGradient>
                <linearGradient id="showcaseEmerald" x1="45" y1="45" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#34D399"/>
                  <stop offset="1" stopColor="#059669"/>
                </linearGradient>
              </defs>
              <rect width="120" height="120" rx="28" fill="url(#showcaseBg2)"/>
              <rect x="1" y="1" width="118" height="118" rx="27" stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
              <path d="M60 22L86 32V58C86 75 75 90 60 98C45 90 34 75 34 58V32L60 22Z" fill="url(#showcaseShield)"/>
              <path d="M47 38H67L74 45V76C74 77.1 73.1 78 72 78H47C45.9 78 45 77.1 45 76V40C45 38.9 45.9 38 47 38Z" fill="#FFFFFF"/>
              <path d="M67 38V45H74L67 38Z" fill="#CBD5E1"/>
              <circle cx="68" cy="68" r="16" fill="url(#showcaseEmerald)"/>
              <path d="M62 68L66 72L74 64" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-lg text-white">2. The Citizen Shield</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Emphasizes on-device <strong>AES-256 vault security</strong> safeguarding citizen Aadhaar, PAN, and certificates.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap gap-1.5 justify-center text-[10px]">
            <span className="px-2 py-0.5 bg-slate-900 text-blue-300 rounded border border-slate-700">Zero-Leakage</span>
            <span className="px-2 py-0.5 bg-slate-900 text-emerald-300 rounded border border-slate-700">Encrypted</span>
          </div>
        </div>

        {/* LOGO 3: THE S-MONOGRAM RIBBON */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 shadow-lg hover:border-slate-600 transition">
          <div className="w-36 h-36 flex items-center justify-center p-2">
            <svg width="128" height="128" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="showcaseSaffron" x1="30" y1="30" x2="90" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#F97316"/>
                  <stop offset="1" stopColor="#F59E0B"/>
                </linearGradient>
                <linearGradient id="showcaseGreen" x1="30" y1="90" x2="90" y2="90" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#10B981"/>
                  <stop offset="1" stopColor="#059669"/>
                </linearGradient>
              </defs>
              <rect width="120" height="120" rx="28" fill="#0F172A"/>
              <rect x="1" y="1" width="118" height="118" rx="27" stroke="rgba(255,255,255,0.12)" strokeWidth="2"/>
              <path d="M78 30C84 30 88 34 88 40C88 46 82 52 74 54L48 60C40 62 34 68 34 76C34 84 41 90 50 90H80" stroke="url(#showcaseSaffron)" strokeWidth="9" strokeLinecap="round"/>
              <path d="M42 90C36 90 32 86 32 80C32 74 38 68 46 66L72 60C80 58 86 52 86 44C86 36 79 30 70 30H40" stroke="url(#showcaseGreen)" strokeWidth="9" strokeLinecap="round"/>
              <circle cx="78" cy="30" r="5" fill="#FEF08A"/>
              <circle cx="42" cy="90" r="5" fill="#6EE7B7"/>
            </svg>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-lg text-white">3. The Sahayak Monogram</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Geometric <strong>"S" ribbon</strong> with Indian tricolor tones. Ultra-scalable for tiny 16x16 browser action buttons.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap gap-1.5 justify-center text-[10px]">
            <span className="px-2 py-0.5 bg-slate-900 text-orange-300 rounded border border-slate-700">Scalable</span>
            <span className="px-2 py-0.5 bg-slate-900 text-teal-300 rounded border border-slate-700">Iconic</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <div>
          <span className="text-white font-semibold">Ready for Chrome MV3 Toolbar:</span> Vector assets exported to <code className="text-amber-400">public/icon.svg</code>
        </div>
        <div className="text-slate-500">
          Sizes: 16×16 · 32×32 · 48×48 · 128×128
        </div>
      </div>
    </div>
  );
}
