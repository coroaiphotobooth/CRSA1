import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { useDialog } from '../components/DialogProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('Indonesia');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const { showDialog } = useDialog();

  const COUNTRIES = [
    "Indonesia", "Malaysia", "Singapore", "Thailand", "Vietnam", "Philippines",
    "United States", "United Kingdom", "Australia", "Japan", "South Korea", "Other"
  ];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name || 'Vendor',
              company_name: companyName,
              country: country,
              phone: phone,
              credits: 5
            }
          }
        });
        if (error) throw error;
        if (data.user) {
          await showDialog('alert', 'Success', "Registration successful! Please sign in.");
          setIsSignUp(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        if (data.user) {
          if (data.user.email === 'coroaiphotobooth@gmail.com') {
            navigate('/superadmin');
          } else {
            navigate('/dashboard');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the current origin, but if we are in a local dev environment that might
      // not be registered in Supabase, fallback to the production URL or let Supabase
      // use its default Site URL.
      const redirectUrl = window.location.origin.includes('localhost') 
        ? undefined // Let Supabase use its default Site URL
        : `${window.location.origin}/dashboard`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Google authentication failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-white p-4">
      <div className="glass-card p-8 rounded-2xl border border-white/10 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading font-bold neon-text mb-2">
            {isSignUp ? 'REGISTRATION' : 'LOGIN'}
          </h1>
          <p className="text-gray-400 text-sm">AI PHOTOBOOTH APP</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          {isSignUp && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                  placeholder="Acme Corp"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                  required
                >
                  {COUNTRIES.map(c => (
                    <option key={c} value={c} className="bg-black text-white">{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                  placeholder="+62 812 3456 7890"
                  required
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
              placeholder="vendor@example.com"
              required
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {isSignUp && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Retry Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-4 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'SIGN UP' : 'SIGN IN')}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[#050505] text-gray-400">OR</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-4 bg-white hover:bg-gray-100 text-black rounded-xl font-bold tracking-wider transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          CONTINUE WITH GOOGLE
        </button>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
