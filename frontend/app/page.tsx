'use client';
import useSWR from 'swr';
import { fetchAPI } from '@/lib/api';
import { Scan, AlertTriangle, TrendingUp, Users, Shield, MapPin, Building2, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { HeroSection } from '@/components/HeroSection';
import { StatsCards } from '@/components/StatsCards';
import { FeatureCards } from '@/components/FeatureCards';

export default function Home() {
  const { data: health, isLoading } = useSWR('/health', () => fetchAPI('/health'));

  return (
    <div className="relative">
      <HeroSection />
      <StatsCards />
      <FeatureCards />
      
      {/* Live System Status Section */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-12">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatusCard 
              icon={<Shield className="w-6 h-6 text-emerald-500" />} 
              title="System Status" 
              value={isLoading ? 'Checking...' : (health?.status === 'ok' ? 'Operational' : 'Degraded')} 
              status={health?.status === 'ok' ? 'success' : 'warning'}
            />
            <StatusCard 
              icon={<BrainIcon />} 
              title="AI Engine" 
              value={isLoading ? 'Checking...' : (health?.ai === 'configured' ? 'Gemini 2.5 Flash Active' : 'Offline')} 
              status={health?.ai === 'configured' ? 'success' : 'error'}
            />
            <StatusCard 
              icon={<DatabaseIcon />} 
              title="Database Sync" 
              value={isLoading ? 'Checking...' : (health?.database === 'connected' ? 'PPRA OCDS Synced' : 'Connecting')} 
              status={health?.database === 'connected' ? 'success' : 'warning'}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusCard({ icon, title, value, status }: any) {
  const statusColors = {
    success: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    warning: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
    error: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl flex items-center gap-4 hover:shadow-lg transition-shadow">
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

function BrainIcon() {
  return (
    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}
