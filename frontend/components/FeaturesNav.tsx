'use client';
import { Scan, Ghost, Users, Brain, MapPin, Shield, FileText, Database } from 'lucide-react';
import Link from 'next/link';

export function FeaturesNav() {
  return (
    <section className="py-20 bg-white dark:bg-slate-950 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            Comprehensive Anti-Corruption Tools
          </h2>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto">
            Eight powerful features working together to ensure transparency and accountability
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureNavCard 
            icon={<LayoutIcon />}
            title="Overview"
            description="Dashboard with real-time statistics and system health"
            link="/"
            color="blue"
          />
          <FeatureNavCard 
            icon={<FileText className="w-7 h-7" />}
            title="Procurement"
            description="Browse all government contracts from PPRA portal"
            link="/procurement"
            color="emerald"
          />
          <FeatureNavCard 
            icon={<Ghost className="w-7 h-7" />}
            title="Ghost Projects"
            description="Satellite-verified fake projects detection"
            link="/ghost-projects"
            color="purple"
          />
          <FeatureNavCard 
            icon={<AlertTriangleIcon />}
            title="Report"
            description="Secure anonymous corruption reporting"
            link="/report"
            color="red"
          />
          <FeatureNavCard 
            icon={<Brain className="w-7 h-7" />}
            title="AI Investigator"
            description="Deep forensic analysis of corruption cases"
            link="/ai-investigator"
            color="orange"
          />
          <FeatureNavCard 
            icon={<Scan className="w-7 h-7" />}
            title="AI Scanner"
            description="Instant contract fraud detection"
            link="/scanner"
            color="cyan"
          />
          <FeatureNavCard 
            icon={<Database className="w-7 h-7" />}
            title="Sync Data"
            description="Real-time PPRA OCDS synchronization"
            link="/sync-data"
            color="indigo"
          />
          <FeatureNavCard 
            icon={<MapPin className="w-7 h-7" />}
            title="Coverage"
            description="All 47 Kenyan counties monitored"
            link="/about"
            color="pink"
          />
        </div>
      </div>
    </section>
  );
}

function FeatureNavCard({ icon, title, description, link, color }: any) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-500',
    emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-500',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-500',
    red: 'from-red-500/20 to-red-600/10 border-red-500/30 hover:border-red-500',
    orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-500',
    cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-500',
    indigo: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-500',
    pink: 'from-pink-500/20 to-pink-600/10 border-pink-500/30 hover:border-pink-500',
  };

  return (
    <Link href={link} className="group block">
      <div className={`relative p-6 rounded-2xl border bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} backdrop-blur-sm hover:shadow-2xl transition-all duration-300 hover:-translate-y-1`}>
        <div className="mb-4">{icon}</div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>
    </Link>
  );
}

function LayoutIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}
