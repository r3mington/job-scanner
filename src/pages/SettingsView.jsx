import React, { useState, useEffect } from 'react';
import { Key, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isEnvKeyConfigured } from '../utils/apiKey';

export default function SettingsView() {
  const { profile } = useAuth();
  const envApiKey = isEnvKeyConfigured() ? (import.meta.env.VITE_GEMINI_API_KEY || '') : '';
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedKey = sessionStorage.getItem('gemini_api_key');

    if (storedKey) {
      setApiKey(storedKey);
    } else if (envApiKey) {
      setApiKey(envApiKey);
    }
  }, [profile, envApiKey]);

  const handleSave = async () => {
    // Save to sessionStorage (session-only configuration model for security)
    sessionStorage.setItem('gemini_api_key', apiKey.trim());

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
    }, 1500);
  };

  const isEnvConfigured = !!envApiKey;

  return (
    <div className="flex flex-col flex-1 p-4 max-w-screen-md w-full mx-auto my-4 space-y-6">
      
      {/* Gemini API Key Configuration Card */}
      <div className="bg-[#111318] rounded border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 font-mono">
            <Key className="w-5 h-5 text-amber-500" />
            Gemini API Configuration
          </h2>
          <p className="text-xs text-slate-400 mt-2 font-mono">
            Sentinel AI requires a Gemini API key to extract risk parameters from job listings.
          </p>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label htmlFor="apiKey" className="block text-xs font-bold text-slate-300 mb-2 flex items-center justify-between font-mono uppercase tracking-wider">
              <span>Google Gemini API Key</span>
              {isEnvConfigured && (
                <span className="text-[10px] bg-amber-500/10 text-amber-550 px-2 py-0.5 rounded font-bold">
                  Configured via Env
                </span>
              )}
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEnvConfigured ? "Using system environment key..." : "AIzaSy..."}
              className="w-full px-4 py-3 rounded border border-slate-800 bg-[#0a0c12] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-shadow font-mono text-sm shadow-inner"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex flex-col gap-4">
        <button
          onClick={handleSave}
          disabled={!apiKey.trim() && !envApiKey}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-650 text-[#0d1117] font-bold py-3.5 rounded transition-all active:scale-[0.98] font-mono text-sm"
        >
          <Save className="w-5 h-5" />
          {saved ? 'Saved Configurations!' : 'Save Settings'}
        </button>
      </div>

    </div>
  );
}
