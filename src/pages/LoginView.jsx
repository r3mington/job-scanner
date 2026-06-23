import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Shield, Mail, Lock, Loader2, AlertCircle, LogIn, UserPlus, Database, Save } from 'lucide-react';
import logo from '../assets/logo.png';

export default function LoginView() {
  const activeUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('supabase_url') || '';
  const activeAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('supabase_anon_key') || '';
  const isSupabaseConfigured = activeUrl && activeUrl !== '' && !activeUrl.includes('placeholder-url');

  const [isSignUp, setIsSignUp] = useState(false);
  const [showSetup, setShowSetup] = useState(!isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Setup form states
  const [sbUrl, setSbUrl] = useState(localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || '');
  const [sbKey, setSbKey] = useState(localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  const [sbBucket, setSbBucket] = useState(localStorage.getItem('supabase_bucket') || 'scans-images');
  const [setupSaving, setSetupSaving] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });
        if (signUpErr) throw signUpErr;
        
        if (data.user && data.session === null) {
          setSuccessMsg('Registration successful! Please check your email for the confirmation link.');
        } else {
          setSuccessMsg('Account created successfully!');
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });
        if (signInErr) throw signInErr;
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSave = (e) => {
    e.preventDefault();
    if (!sbUrl.trim() || !sbKey.trim()) {
      alert('Please fill in both Supabase URL and Anon Key.');
      return;
    }
    setSetupSaving(true);
    localStorage.setItem('supabase_url', sbUrl.trim());
    localStorage.setItem('supabase_anon_key', sbKey.trim());
    localStorage.setItem('supabase_bucket', sbBucket.trim());
    
    // Reload to re-initialize supabaseClient
    window.location.reload();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[80vh]">
      <div className="w-full max-w-md bg-[#111318] border border-slate-800 rounded p-8 space-y-8 shadow-2xl animate-fade-in">
        
        {/* Branding header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="bg-[#0a0f18] p-5 rounded border border-slate-800 inline-block">
              <img src={logo} alt="Sentinel AI Logo" className="h-10 w-auto object-contain" />
            </div>
          </div>
          <p className="text-xs text-slate-400 max-w-[280px] mx-auto font-mono">
            Securely detect risky job postings and human exploitation scams.
          </p>
        </div>

        {showSetup ? (
          /* Supabase Setup View */
          <form onSubmit={handleSetupSave} className="space-y-4">
            <div className="p-3 bg-amber-550/10 border border-amber-500/20 rounded flex items-start gap-2.5">
              <Database className="w-4 h-4 text-amber-550 mt-0.5 flex-shrink-0" />
              <div className="text-[10px] text-amber-500 font-mono leading-relaxed">
                Supabase Connection Required. Please configure your remote database details below to boot the application.
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sbUrl" className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Supabase URL
              </label>
              <input
                type="text"
                id="sbUrl"
                required
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
                placeholder="https://xyz.supabase.co"
                className="w-full px-4 py-3 rounded border border-slate-800 bg-[#0a0c12] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sbKey" className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Supabase Anon Key
              </label>
              <input
                type="password"
                id="sbKey"
                required
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-4 py-3 rounded border border-slate-800 bg-[#0a0c12] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-sm shadow-inner"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sbBucket" className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Storage Bucket Name
              </label>
              <input
                type="text"
                id="sbBucket"
                required
                value={sbBucket}
                onChange={(e) => setSbBucket(e.target.value)}
                placeholder="scans-images"
                className="w-full px-4 py-3 rounded border border-slate-800 bg-[#0a0c12] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={setupSaving}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-[#0d1117] font-bold py-3.5 rounded transition-all active:scale-[0.98] mt-6 text-sm font-mono"
            >
              {setupSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" /> Save & Connect
                </>
              )}
            </button>

            {isSupabaseConfigured && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowSetup(false)}
                  className="text-xs font-bold text-amber-550 hover:text-amber-400 font-mono"
                >
                  [ Cancel and Back to Login ]
                </button>
              </div>
            )}
          </form>
        ) : (
          /* Normal Auth Form */
          <>
            <form onSubmit={handleAuth} className="space-y-4">
              
              {/* Error Notification */}
              {error && (
                <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-550/20 p-3.5 rounded text-[11px] text-rose-400 font-mono">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Notification */}
              {successMsg && (
                <div className="flex items-start gap-2.5 bg-[#3fb950]/10 border border-[#3fb950]/20 p-3.5 rounded text-[11px] text-[#3fb950] font-mono">
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#3fb950]" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Email input */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    id="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-11 pr-4 py-3 rounded border border-slate-800 bg-[#0a0c12] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Password input */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    id="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-4 py-3 rounded border border-slate-800 bg-[#0a0c12] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-[#0d1117] font-bold py-3.5 rounded transition-all active:scale-[0.98] mt-6 font-mono text-sm"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSignUp ? (
                  <>
                    <UserPlus className="w-5 h-5" /> Create Account
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" /> Sign In
                  </>
                )}
              </button>
            </form>

            {/* Toggle link */}
            <div className="text-center space-y-4 pt-2">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                  setSuccessMsg('');
                }}
                className="text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors block mx-auto font-mono"
              >
                {isSignUp ? '[ Already have an account? Sign In ]' : "[ Don't have an account? Sign Up ]"}
              </button>

              <button
                onClick={() => setShowSetup(true)}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-400 hover:underline transition-colors block mx-auto pt-2 border-t border-slate-800 w-full font-mono uppercase tracking-wider"
              >
                Configure Database Connection Settings
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
