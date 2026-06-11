import React, { useState, useEffect } from 'react';
import { Key, Save, AlertCircle, Cpu } from 'lucide-react';

export default function SettingsView() {
  const envApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-1.5-flash');
  const [saved, setSaved] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    const storedModel = localStorage.getItem('gemini_model');

    if (storedKey) {
      setApiKey(storedKey);
    } else if (envApiKey) {
      setApiKey(envApiKey);
    }
    
    if (storedModel) setModelName(storedModel);
  }, [envApiKey]);

  const fetchModels = async () => {
    const activeKey = apiKey.trim() || envApiKey;
    if (!activeKey) {
      alert("Please enter your API key first.");
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey}`);
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

  const handleSave = () => {
    localStorage.setItem('gemini_api_key', apiKey.trim());
    localStorage.setItem('gemini_model', modelName);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
    }, 1500);
  };

  const isEnvConfigured = !!envApiKey;

  return (
    <div className="flex flex-col flex-1 p-4 max-w-lg w-full mx-auto my-4 space-y-6">
      
      {/* Gemini API Key Configuration Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-600" />
            Gemini API Configuration
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            VeritasRecruit requires a Gemini API key to extract risk parameters from job listings.
          </p>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span>Google Gemini API Key</span>
              {isEnvConfigured && (
                <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded font-bold">
                  Configured via Environment Variable
                </span>
              )}
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEnvConfigured ? "Using system environment key..." : "AIzaSy..."}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow font-mono text-sm shadow-inner"
            />
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="modelName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-emerald-600" /> AI Model
              </label>
              <button 
                onClick={fetchModels}
                disabled={fetchingModels || (!apiKey.trim() && !envApiKey)}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 disabled:opacity-50"
              >
                {fetchingModels ? 'Fetching...' : 'Fetch Available Models'}
              </button>
            </div>
            
            <select
              id="modelName"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm shadow-inner"
            >
              {(availableModels.length > 0 ? availableModels : Array.from(new Set([modelName, 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash-exp']))).map(m => (
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
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98]"
        >
          <Save className="w-5 h-5" />
          {saved ? 'Saved Configurations!' : 'Save Settings'}
        </button>
      </div>

    </div>
  );
}
