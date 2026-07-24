'use client';
import { Shield, Target, Eye, Heart } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">About KenyaWatch AI</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400">
          Fighting corruption through technology and transparency.
        </p>
      </div>

      <div className="glass-card p-8 rounded-xl mb-8">
        <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          KenyaWatch AI leverages artificial intelligence, satellite imagery, and open data to expose corruption 
          in public procurement. We believe that transparency is the best disinfectant, and technology can empower 
          citizens to hold their government accountable.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <ValueCard 
            icon={<Eye className="w-6 h-6 text-blue-500" />}
            title="Transparency"
            description="Making government spending visible and accessible to all citizens."
          />
          <ValueCard 
            icon={<Shield className="w-6 h-6 text-emerald-500" />}
            title="Accountability"
            description="Holding public officials and suppliers accountable for public funds."
          />
          <ValueCard 
            icon={<Target className="w-6 h-6 text-red-500" />}
            title="Impact"
            description="Protecting billions in public funds from corruption and fraud."
          />
          <ValueCard 
            icon={<Heart className="w-6 h-6 text-purple-500" />}
            title="Public Good"
            description="Ensuring public resources reach the communities that need them."
          />
        </div>
      </div>

      <div className="glass-card p-8 rounded-xl">
        <h2 className="text-2xl font-bold mb-4">Technology Stack</h2>
        <ul className="space-y-2 text-slate-600 dark:text-slate-400">
          <li>• <strong>AI Analysis:</strong> Google Gemini 2.5 Flash for contract analysis</li>
          <li>• <strong>Data Source:</strong> PPRA Open Contracting Data Standard (OCDS)</li>
          <li>• <strong>Satellite Verification:</strong> Google Maps & Sentinel Hub API</li>
          <li>• <strong>Database:</strong> PostgreSQL with real-time sync</li>
          <li>• <strong>Frontend:</strong> Next.js 14 with React</li>
        </ul>
      </div>
    </div>
  );
}

function ValueCard({ icon, title, description }: any) {
  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
      <div className="mb-3">{icon}</div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}
