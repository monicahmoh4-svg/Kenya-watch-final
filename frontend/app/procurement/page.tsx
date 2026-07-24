'use client';
import { FileText, Search, Filter, Download } from 'lucide-react';
import { useState } from 'react';

export default function ProcurementPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <FileText className="w-8 h-8 text-blue-500" />
          Procurement Database
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Browse and search all government procurement contracts from the PPRA portal.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="glass-card p-4 mb-8 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search contracts, suppliers, or counties..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <Filter className="w-4 h-4" />
          Filters
        </button>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Contracts Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 text-center text-slate-500 dark:text-slate-400">
          <p>Contract data loading from PPRA OCDS feed...</p>
          <p className="text-sm mt-1">Auto-synced every 6 hours</p>
        </div>
      </div>
    </div>
  );
}
