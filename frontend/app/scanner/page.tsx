'use client';
import { useState } from 'react';
import { fetchAPI } from '@/lib/api';
import { Scan, Loader2, AlertTriangle, CheckCircle, FileText } from 'lucide-react';

export default function ScannerPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await fetchAPI('/api/ai/scan', {
        method: 'POST',
        body: JSON.stringify({ contract_text: text }),
      });
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message || 'Failed to analyze contract. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3 flex items-center gap-3">
          <Scan className="w-8 h-8 text-emerald-500" />
          AI Contract Scanner
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Paste tender documents, supplier details, or contract clauses below. Our AI will cross-reference them with known EACC and Auditor General fraud patterns.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="space-y-4">
          <textarea
            className="w-full h-80 p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none text-slate-800 dark:text-slate-200 placeholder-slate-400 transition-all"
            placeholder="Example: 'Contract awarded to XYZ Ltd for the construction of a health center in County Y. GPS coordinates: -1.2921, 36.8219. Budget: KES 50,000,000.'"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            onClick={handleScan}
            disabled={loading || !text.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold py-4 rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg shadow-emerald-600/20"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Scan className="w-5 h-5" />}
            {loading ? 'Analyzing Patterns...' : 'Analyze for Fraud'}
          </button>
        </div>

        {/* Results Section */}
        <div className="glass-card rounded-xl p-6 min-h-[400px] flex flex-col">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-pulse">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="text-slate-500 font-medium">Cross-referencing with national fraud datasets...</p>
              <div className="w-full space-y-3 mt-4">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
              </div>
            </div>
          )}

          {!loading && !result && (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p className="font-medium">Awaiting input</p>
              <p className="text-sm mt-2 max-w-xs">Paste contract text on the left and click analyze to see the AI risk assessment.</p>
            </div>
          )}

          {!loading && result && (
            <div className="flex-1">
              {result.error ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p>{result.error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {result.risk_score && (
                    <div className={`p-4 rounded-lg border flex items-center justify-between ${
                      result.risk_score >= 70 
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                        : result.risk_score >= 40 
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    }`}>
                      <span className="font-bold text-lg">AI Risk Assessment</span>
                      <span className={`text-2xl font-black ${
                        result.risk_score >= 70 ? 'text-red-600 dark:text-red-400' : 
                        result.risk_score >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 
                        'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {result.risk_score}/100
                      </span>
                    </div>
                  )}
                  <div className="prose dark:prose-invert max-w-none">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      Analysis Details
                    </h3>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {result.analysis || 'No specific anomalies detected, but always verify with official PPRA records.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
