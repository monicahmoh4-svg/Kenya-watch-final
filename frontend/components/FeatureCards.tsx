'use client';
import { Scan, Ghost, Users, Brain, MapPin, Shield } from 'lucide-react';
import Link from 'next/link';

export function FeatureCards() {
  return (
    <section className="py-20 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Powerful Anti-Corruption Tools
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Advanced AI and satellite technology working together to expose corruption and protect public funds.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<Scan className="w-8 h-8 text-blue-500" />}
            title="AI Contract Scanner"
            description="Instant analysis of procurement documents using Gemini AI. Detects suspicious patterns, inflated prices, and conflict of interest."
            link="/scanner"
            color="blue"
          />
          <FeatureCard 
            icon={<Ghost className="w-8 h-8 text-purple-500" />}
            title="Ghost Project Detection"
            description="Satellite imagery verification of project locations. Identifies contracts for projects that exist only on paper."
            link="/ghost-projects"
            color="purple"
          />
          <FeatureCard 
            icon={<Users className="w-8 h-8 text-emerald-500" />}
            title="Supplier Network Analysis"
            description="Uncover cartels and bid-rigging by mapping relationships between suppliers, directors, and repeated awards."
            link="/procurement"
            color="emerald"
          />
          <FeatureCard 
            icon={<Brain className="w-8 h-8 text-orange-500" />}
            title="AI Investigator"
            description="Deep-dive forensic analysis of complex corruption cases. Cross-references multiple data sources automatically."
            link="/ai-investigator"
            color="orange"
          />
          <FeatureCard 
            icon={<MapPin className="w-8 h-8 text-red-500" />}
            title="County-Wide Coverage"
            description="Real-time monitoring across all 47 Kenyan counties. Track procurement activities from Nairobi to Turkana."
            link="/procurement"
            color="red"
          />
          <FeatureCard 
            icon={<Shield className="w-8 h-8 text-cyan-500" />}
            title="Anonymous Reporting"
            description="Secure, encrypted citizen reporting system. Submit tips about corruption without revealing your identity."
            link="/report"
            color="cyan"
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, description, link, color }: any) {
  const colorClasses = {
    blue: 'hover:border-blue-500/40 hover:shadow-blue-500/10',
    purple: 'hover:border-purple-500/40 hover:shadow-purple-500/10',
    emerald: 'hover:border-emerald-500/40 hover:shadow-emerald-500/10',
    orange: 'hover:border-orange-500/40 hover:shadow-orange-500/10',
    red: 'hover:border-red-500/40 hover:shadow-red-500/10',
    cyan: 'hover:border-cyan-500/40 hover:shadow-cyan-500/10',
  };

  return (
    <Link href={link} className="group block">
      <div className={`glass-card p-8 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-xl transition-all duration-300 ${colorClasses[color as keyof typeof colorClasses]}`}>
        <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {title}
        </h3>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>
    </Link>
  );
}
