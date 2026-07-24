'use client';
import { AlertTriangle, Shield, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { fetchAPI } from '@/lib/api';

export default function ReportPage() {
  const [anonymous, setAnonymous] = useState(true);
  const [formData, setFormData] = useState({
    county: '',
    project_name: '',
    description: '',
    reporter_name: '',
    contact: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchAPI('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          reporter_name: anonymous ? 'Anonymous' : formData.reporter_name,
          contact: anonymous ? 'N/A' : formData.contact
        })
      });
      setSubmitted(true);
    } catch (error) {
      alert('Failed to submit report. Please try again.');
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-3xl font-bold mb-4">Report Submitted Successfully</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Thank you for helping fight corruption. Your report has been securely submitted and will be reviewed by our AI system.
        </p>
        <button 
          onClick={() => setSubmitted(false)}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Submit Another Report
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-3">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          Report Corruption
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Securely report suspected corruption. Your identity is protected.
        </p>
      </div>

      <div className="glass-card p-8 rounded-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            {anonymous ? <EyeOff className="w-5 h-5 text-blue-600" /> : <Eye className="w-5 h-5 text-blue-600" />}
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-300">
                {anonymous ? 'Anonymous Reporting Enabled' : 'Identity Will Be Recorded'}
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                {anonymous ? 'Your identity will not be stored in our system.' : 'Your information will be kept confidential.'}
              </p>
            </div>
            <label className="ml-auto relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={anonymous} 
                onChange={(e) => setAnonymous(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">County *</label>
            <select 
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-red-500 outline-none"
              value={formData.county}
              onChange={(e) => setFormData({...formData, county: e.target.value})}
            >
              <option value="">Select County</option>
              {['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Turkana', 'Marsabit', 'Garissa'].map(county => (
                <option key={county} value={county}>{county}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Project Name *</label>
            <input 
              required
              type="text"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="e.g., Construction of Health Center"
              value={formData.project_name}
              onChange={(e) => setFormData({...formData, project_name: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description of Corruption *</label>
            <textarea 
              required
              rows={5}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-red-500 outline-none resize-none"
              placeholder="Provide as much detail as possible..."
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          {!anonymous && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Your Name</label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-red-500 outline-none"
                  value={formData.reporter_name}
                  onChange={(e) => setFormData({...formData, reporter_name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Contact Information</label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder="Email or Phone"
                  value={formData.contact}
                  onChange={(e) => setFormData({...formData, contact: e.target.value})}
                />
              </div>
            </>
          )}

          <button 
            type="submit"
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
          >
            Submit Report Securely
          </button>
        </form>
      </div>
    </div>
  );
}
