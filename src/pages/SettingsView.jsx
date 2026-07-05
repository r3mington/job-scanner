import React, { useState, useEffect } from 'react';
import { Key, Save, AlertCircle, Cpu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SettingsView() {
  const { profile, updateProfile } = useAuth();
  const envApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-1.5-flash');
  const [saved, setSaved] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    if (profile) {
      setApiKey(profile.gemini_api_key || localStorage.getItem('gemini_api_key') || envApiKey);
      setModelName(profile.gemini_model || localStorage.getItem('gemini_model') || 'gemini-1.5-flash');
    } else {
      const storedKey = localStorage.getItem('gemini_api_key');
      const storedModel = localStorage.getItem('gemini_model');

      if (storedKey) {
        setApiKey(storedKey);
      } else if (envApiKey) {
        setApiKey(envApiKey);
      }
      
      if (storedModel) setModelName(storedModel);
    }
  }, [profile, envApiKey]);

  const fetchModels = async () => {
    const activeKey = apiKey.trim() || envApiKey;
    if (!activeKey) {
      alert("Please enter your API key first.");
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
        headers: {
          'x-goog-api-key': activeKey
        }
      });
      const data = await res.json();
      if (data.error) {
        alert("API Error: " + data.error.message);
        return;
      }
      if (data.models) {
        const validModels = data.models
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        
        setAvailableModels(validModels);
        
        if (validModels.length > 0 && !validModels.includes(modelName)) {
           setModelName(validModels[0]);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Failed to fetch models from Google API.");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    // Save to localstorage (local configuration model)
    localStorage.setItem('gemini_api_key', apiKey.trim());
    localStorage.setItem('gemini_model', modelName);

    // Save only model config to Supabase profile (API key is stored locally-only for security)
    await updateProfile({
      gemini_model: modelName
    });

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

          <div className="border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="modelName" className="block text-xs font-bold text-slate-300 flex items-center gap-1.5 font-mono uppercase tracking-wider">
                <Cpu className="w-4 h-4 text-amber-500" /> AI Model
              </label>
              <button 
                onClick={fetchModels}
                disabled={fetchingModels || (!apiKey.trim() && !envApiKey)}
                className="text-xs font-bold text-amber-500 hover:text-amber-400 disabled:opacity-50 font-mono"
              >
                {fetchingModels ? '[ Fetching... ]' : '[ Fetch Available Models ]'}
              </button>
            </div>
            
            <select
              id="modelName"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full px-4 py-3 rounded border border-slate-800 bg-[#0a0c12] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-shadow text-sm font-mono"
            >
              {(availableModels.length > 0 ? availableModels : Array.from(new Set([modelName, 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-exp']))).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
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
