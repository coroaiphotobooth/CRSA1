import React, { useState, useRef } from 'react';
import { Settings, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PhotoboothSettings } from '../../../types';
import { DEFAULT_SETTINGS } from '../../../constants';

interface VipLandingPageProps {
  onStart: () => void;
  onAdmin: (tab?: 'settings' | 'concepts' | 'vip') => void;
  settings: PhotoboothSettings;
  isVIPAdmin?: boolean;
}

const VipLandingPage: React.FC<VipLandingPageProps> = ({ onStart, onAdmin, settings, isVIPAdmin = false }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [vipKode, setVipKode] = useState('');
  const [vipLoading, setVipLoading] = useState(false);
  const [vipError, setVipError] = useState<string | null>(null);
  
  const [isVideoTalking, setIsVideoTalking] = useState(false);
  const [isAvatarGreeting, setIsAvatarGreeting] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState('');
  
  const talkingVideoRef = useRef<HTMLVideoElement>(null);

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

  const playGreetingSynthesis = async (name: string) => {
    const greetingText = `Halo ${name}, Selamat datang di AI experience. Silakan pilih tema untuk melanjutkan photobooth anda!`;
    
    // Switch video to talking
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
          })
        });
        
        if (!response.ok) {
          throw new Error('TTS API Failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        
        audio.onended = () => {
           setIsVideoTalking(false);
           onStart(); // Proceed to concepts
        };
        
        await audio.play();
        return;
      } catch (err) {
        console.error("OpenAI TTS Err:", err);
        // Fallback to browser TTS if fail
      }
    }

    // Fallback: Browser Web Speech API
    const utterance = new SpeechSynthesisUtterance(greetingText);
    utterance.lang = 'id-ID';
    utterance.rate = 0.9; 
    
    let voices = window.speechSynthesis.getVoices();
    let indoVoice = voices.find(v => v.lang.includes('id'));
    if(indoVoice) utterance.voice = indoVoice;

    utterance.onend = () => {
      setIsVideoTalking(false);
      onStart();
    };

    window.speechSynthesis.speak(utterance);
    
    // Safety net in case speech synthesis gets stuck
    setTimeout(() => {
        if(window.speechSynthesis.speaking) window.speechSynthesis.cancel();
        setIsVideoTalking(false);
        onStart();
    }, 8000); 
  };

  const handleVipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipKode.trim() || vipLoading) return;

    setVipLoading(true);
    setVipError(null);

    const checkCode = async () => {
      try {
        const scriptUrl = settings.vipAppsScriptUrl || DEFAULT_SETTINGS.vipAppsScriptUrl;
        if (scriptUrl) {
          const res = await fetch(`${scriptUrl}?action=verify&kode=${encodeURIComponent(vipKode.trim())}`);
          const data = await res.json();
          if (data && data.success && data.guestName) {
            return {
              firstName: data.guestName,
              kode: data.kode || vipKode.trim()
            };
          }
          return null;
        }
        return null;
      } catch (e) {
         console.error("Verification failed", e);
         return null;
      }
    };

    const matchedGuest = await checkCode();

    if (matchedGuest) {
      const gName = matchedGuest.firstName.split(' ')[0]; // Ambil nama depan saja biar natural
      setGuestFirstName(gName);
      setIsAvatarGreeting(true);
      
      // Save session
      sessionStorage.setItem('vip_kode', matchedGuest.kode);
      sessionStorage.setItem('vip_guest_name', matchedGuest.firstName);

      // Ping app script to update login status
      const scriptUrl = settings.vipAppsScriptUrl || DEFAULT_SETTINGS.vipAppsScriptUrl;
      if (scriptUrl) {
        fetch(`${scriptUrl}?action=update&target=login&kode=${encodeURIComponent(matchedGuest.kode)}&status=sudah`, {
          method: 'GET',
          mode: 'no-cors'
        }).catch(err => console.error(err));
      }

      // Mulai AI Speaking Illusion
      playGreetingSynthesis(gName);

    } else {
      setVipError('ID Tidak Ditemukan. Silakan cek kembali.');
      setVipLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-end w-full min-h-screen relative text-center overflow-hidden tour-app-page">
      
      {/* BACKGROUND AVATAR VIDEO LAYER */}
      <div className="absolute inset-0 w-full h-full bg-black z-0">
        {/* Idle Video */}
        <video 
          src={settings.vipVideoIdleUrl || '/placeholder-idle.mp4'} 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${!isVideoTalking ? 'opacity-100' : 'opacity-0'}`}
          autoPlay 
          loop 
          muted 
          playsInline 
        />
        
        {/* Talking Video */}
        <video 
          ref={talkingVideoRef}
          src={settings.vipVideoTalkingUrl || '/placeholder-talking.mp4'} 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isVideoTalking ? 'opacity-100' : 'opacity-0'}`}
          autoPlay 
          loop 
          muted 
          playsInline 
        />
        
        {/* Fallback Overlay if no video provided */}
        {(!settings.vipVideoIdleUrl && !settings.vipVideoTalkingUrl) && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <span className="text-gray-500 text-xs">Video Avatar Background Not Configured</span>
            </div>
        )}
        
        {/* Dark Gradient Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
      </div>


      {/* Top Right Controls Group */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-6">
        <button 
          onClick={toggleFullScreen} 
          className="text-white/50 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest drop-shadow-md"
        >
          FULL SCREEN
        </button>
        
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)} 
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest drop-shadow-md"
          >
            <Settings className="w-5 h-5" /> <ChevronDown className={`w-4 h-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isMenuOpen && (
            <div className="absolute right-0 mt-4 w-48 bg-black/90 border border-white/10 rounded-lg shadow-2xl overflow-hidden backdrop-blur-md flex flex-col">
              <button 
                onClick={() => { setIsMenuOpen(false); navigate('/dashboard'); }}
                className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
              >
                Dashboard
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); onAdmin('settings'); }}
                className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
              >
                Settings Event
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); onAdmin('concepts'); }}
                className={`px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors ${isVIPAdmin ? 'border-b border-white/5' : ''}`}
              >
                Settings Concept
              </button>
              {isVIPAdmin && (
                <button 
                  onClick={() => { setIsMenuOpen(false); onAdmin('vip'); }}
                  className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors"
                >
                  VIP Import
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Interaction Content */}
      <div className="relative z-20 w-full max-w-md mx-auto px-6 pb-20">
        
        {!isAvatarGreeting ? (
            <form onSubmit={handleVipSubmit} className="flex flex-col gap-4 animate-fade-in-up">
              <h2 className="text-xl md:text-2xl tracking-[0.2em] md:tracking-[0.3em] text-white font-bold uppercase mb-2 drop-shadow-lg">
                Enter Valid VIP ID
              </h2>
              <div className="relative flex flex-col items-center">
                 <input 
                    type="text"
                    value={vipKode}
                    onChange={(e) => {
                        setVipKode(e.target.value.toUpperCase());
                        setVipError(null);
                    }}
                    placeholder="E.g., 69GG"
                    className="w-full bg-white/10 backdrop-blur-md border-2 border-white/20 rounded-2xl px-6 py-5 text-center text-3xl font-heading text-white tracking-[0.5em] focus:border-[#bc13fe] focus:outline-none transition-all shadow-xl"
                    autoComplete="off"
                    disabled={vipLoading}
                 />
                 {vipError && (
                    <span className="absolute -bottom-8 text-red-400 text-xs tracking-widest block bg-black/60 px-3 py-1 rounded-full">{vipError}</span>
                 )}
              </div>
              <button 
                type="submit" 
                disabled={vipLoading || !vipKode}
                className="mt-6 w-full glass-button group relative overflow-hidden rounded-2xl py-5 transition-all text-sm font-bold tracking-[0.4em] uppercase hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white/10 hover:bg-[#bc13fe]/20"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-sweep"></div>
                {vipLoading ? 'Verifying...' : 'Submit ID'}
              </button>
            </form>
        ) : (
            <div className="animate-fade-in-up flex flex-col items-center gap-6">
                <div className="bg-black/60 backdrop-blur-xl border border-white/20 p-8 rounded-3xl min-h-[140px] flex items-center justify-center transform transition-all hover:scale-105">
                    <p className="text-white text-2xl font-heading leading-relaxed italic tracking-wider">
                      "Halo <span className="text-[#bc13fe] font-black not-italic px-2">{guestFirstName}</span>, <br/>
                      Selamat datang di AI experience. Silakan pilih tema untuk melanjutkan!"
                    </p>
                </div>
            </div>
        )}

      </div>

    </div>
  );
};

export default VipLandingPage;
