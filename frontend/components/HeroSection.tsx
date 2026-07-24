'use client';
import { Scan, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=2000')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/90" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        {/* Breadcrumb */}
        <div className="flex items-center justify-center gap-2 mb-8 text-sm text-slate-300">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            KENYA
          </span>
          <span>•</span>
          <span>REAL-TIME CORRUPTION INTELLIGENCE</span>
          <span>•</span>
          <span>ALL 47 COUNTIES</span>
        </div>

        {/* Main Heading */}
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          Exposing Corruption.<br />
          <span className="text-blue-400">Protecting Kenya.</span>
        </h1>

        {/* Description */}
        <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
          Live AI analysis of government procurement contracts from Kenya's official PPRA portal. 
          Satellite ghost project detection. Anonymous citizen reporting. 
          <span className="text-white font-semibold"> 105,738+ real contracts</span> — auto-synced daily.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link 
            href="/scanner" 
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50"
          >
            <Scan className="w-5 h-5" />
            Scan Contracts
          </Link>
          <Link 
            href="/report" 
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold rounded-xl transition-all"
          >
            <AlertTriangle className="w-5 h-5" />
            Report Corruption
          </Link>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-50 dark:from-slate-950 to-transparent" />
    </section>
  );
}
