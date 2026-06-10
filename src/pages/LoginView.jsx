import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Shield, Mail, Lock, Loader2, AlertCircle, LogIn, UserPlus, Database, Save } from 'lucide-react';

export default function LoginView() {
  // Check if Supabase is configured
  const storedUrl = localStorage.getItem('supabase_url') || '';
  const storedAnon = localStorage.getItem('supabase_anon_key') || '';
  const isSupabaseConfigured = storedUrl && storedUrl !== '' && !storedUrl.includes('placeholder-url');

  const [isSignUp, setIsSignUp] = useState(false);
  const [showSetup, setShowSetup] = useState(!isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Setup form states
  const [sbUrl, setSbUrl] = useState(storedUrl);
  const [sbKey, setSbKey] = useState(storedAnon);
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
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden p-8 space-y-8">
        
        {/* Branding header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">VeritasRecruit</h1>
          <p className="text-xs text-slate-500 max-w-[280px] mx-auto">
            Securely detect risky job postings and human exploitation scams.
          </p>
        </div>

        {showSetup ? (
          /* Supabase Setup View */
          <form onSubmit={handleSetupSave} className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl flex items-start gap-2.5">
              <Database className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-amber-800 dark:text-amber-400 font-semibold leading-relaxed">
                Supabase Connection Required. Please configure your remote database details below to boot the application.
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="sbUrl" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Supabase URL
              </label>
              <input
                type="text"
                id="sbUrl"
                required
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
                placeholder="https://xyz.supabase.co"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="sbKey" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Supabase Anon Key
              </label>
              <input
                type="password"
                id="sbKey"
                required
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-55 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow font-mono text-sm shadow-inner"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="sbBucket" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Storage Bucket Name
              </label>
              <input
                type="text"
                id="sbBucket"
                required
                value={sbBucket}
                onChange={(e) => setSbBucket(e.target.value)}
                placeholder="scans-images"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={setupSaving}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98] mt-6 text-sm"
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
                  className="text-xs font-bold text-slate-400 hover:text-slate-650 hover:underline transition-colors"
                >
                  Cancel and Back to Login
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
                <div className="flex items-start gap-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/30 p-3.5 rounded-xl text-xs text-rose-700 dark:text-rose-400 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Notification */}
              {successMsg && (
                <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 p-3.5 rounded-xl text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Email input */}
              <div className="space-y-1">
                <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    id="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-55 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm"
                  />
                </div>
              </div>

              {/* Password input */}
              <div className="space-y-1">
                <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    id="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-55 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-shadow text-sm"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-550 dark:disabled:bg-slate-800 dark:disabled:text-slate-650 text-white font-bold py-3.5 rounded-xl shadow-sm transition-all active:scale-[0.98] mt-6"
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
                className="text-xs font-bold text-emerald-600 dark:text-emerald-450 hover:underline transition-colors block mx-auto"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>

              <button
                onClick={() => setShowSetup(true)}
                className="text-[10px] font-semibold text-slate-400 hover:text-slate-650 hover:underline transition-colors block mx-auto pt-2 border-t border-slate-100 dark:border-slate-800 w-full"
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
