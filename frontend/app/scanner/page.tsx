'use client';
import { useState } from 'react';
import { fetchAPI } from '@/lib/api';
import { Loader2, Scan } from 'lucide-react';

export default function ScannerPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const data = await fetchAPI('/api/ai/scan', {
        method: 'POST',
        body: JSON.stringify({ contract_text: text }),
      });
      setResult(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-3xl font-bold mb-6 flex items-center gap-2"><Scan /> AI Contract Scanner</h2>
      <textarea
        className="w-full h-64 p-4 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-green-500 outline-none"
        placeholder="Paste contract text, tender details, or supplier info here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={handleScan}
        disabled={loading || !text.trim()}
        className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg disabled:opacity-50 flex justify-center items-center gap-2"
      >
        {loading ? <Loader2 className="animate-spin" /> : 'Analyze for Fraud Patterns'}
      </button>

      {loading && (
        <div className="mt-8 space-y-3 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
        </div>
      )}

      {result && !loading && (
        <div className="mt-8 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h3 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">AI Analysis Result</h3>
          <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{result.analysis || result.error}</p>
          {result.risk_score && (
            <div className="mt-4 inline-block px-3 py-1 bg-red-600 text-white rounded-full text-sm font-bold">
              Risk Score: {result.risk_score}/100
            </div>
          )}
        </div>
      )}
    </div>
  );
}
