'use client';
import { Flag, Ghost, FileText, Coins } from 'lucide-react';

export function StatsCards() {
  return (
    <section className="relative -mt-20 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            icon={<Flag className="w-8 h-8 text-red-500" />}
            value="14"
            label="FLAGGED CONTRACTS"
            color="red"
          />
          <StatCard 
            icon={<Ghost className="w-8 h-8 text-purple-500" />}
            value="9"
            label="GHOST PROJECTS"
            color="purple"
          />
          <StatCard 
            icon={<FileText className="w-8 h-8 text-blue-500" />}
            value="7"
            label="REPORTS (30 DAYS)"
            color="blue"
          />
          <StatCard 
            icon={<Coins className="w-8 h-8 text-emerald-500" />}
            value="KES 8.7B"
            label="FUNDS AT RISK"
            color="emerald"
          />
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon, value, label, color }: any) {
  const colorClasses = {
    red: 'bg-red-500/10 border-red-500/20 hover:border-red-500/40',
    purple: 'bg-purple-500/10 border-purple-500/20 hover:border-purple-500/40',
    blue: 'bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40',
  };

  return (
    <div className={`glass-card p-6 rounded-xl border ${colorClasses[color as keyof typeof colorClasses]} backdrop-blur-sm`}>
      <div className="flex items-center justify-between mb-3">
        {icon}
      </div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{value}</div>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
