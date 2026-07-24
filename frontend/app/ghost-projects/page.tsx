'use client';
import { Ghost, MapPin, AlertTriangle } from 'lucide-react';

export default function GhostProjectsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Ghost className="w-8 h-8 text-purple-500" />
          Ghost Projects
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Satellite-verified projects that exist only on paper.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <GhostProjectCard 
          title="Turkana North Girls Secondary School"
          county="Turkana"
          amount="KES 98,000,000"
          status="CONFIRMED GHOST"
          description="Satellite imagery shows empty scrubland. No construction activity detected."
        />
        <GhostProjectCard 
          title="Marsabit County Hospital Upgrade"
          county="Marsabit"
          amount="KES 156,000,000"
          status="UNDER INVESTIGATION"
          description="GPS coordinates point to uninhabited area. Site visit requested."
        />
      </div>
    </div>
  );
}

function GhostProjectCard({ title, county, amount, status, description }: any) {
  return (
    <div className="glass-card p-6 rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg mb-1">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {county} County
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          status === 'CONFIRMED GHOST' 
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        }`}>
          {status}
        </span>
      </div>
      <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">{description}</p>
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
        <span className="font-bold text-lg">{amount}</span>
        <button className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline">
          View Details
        </button>
      </div>
    </div>
  );
}
