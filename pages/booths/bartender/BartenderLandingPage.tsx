import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhotoboothSettings } from '../../../types';

// Touch file
console.log('Bartender Landing Init');

interface BartenderLandingPageProps {
  onStart: (name: string, kode: string) => void;
  settings: PhotoboothSettings;
}

const BartenderLandingPage: React.FC<BartenderLandingPageProps> = ({ onStart, settings }) => {
  const [vipKode, setVipKode] = useState('');
  const [vipLoading, setVipLoading] = useState(false);
  const [vipError, setVipError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [isVideoTalking, setIsVideoTalking] = useState(false);
  const [isAvatarGreeting, setIsAvatarGreeting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState('');
  const [storedKode, setStoredKode] = useState('');
  
  const talkingVideoRef = useRef<HTMLVideoElement>(null);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  };

  const playGreetingSynthesis = async (name: string, kode: string) => {
    const greetingText = `Halo ${name}, selamat datang di AI Bar. Malam ini ingin menu spesial pilihan saya, atau ingin melihat daftar minuman kami?`;
    
    setIsVideoTalking(true);

    const openAiKey = settings.vipOpenAiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY?.trim();

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
            voice: settings.vipTtsVoice || 'nova',
            speed: settings.vipTtsSpeed ?? 1.25,
          })
        });
        
        if (!response.ok) throw new Error('TTS API Failed');

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        
        audio.onended = () => {
           setIsVideoTalking(false);
           setIsExiting(true);
           setTimeout(() => {
              onStart(name, kode);
           }, 1000);
        };
        
        if (talkingVideoRef.current) {
           talkingVideoRef.current.currentTime = 0;
           talkingVideoRef.current.play().catch(e => console.error("Video play err:", e));
        }
        
        await audio.play();
        return;
      } catch (err) {
        console.error("OpenAI TTS Err:", err);
      }
    }

    // Fallback Web Speech
    const utterance = new SpeechSynthesisUtterance(greetingText);
    utterance.lang = 'id-ID';
    utterance.rate = settings.vipTtsSpeed ?? 0.9; 
    let voices = window.speechSynthesis.getVoices();
    let indoVoice = voices.find(v => v.lang.includes('id'));
    if(indoVoice) utterance.voice = indoVoice;

    utterance.onend = () => {
      setIsVideoTalking(false);
      setIsExiting(true);
      setTimeout(() => {
          onStart(name, kode);
      }, 1000);
    };

    if (talkingVideoRef.current) {
       talkingVideoRef.current.currentTime = 0;
       talkingVideoRef.current.play().catch(e => console.error("Video play err:", e));
    }

    window.speechSynthesis.speak(utterance);
  };

  const handleVipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipKode.trim() || vipLoading) return;

    setVipLoading(true);
    setVipError(null);

    const checkCode = async () => {
      try {
        const scriptUrl = "https://script.google.com/macros/s/AKfycbw5ZUzv-XwzgYJPvQt_PN42Yof3NivR_V3TJ3mfa6XkhsmAiOHMzZ5OTjA2NrKQk8s8/exec";
        if (scriptUrl) {
          const targetUrl = `${scriptUrl}?action=verify&kode=${encodeURIComponent(vipKode.trim())}`;
          const res = await fetch(targetUrl, { method: 'GET' });
          if (!res.ok) throw new Error("HTTP error " + res.status);
          const data = await res.json();
          if (data.status === 'success' && data.guestName) {
            return { firstName: data.guestName, kode: data.kode || vipKode.trim() };
          }
        }
        return null;
      } catch (e) {
         console.error("Verification failed", e);
         return null;
      }
    };

    const matchedGuest = await checkCode();

    if (matchedGuest) {
      const gName = matchedGuest.firstName.split(' ')[0];
      setGuestFirstName(gName);
      setStoredKode(matchedGuest.kode);
      setIsAvatarGreeting(true);
      
      // Ping app script to mark login status
      const scriptUrl = "https://script.google.com/macros/s/AKfycbw5ZUzv-XwzgYJPvQt_PN42Yof3NivR_V3TJ3mfa6XkhsmAiOHMzZ5OTjA2NrKQk8s8/exec";
      fetch(`${scriptUrl}?action=update&target=login&kode=${encodeURIComponent(matchedGuest.kode)}&status=sudah_bar`, {
        method: 'GET',
        mode: 'no-cors'
      }).catch(err => console.error(err));

      playGreetingSynthesis(gName, matchedGuest.kode);

    } else {
      setVipError('ID Tidak Ditemukan. Silakan cek kembali.');
      setVipLoading(false);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-end w-full min-h-screen relative text-center overflow-hidden transition-opacity duration-1000 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      
      <div className="absolute inset-0 w-full h-full bg-black z-0">
        <video 
          src={settings.vipVideoIdleUrl || '/placeholder-idle.mp4'} 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${!isVideoTalking ? 'opacity-100' : 'opacity-0'}`}
          autoPlay loop muted playsInline 
        />
        <video 
          ref={talkingVideoRef}
          src={settings.vipVideoTalkingUrl || '/placeholder-talking.mp4'} 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${isVideoTalking ? 'opacity-100' : 'opacity-0'}`}
          autoPlay loop muted playsInline 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
      </div>

      <div className="absolute top-6 right-6 z-50 flex items-center gap-6">
        <button onClick={toggleFullScreen} className="text-white/50 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest drop-shadow-md">
          FULL SCREEN
        </button>
      </div>

      <div className="relative z-20 w-full max-w-md mx-auto px-6 min-h-screen flex flex-col justify-center">
        
        <AnimatePresence mode="wait">
        {!isAvatarGreeting ? (
            vipLoading ? (
               <motion.div 
                 key="scanning"
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
                 transition={{ duration: 0.5, ease: "easeInOut" }}
                 className="flex flex-col items-center justify-center p-12 bg-black/80 backdrop-blur-2xl border border-blue-500/40 rounded-[2.5rem] shadow-[0_0_60px_rgba(59,130,246,0.25)] w-full relative overflow-hidden"
               >
                 <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 border-blue-500/50 rounded-tl-[2.5rem] opacity-70"></div>
                 <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 border-blue-500/50 rounded-br-[2.5rem] opacity-70"></div>

                 <div className="relative w-36 h-36 mb-10 flex items-center justify-center">
                   <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse"></div>
                   <div className="absolute inset-[-10px] border-[3px] border-t-blue-500 border-r-transparent border-b-blue-500/40 border-l-transparent rounded-full animate-[spin_3s_linear_infinite]"></div>
                   <div className="absolute inset-2 border-[4px] border-t-blue-500 border-transparent rounded-full animate-[spin_1.5s_linear_infinite_reverse]"></div>
                   <div className="absolute inset-6 border-[2px] border-dashed border-blue-500/60 rounded-full animate-[spin_4s_linear_infinite]"></div>
                   <div className="w-3 h-3 bg-white rounded-full shadow-[0_0_15px_white] animate-pulse"></div>
                 </div>
                 <h3 className="text-white font-heading tracking-[0.4em] text-lg md:text-xl uppercase animate-pulse">Accessing Bar System</h3>
                 <p className="text-blue-400 font-mono text-sm tracking-[0.2em] mt-4 opacity-80 uppercase">Verifying ID</p>
                 
                 <div className="w-full max-w-[200px] h-1 bg-blue-500/20 mt-8 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 w-1/2 animate-pulse rounded-full"></div>
                 </div>
               </motion.div>
            ) : (
                <motion.form 
                  key="form"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20, filter: 'blur(5px)' }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  onSubmit={handleVipSubmit} 
                  className="flex flex-col gap-4 items-center w-full"
                >
                  <h2 className="text-xl md:text-2xl tracking-[0.2em] md:tracking-[0.3em] text-white font-bold uppercase mb-4 drop-shadow-lg text-center">
                    Enter VIP ID
                  </h2>
                  <div className="relative flex flex-col items-center w-full">
                     <input 
                        type="text"
                        value={vipKode}
                        onChange={(e) => {
                            setVipKode(e.target.value.toUpperCase());
                            setVipError(null);
                        }}
                        placeholder="E.g., 69GG"
                        className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-6 py-5 text-center text-3xl font-heading text-white tracking-[0.5em] focus:border-blue-500 focus:outline-none transition-all shadow-xl"
                        autoComplete="off"
                        disabled={vipLoading}
                     />
                     {vipError && (
                        <span className="absolute -bottom-8 text-red-400 text-xs tracking-widest block bg-black/80 backdrop-blur-md border border-red-500/30 px-4 py-1.5 rounded-full">{vipError}</span>
                     )}
                  </div>
                  <button 
                    type="submit" 
                    disabled={vipLoading || !vipKode}
                    className="mt-6 w-full glass-button group relative overflow-hidden rounded-2xl py-5 transition-all text-sm font-bold tracking-[0.4em] uppercase hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-white/10 hover:bg-blue-500/40 border border-white/10 hover:border-blue-500/50"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-sweep"></div>
                    Access Bar
                  </button>
                </motion.form>
            )
        ) : (
            <motion.div 
               key="greeting"
               initial={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
               animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
               transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
               className="w-full flex flex-col items-center justify-center p-6 bg-transparent relative"
            >
                <div className="flex flex-col items-center text-center w-full">
                    <motion.h2 
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6, duration: 0.8 }}
                      className="text-5xl md:text-7xl font-sans font-black tracking-tighter text-blue-400 drop-shadow-[0_0_30px_rgba(59,130,246,0.8)]"
                    >
                        <span className="text-white text-3xl md:text-4xl block mb-2 opacity-80 tracking-widest font-heading font-normal">Halo,</span>
                        {guestFirstName}
                    </motion.h2>
                    
                    <motion.div 
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: '120px' }}
                      transition={{ delay: 1.2, duration: 0.8 }}
                      className="h-[2px] bg-gradient-to-r from-transparent via-white to-transparent my-8"
                    ></motion.div>
                    
                    <motion.p 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.6, duration: 0.8 }}
                      className="text-white text-sm md:text-lg font-mono leading-relaxed tracking-[0.3em] uppercase drop-shadow-md"
                    >
                        Selamat Datang di AI Bar<br/>
                        <span className="text-blue-400/80 text-[10px] md:text-xs mt-3 block tracking-[0.4em]">Inisialisasi menu minuman untuk Anda</span>
                    </motion.p>
                </div>
            </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BartenderLandingPage;
