'use client';
import useSWR from 'swr';
import { fetchAPI } from '@/lib/api';
import { ShieldCheck, Scan, FileWarning, Users, ArrowRight, Activity } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const { data: health, isLoading } = useSWR('/health', () => fetchAPI('/health'));

  return (
    <div className="relative overflow-hidden">
      {/* Background Gradient Blob */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-6">
            <Activity className="w-4 h-4" />
            <span>Live OCDS Sync Active</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6">
            Protecting Public Funds with <span className="text-gradient">Artificial Intelligence</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
            KenyaWatch AI analyzes procurement data in real-time, flagging ghost projects, cartel patterns, and anomalous contracts to ensure transparency and accountability.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/scanner" className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20">
              <Scan className="w-5 h-5" />
              Scan a Contract
            </Link>
            <Link href="/admin" className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold rounded-xl transition-all">
              Admin Dashboard
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Live System Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          <StatusCard 
            icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />} 
            title="System Status" 
            value={isLoading ? 'Checking...' : (health?.status === 'ok' ? 'Operational' : 'Degraded')} 
            status={health?.status === 'ok' ? 'success' : 'warning'}
          />
          <StatusCard 
            icon={<Scan className="w-6 h-6 text-blue-500" />} 
            title="AI Engine" 
            value={isLoading ? 'Checking...' : (health?.ai === 'configured' ? 'Gemini 2.5 Flash Active' : 'Offline')} 
            status={health?.ai === 'configured' ? 'success' : 'error'}
          />
          <StatusCard 
            icon={<Activity className="w-6 h-6 text-purple-500" />} 
            title="Database Sync" 
            value={isLoading ? 'Checking...' : (health?.database === 'connected' ? 'PPRA OCDS Synced' : 'Connecting')} 
            status={health?.database === 'connected' ? 'success' : 'warning'}
          />
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<Scan className="w-8 h-8 text-emerald-500" />}
            title="AI Contract Scanner"
            description="Paste tender documents or contract text. Our AI instantly cross-references it with known Auditor General and EACC fraud patterns."
            link="/scanner"
          />
          <FeatureCard 
            icon={<FileWarning className="w-8 h-8 text-red-500" />}
            title="Ghost Project Detector"
            description="Automated satellite imagery verification and GPS coordinate analysis to identify projects that exist only on paper."
            link="/scanner"
          />
          <FeatureCard 
            icon={<Users className="w-8 h-8 text-blue-500" />}
            title="Supplier Network Graph"
            description="Uncover hidden cartels by visualizing shared directors, addresses, and repeated awards across different counties."
            link="/admin"
          />
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icon, title, value, status }: any) {
  const statusColors = {
    success: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
    warning: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
    error: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  };

  return (
    <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className={`text-lg font-bold mt-1 ${statusColors[status as keyof typeof statusColors].split(' ')[2]}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, link }: any) {
  return (
    <Link href={link} className="group glass-card p-8 rounded-2xl block">
      <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{title}</h3>
      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
    </Link>
  );
}
