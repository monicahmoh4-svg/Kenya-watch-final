'use client';
import { useState, useEffect } from 'react';
import { fetchAPI } from '@/lib/api';
import { Download, Lock, LogOut, ShieldAlert } from 'lucide-react';

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('kw_token');
    if (stored) {
      setToken(stored);
      loadReports(stored);
    }
  }, []);

  const loadReports = async (authToken: string) => {
    setLoading(true);
    try {
      const data = await fetchAPI('/api/reports', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setReports(data || []);
    } catch (err) {
      console.error('Failed to load reports', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchAPI('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem('kw_token', res.token);
      setToken(res.token);
      loadReports(res.token);
    } catch (err: any) {
      alert(err.message || 'Login failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kw_token');
    setToken(null);
    setReports([]);
  };

  const handleExport = (id: string) => {
    window.open(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/export/report/${id}`, '_blank');
  };

  if (!token) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md p-8 glass-card rounded-2xl shadow-xl">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-full mb-4">
              <Lock className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold">Admin Access</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Enter your credentials to view flagged reports.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5">Username</label>
              <input 
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
                placeholder="admin" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input 
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
            </div>
            <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-emerald-600/20">
              Secure Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-emerald-500" />
            Admin Dashboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and export citizen fraud reports.</p>
        </div>
        <button 
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No reports found in the system.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300">ID</th>
                  <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300">County</th>
                  <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Project Name</th>
                  <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Status</th>
                  <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-sm font-mono text-slate-500">#{r.id}</td>
                    <td className="p-4 text-sm font-medium">{r.county}</td>
                    <td className="p-4 text-sm">{r.project_name}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        r.status === 'resolved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleExport(r.id)} 
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                      >
                        <Download className="w-4 h-4" /> 
                        Export PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
