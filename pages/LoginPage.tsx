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

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Register new account"}
          </button>
        </div>
      </div>
    </div>
  );
}
