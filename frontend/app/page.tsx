'use client';
import useSWR from 'swr';
import { fetchAPI } from '@/lib/api';
import { Shield, AlertTriangle, FileText } from 'lucide-react';

export default function Home() {
  const { data: health, isLoading } = useSWR('/health', () => fetchAPI('/health'));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-12">
      <section className="text-center py-12">
        <h2 className="text-4xl font-extrabold mb-4">Protecting Public Funds with AI</h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          KenyaWatch AI analyzes procurement data in real-time, flagging ghost projects, cartel patterns, and anomalous contracts using advanced machine learning.
        </p>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <StatCard icon={<Shield className="w-8 h-8 text-green-500" />} title="System Status" value={isLoading ? '...' : health?.status === 'ok' ? 'Operational' : 'Degraded'} />
        <StatCard icon={<AlertTriangle className="w-8 h-8 text-red-500" />} title="AI Engine" value={isLoading ? '...' : (health?.ai === 'configured' ? 'Active' : 'Offline')} />
        <StatCard icon={<FileText className="w-8 h-8 text-blue-500" />} title="Database" value={isLoading ? '...' : (health?.database === 'connected' ? 'Synced' : 'Connecting')} />
      </section>
    </div>
  );
}

function StatCard({ icon, title, value }: any) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border dark:border-gray-700 flex items-center space-x-4">
      {icon}
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
