'use client';
import { Database, RefreshCw, CheckCircle, Clock } from 'lucide-react';

export default function SyncDataPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Database className="w-8 h-8 text-emerald-500" />
          Data Sync Status
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Real-time synchronization with Kenya's PPRA Open Contracting Data Standard (OCDS) portal.
        </p>
      </div>

      <div className="glass-card p-8 rounded-xl mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-semibold">Auto-Sync Active</span>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Sync Now
          </button>
        </div>

        <div className="space-y-4">
          <SyncItem 
            source="PPRA OCDS Portal"
            lastSync="2 minutes ago"
            status="success"
            records="105,738 contracts"
          />
          <SyncItem 
            source="Satellite Imagery (Google Maps)"
            lastSync="1 hour ago"
            status="success"
            records="47 counties mapped"
          />
          <SyncItem 
            source="EACC Fraud Database"
            lastSync="6 hours ago"
            status="success"
            records="1,247 patterns loaded"
          />
        </div>
      </div>
    </div>
  );
}

function SyncItem({ source, lastSync, status, records }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
      <div>
        <p className="font-medium">{source}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{records}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
          <Clock className="w-4 h-4" />
          {lastSync}
        </div>
        <CheckCircle className="w-5 h-5 text-emerald-500" />
      </div>
    </div>
  );
}
