import React, { useState, useEffect } from 'react';
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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();
  const { showDialog } = useDialog();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
        setIsSignUp(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const COUNTRIES = [
    "Indonesia", "Malaysia", "Singapore", "Thailand", "Vietnam", "Philippines",
    "United States", "United Kingdom", "Australia", "Japan", "South Korea", "Other"
  ];

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      await showDialog('alert', 'Success', 'Password updated successfully. You can now log in with your new password.');
      setIsRecovery(false);
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowForgotPassword(false);

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
          await showDialog('alert', 'Success', "Registration successful!\nPlease check your email for confirmation and please login.");
          setIsSignUp(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setShowForgotPassword(true);
          throw error;
        }
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

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      await showDialog('alert', 'Email Sent', 'Password reset instructions have been sent to your email. Please check your inbox or spam folder.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-white p-4 relative overflow-hidden">
      {/* Background Video */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-black">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full object-cover transition-all duration-700 landscape:rotate-90 landscape:min-w-[100vh] landscape:min-h-[100vw]"
          src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO/CC2.mp4"
        />
        {/* Dark Overlay for readability */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      </div>

      <div className="glass-card p-8 rounded-2xl border border-white/10 max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-2">
            <img 
              src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOGO/ICON%20S.png" 
              alt="Logo" 
              className="w-12 h-12 object-contain"
            />
            <h1 
              className="text-3xl font-heading font-bold neon-text"
              style={{ textShadow: '0 0 5px #bc13fe, 0 0 10px #bc13fe' }}
            >
              {isRecovery ? 'RESET PASSWORD' : isSignUp ? 'REGISTRATION' : 'LOGIN'}
            </h1>
          </div>
          <p className="text-gray-400 text-sm">AI PHOTOBOOTH APP</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={isRecovery ? handleUpdatePassword : handleAuth} className="flex flex-col gap-4">
          {!isRecovery && isSignUp && (
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

          {!isRecovery && (
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
          )}
          
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">{isRecovery ? 'New Password' : 'Password'}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {(isSignUp || isRecovery) && (
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

          {!isSignUp && showForgotPassword && !isRecovery && (
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-[#bc13fe] hover:text-white transition-colors font-bold"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-4 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRecovery ? 'UPDATE PASSWORD' : isSignUp ? 'SIGN UP' : 'SIGN IN')}
          </button>
        </form>

        {!isRecovery && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="flex items-center w-full gap-4">
              <div className="h-px bg-white/10 flex-1" />
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">OR</span>
              <div className="h-px bg-white/10 flex-1" />
            </div>
            
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="w-full py-4 border border-white/20 hover:bg-white/5 text-white rounded-xl font-bold tracking-widest transition-all uppercase text-sm"
            >
              {isSignUp ? 'Back to Login' : 'Register New Account'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
