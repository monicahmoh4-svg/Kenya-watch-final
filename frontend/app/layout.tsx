import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import Link from 'next/link';
import { ShieldCheck, Moon, Sun } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KenyaWatch AI | Public Procurement Integrity',
  description: 'AI-powered fraud detection, ghost project tracking, and transparency for Kenyan public contracts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <header className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <Link href="/" className="flex items-center gap-2 group">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50 transition-colors">
                    <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-xl font-bold tracking-tight">Kenya<span className="text-emerald-600 dark:text-emerald-400">Watch</span> AI</span>
                </Link>
                
                <nav className="hidden md:flex items-center gap-8">
                  <Link href="/" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Home</Link>
                  <Link href="/scanner" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">AI Scanner</Link>
                  <Link href="/admin" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Admin</Link>
                </nav>

                <div className="flex items-center gap-4">
                  <ThemeToggle />
                  <Link href="/scanner" className="md:hidden p-2 text-slate-600 dark:text-slate-300">
                    <ShieldCheck className="w-6 h-6" />
                  </Link>
                </div>
              </div>
            </div>
          </header>
          
          <main className="flex-grow">
            {children}
          </main>

          <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8 mt-auto">
            <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <p>© {new Date().getFullYear()} KenyaWatch AI. Promoting transparency in public procurement.</p>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
