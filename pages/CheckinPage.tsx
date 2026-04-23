import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Maximize, FileSpreadsheet } from 'lucide-react';
import { PhotoboothSettings } from './types';

interface CheckinPageProps {
  settings: PhotoboothSettings;
  onExit?: () => void;
}

const CheckinPage: React.FC<CheckinPageProps> = ({ settings, onExit }) => {
  const [vipKode, setVipKode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successGuest, setSuccessGuest] = useState<{name: string, statusText: string} | null>(null);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const playGreetingSynthesis = async (name: string, openAiKey?: string, voice: string = 'nova', speed: number = 1.25) => {
    const greetingText = `Halo ${name}, Selamat datang di acara! Silakan masuk dan nikmati acaranya.`;
    
    if (openAiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: greetingText,
            voice: voice,
            speed: speed,
          })
        });
        
        if (!response.ok) {
          throw new Error('TTS API Failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await audio.play();
        return;
      } catch (err) {
        console.error("OpenAI TTS Err:", err);
      }
    }

    // Fallback: Browser Web Speech API
    const utterance = new SpeechSynthesisUtterance(greetingText);
    utterance.lang = 'id-ID';
    utterance.rate = speed ?? 0.9; 
    
    let voices = window.speechSynthesis.getVoices();
    let indoVoice = voices.find(v => v.lang.includes('id'));
    if(indoVoice) utterance.voice = indoVoice;

    window.speechSynthesis.speak(utterance);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipKode.trim() || loading) return;

    setLoading(true);
    setError(null);
    setSuccessGuest(null);

    try {
      const scriptUrl = settings.vipAppsScriptUrl || "https://script.google.com/macros/s/AKfycbw5ZUzv-XwzgYJPvQt_PN42Yof3NivR_V3TJ3mfa6XkhsmAiOHMzZ5OTjA2NrKQk8s8/exec";
      
      // Verification Phase
      const verifyUrl = `${scriptUrl}?action=verify&kode=${encodeURIComponent(vipKode.trim())}`;
      const res = await fetch(verifyUrl);
      const text = await res.text();
      let data;
      try {
         data = JSON.parse(text);
      } catch(e) {
         throw new Error("Invalid response format from server");
      }

      if (data && data.success && data.guestName) {
        const fullName = data.guestName;
        const gName = fullName.split(' ')[0]; // First name for greeting
        
        // Update presence phase
        const updateRes = await fetch(`${scriptUrl}?action=update&target=login&kode=${encodeURIComponent(vipKode.trim())}&status=sudah`, {
          method: 'GET',
          mode: 'no-cors' // No-cors is fine for background pings, we don't strictly need the response body, assuming it reaches script.
        });

        const openAiKey = settings.vipOpenAiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY?.trim();
        playGreetingSynthesis(gName, openAiKey, settings.vipTtsVoice, settings.vipTtsSpeed);

        setSuccessGuest({
          name: fullName,
          statusText: 'Check-in Berhasil'
        });
        setVipKode('');

        // Hide success message after 5 seconds
        setTimeout(() => {
           setSuccessGuest(null);
        }, 5000);

      } else {
        setError('ID Tidak Ditemukan. Silakan cek kembali.');
      }
    } catch (e: any) {
       console.error("Check-in failed", e);
       setError(e.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-gray-950 font-sans">
        
       {/* Background */}
       <div className="absolute inset-0 z-0">
          {settings.backgroundImage ? (
             <img src={settings.backgroundImage} className="w-full h-full object-cover opacity-30 blur-sm" alt="bg" />
          ) : (
             <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-[#120024]"></div>
          )}
          <div className="absolute inset-0 bg-black/60 z-10"></div>
       </div>

       {/* Controls */}
       <div className="absolute top-4 right-4 z-50 flex gap-4">
         <button onClick={toggleFullScreen} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-colors border border-white/20">
            <Maximize className="w-4 h-4" />
         </button>
         {onExit && (
           <button onClick={onExit} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-colors border border-red-500/30">
               Close
           </button>
         )}
       </div>

       <div className="relative z-20 flex-1 flex flex-col items-center justify-center p-6 w-full max-w-2xl mx-auto">
          
          <div className="text-center mb-12">
            <div className="mx-auto w-16 h-16 bg-[#bc13fe]/20 rounded-full flex items-center justify-center mb-6 border border-[#bc13fe]/40 shadow-[0_0_30px_rgba(188,19,254,0.3)]">
                <FileSpreadsheet className="w-8 h-8 text-[#bc13fe]" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-widest mb-4">
               {settings.eventName || "VIP Gate Check-in"}
            </h1>
            <p className="text-gray-400 max-w-md mx-auto text-sm md:text-base">
               Enter the VIP Unique ID to process guest arrival and trigger welcome message.
            </p>
          </div>

          <div className="w-full p-8 md:p-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden">
             
             {/* Decorative glows */}
             <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#bc13fe]/20 blur-[100px] rounded-full point-events-none"></div>
             <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-blue-500/20 blur-[100px] rounded-full point-events-none"></div>

             <form onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-6">
                <div className="relative">
                  <label className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold mb-2 block ml-2 text-left">
                     Unique Code
                  </label>
                  <input 
                     type="text"
                     value={vipKode}
                     onChange={(e) => {
                         setVipKode(e.target.value.toUpperCase());
                         setError(null);
                     }}
                     placeholder="E.g., 69GG"
                     className="w-full bg-white/5 border border-white/20 rounded-2xl px-6 py-5 text-center text-3xl font-heading text-white tracking-[0.5em] focus:border-[#bc13fe] focus:bg-white/10 outline-none transition-all shadow-xl uppercase"
                     autoComplete="off"
                     disabled={loading}
                     autoFocus
                  />
                  {error && (
                     <div className="text-red-400 text-xs tracking-widest mt-3 text-center border border-red-500/30 bg-red-500/10 py-2 rounded-lg">
                        {error}
                     </div>
                  )}
                </div>

                <button 
                  type="submit" 
                  disabled={loading || !vipKode}
                  className="w-full relative overflow-hidden rounded-2xl py-5 transition-all text-sm font-bold tracking-[0.4em] justify-center items-center flex gap-3
                    bg-gradient-to-r from-transparent via-[#bc13fe]/20 to-transparent border border-[#bc13fe]/50 text-[#bc13fe] uppercase
                    hover:bg-[#bc13fe]/30 hover:border-[#bc13fe] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group
                  "
                >
                  {loading ? (
                    <span className="flex items-center gap-2 animate-pulse">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 
                      Processing
                    </span>
                  ) : (
                    <>
                      Verify <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
             </form>
          </div>

          <AnimatePresence>
            {successGuest && (
              <motion.div 
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, filter: 'blur(5px)' }}
                className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
              >
                 <div className="text-center">
                    <motion.div 
                       initial={{ scale: 0 }}
                       animate={{ scale: 1 }}
                       transition={{ type: "spring", delay: 0.1 }}
                       className="w-24 h-24 bg-green-500/20 border-2 border-green-500 text-green-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(34,197,94,0.4)]"
                    >
                       <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </motion.div>
                    <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-widest mb-3">
                       {successGuest.name}
                    </h2>
                    <p className="text-green-400 font-mono tracking-[0.3em] uppercase text-lg">
                       {successGuest.statusText}
                    </p>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
       </div>
    </div>
  );
};

export default CheckinPage;
