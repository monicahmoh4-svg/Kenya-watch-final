'use client';
import { useState, useEffect } from 'react';
import { fetchAPI } from '@/lib/api';
import { Download, Lock } from 'lucide-react';

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('kw_token');
    if (stored) {
      setToken(stored);
      loadReports(stored);
    }
  }, []);

  const loadReports = async (authToken: string) => {
    try {
      const data = await fetchAPI('/api/reports', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setReports(data);
    } catch (err) {
      console.error('Failed to load reports', err);
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
      alert(err.message);
    }
  };

  const handleExport = (id: string) => {
    window.open(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/export/report/${id}`, '_blank');
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Lock /> Admin Access</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <input className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <input className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="w-full bg-green-600 text-white py-2 rounded font-bold">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-3xl font-bold mb-6">Admin Dashboard</h2>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th className="p-4">ID</th>
              <th className="p-4">County</th>
              <th className="p-4">Project</th>
              <th className="p-4">Status</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-t dark:border-gray-700">
                <td className="p-4">{r.id}</td>
                <td className="p-4">{r.county}</td>
                <td className="p-4">{r.project_name}</td>
                <td className="p-4"><span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">{r.status}</span></td>
                <td className="p-4">
                  <button onClick={() => handleExport(r.id)} className="text-blue-600 hover:underline flex items-center gap-1">
                    <Download size={16} /> Export PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
