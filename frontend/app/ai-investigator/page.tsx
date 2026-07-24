'use client';
import { Brain, Search, FileSearch } from 'lucide-react';
import { useState } from 'react';

export default function AIInvestigatorPage() {
  const [query, setQuery] = useState('');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-3">
          <Brain className="w-8 h-8 text-orange-500" />
          AI Investigator
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Advanced forensic analysis of corruption cases using AI.
        </p>
      </div>

      <div className="glass-card p-8 rounded-xl mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
          <input
            type="text"
            placeholder="Ask the AI investigator anything... (e.g., 'Find all contracts awarded to XYZ Ltd in the last 2 years')"
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-orange-500 outline-none text-lg"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <InvestigationCard 
          icon={<FileSearch className="w-6 h-6 text-blue-500" />}
          title="Supplier Background Check"
          description="Deep dive into supplier history, connections, and past contracts"
        />
        <InvestigationCard 
          icon={<Brain className="w-6 h-6 text-purple-500" />}
          title="Pattern Detection"
          description="Identify suspicious bidding patterns and price inflation"
        />
        <InvestigationCard 
          icon={<Search className="w-6 h-6 text-emerald-500" />}
          title="Cross-Reference Analysis"
          description="Link directors, addresses, and related entities across contracts"
        />
      </div>
    </div>
  );
}

function InvestigationCard({ icon, title, description }: any) {
  return (
    <div className="glass-card p-6 rounded-xl cursor-pointer hover:shadow-lg transition-shadow">
      <div className="mb-4">{icon}</div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-slate-600 dark:text-slate-400 text-sm">{description}</p>
    </div>
  );
}
