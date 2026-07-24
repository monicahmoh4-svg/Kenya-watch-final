'use client';
import { Scan, AlertTriangle, Shield, TrendingUp, Users, MapPin } from 'lucide-react';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative min-h-[700px] flex items-center justify-center overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-fixed"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=2400&q=90')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-950/85 to-slate-950/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent" />
      </div>

      {/* Animated Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-400/30 backdrop-blur-sm mb-8 animate-fade-in">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-sm font-semibold text-blue-100">Live Intelligence Platform</span>
        </div>

        {/* Main Heading */}
        <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 leading-tight tracking-tight">
          Exposing Corruption.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 animate-gradient">
            Protecting Kenya.
          </span>
        </h1>

        {/* Description */}
        <p className="text-xl md:text-2xl text-slate-300 max-w-4xl mx-auto mb-10 leading-relaxed font-light">
          AI-powered surveillance of Kenya's public procurement. 
          Satellite verification. Real-time fraud detection. 
          <span className="text-white font-semibold block mt-2">
            105,738+ contracts monitored across all 47 counties
          </span>
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link 
            href="/scanner" 
            className="group inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-xl transition-all shadow-2xl shadow-blue-600/30 hover:shadow-blue-600/50 hover:scale-105"
          >
            <Scan className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            Scan Contracts Now
          </Link>
          <Link 
            href="/report" 
            className="group inline-flex items-center justify-center gap-3 px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-md border-2 border-white/30 text-white font-bold rounded-xl transition-all hover:scale-105"
          >
            <AlertTriangle className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            Report Corruption
          </Link>
        </div>

        {/* Trust Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          <TrustBadge 
            icon={<Shield className="w-6 h-6 text-emerald-400" />}
            value="14"
            label="Flagged Contracts"
          />
          <TrustBadge 
            icon={<MapPin className="w-6 h-6 text-blue-400" />}
            value="47"
            label="Counties Covered"
          />
          <TrustBadge 
            icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
            value="KES 8.7B"
            label="Funds Protected"
          />
          <TrustBadge 
            icon={<Users className="w-6 h-6 text-cyan-400" />}
            value="24/7"
            label="AI Monitoring"
          />
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2">
          <div className="w-1 h-3 bg-white/60 rounded-full" />
        </div>
      </div>
    </section>
  );
}

function TrustBadge({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="glass-card p-4 rounded-xl backdrop-blur-sm bg-white/5 border-white/10">
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}
