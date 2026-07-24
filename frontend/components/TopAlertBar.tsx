'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, Ghost, TrendingUp, Activity } from 'lucide-react';

interface Alert {
  id: string;
  type: 'GHOST' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  amount?: string;
}

export function TopAlertBar() {
  const [alerts, setAlerts] = useState<Alert[]>([
    { id: '1', type: 'GHOST', message: 'Turkana North Girls Secondary - KES 98M paid - empty scrubland confirmed by satellite', amount: 'KES 98M' },
    { id: '2', type: 'MEDIUM', message: 'KE-WAT-2025-0004 - Nairobi Water KES 1.2B - director undisclosed interest', amount: 'KES 1.2B' },
  ]);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % alerts.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [alerts.length]);

  const currentAlert = alerts[currentIndex];

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'GHOST': return 'bg-red-600';
      case 'CRITICAL': return 'bg-red-700';
      case 'HIGH': return 'bg-orange-600';
      case 'MEDIUM': return 'bg-yellow-600';
      default: return 'bg-slate-600';
    }
  };

  return (
    <div className="bg-slate-900 text-white text-sm py-2 px-4 overflow-hidden">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-emerald-400">LIVE</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-3 animate-fade-in">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getTypeColor(currentAlert.type)}`}>
              {currentAlert.type}
            </span>
            <span className="text-slate-300 truncate">{currentAlert.message}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Ghost className="w-3 h-3" />
            14 FLAGS
          </span>
          <span>{new Date().toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT</span>
        </div>
      </div>
    </div>
  );
}
