import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import Link from 'next/link';
import { ShieldCheck, Moon, Sun, Activity, FileText, Ghost, AlertTriangle, Brain, Database, Info } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TopAlertBar } from '@/components/TopAlertBar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KenyaWatch AI | Anti-Corruption Intelligence',
  description: 'Live AI analysis of government procurement contracts from Kenya official PPRA portal. Satellite ghost project detection.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TopAlertBar />
          <header className="sticky top-0 z-50 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <Link href="/" className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-600 rounded-lg">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">KenyaWatch AI</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">ANTI-CORRUPTION INTELLIGENCE</p>
                  </div>
                </Link>
                
                <nav className="hidden xl:flex items-center gap-1">
                  <NavLink href="/" icon={<LayoutIcon />} label="Overview" />
                  <NavLink href="/procurement" icon={<FileText className="w-4 h-4" />} label="Procurement" />
                  <NavLink href="/ghost-projects" icon={<Ghost className="w-4 h-4" />} label="Ghost Projects" />
                  <NavLink href="/report" icon={<AlertTriangle className="w-4 h-4" />} label="Report" />
                  <NavLink href="/ai-investigator" icon={<Brain className="w-4 h-4" />} label="AI Investigator" />
                  <NavLink href="/sync-data" icon={<Database className="w-4 h-4" />} label="Sync Data" />
                  <NavLink href="/about" icon={<Info className="w-4 h-4" />} label="About" />
                </nav>

                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Live</span>
                  </div>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </header>
          
          <main className="flex-grow">
            {children}
          </main>

          <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-6 mt-auto">
            <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <p>© {new Date().getFullYear()} KenyaWatch AI. Promoting transparency in public procurement.</p>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link 
      href={href} 
      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg transition-all"
    >
      {icon}
      {label}
    </Link>
  );
}

function LayoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2" />
    </svg>
  );
}
