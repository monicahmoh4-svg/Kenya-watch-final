import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function CTASection() {
  return (
    <section className="py-24 bg-gradient-to-br from-emerald-900/20 via-slate-950 to-blue-900/20 border-t border-slate-800">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-4xl md:text-5xl font-bold mb-6">Transparency is a Right.<br />Technology is the Tool.</h2>
        <p className="text-xl text-slate-400 mb-10">Join the fight against corruption. Use our tools to protect public funds.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/scanner" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all hover:scale-105">
            Start Scanning Contracts <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="/report" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all hover:scale-105">
            Report Corruption Anonymously
          </Link>
        </div>
      </div>
    </section>
  );
}
