import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Mail, Lock, Loader2, AlertCircle, LogIn } from 'lucide-react';
import Logo from '../components/Logo';

export default function LoginView() {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
      if (signInErr) throw signInErr;
    } catch (err) {
      console.error("Auth error:", err);
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[80vh]">
      <div className="w-full max-w-md bg-[#111318] border border-slate-800 rounded p-8 space-y-8 shadow-2xl animate-fade-in">
        
        {/* Branding header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Logo height={45} showWordmark={true} />
          </div>
          <p className="text-xs text-slate-400 max-w-[280px] mx-auto font-mono">
            Securely detect risky job postings and human exploitation scams.
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          
          {/* Error Notification */}
          {error && (
            <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-550/20 p-3.5 rounded text-[11px] text-rose-400 font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
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
            ) : (
              <>
                <LogIn className="w-5 h-5" /> Sign In
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
