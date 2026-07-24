'use client';
import useSWR from 'swr';
import { fetchAPI } from '@/lib/api';
import { Shield, Brain, Database, Activity } from 'lucide-react';
import { HeroSection } from '@/components/HeroSection';
import { FeaturesNav } from '@/components/FeaturesNav';

export default function Home() {
  const { data: health, isLoading } = useSWR('/health', () => fetchAPI('/health'));

  return (
    <div className="relative">
      <HeroSection />
      <FeaturesNav />
      
      {/* System Status Section */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Platform Status
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Real-time monitoring of all system components
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <StatusCard 
              icon={<Activity className="w-6 h-6 text-emerald-500" />} 
              title="System Status" 
              value={isLoading ? 'Checking...' : (health?.status === 'ok' ? 'Fully Operational' : 'Degraded')} 
              status={health?.status === 'ok' ? 'success' : 'warning'}
              description="All services running normally"
            />
            <StatusCard 
              icon={<Brain className="w-6 h-6 text-blue-500" />} 
              title="AI Engine" 
              value={isLoading ? 'Checking...' : (health?.ai === 'configured' ? 'Gemini 2.5 Flash Active' : 'Offline')} 
              status={health?.ai === 'configured' ? 'success' : 'error'}
              description="Advanced fraud detection powered by Google AI"
            />
            <StatusCard 
              icon={<Database className="w-6 h-6 text-purple-500" />} 
              title="Database Sync" 
              value={isLoading ? 'Checking...' : (health?.database === 'connected' ? 'PPRA OCDS Synced' : 'Connecting')} 
              status={health?.database === 'connected' ? 'success' : 'warning'}
              description="Auto-synced every 6 hours from official sources"
            />
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-900 dark:to-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Fight Corruption?
          </h2>
          <p className="text-xl text-blue-100 mb-10">
            Join thousands of Kenyans using technology to protect public funds and ensure accountability.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="/scanner"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl hover:scale-105"
            >
              Start Scanning
            </a>
            <a 
              href="/about"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-700/50 border-2 border-white/30 text-white font-bold rounded-xl hover:bg-blue-700/70 transition-all"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusCard({ icon, title, value, status, description }: any) {
  const statusColors = {
    success: 'bg-emerald-100 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    warning: 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    error: 'bg-red-100 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  };

  return (
    <div className={`p-6 rounded-2xl border ${statusColors[status as keyof typeof statusColors]} backdrop-blur-sm`}>
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{value}</div>
      <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}
