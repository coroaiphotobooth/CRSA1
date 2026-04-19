
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhotoboothSettings, ProcessNotification } from '../../../types';
import { ChevronDown, Settings, AlertCircle, CheckCircle } from 'lucide-react';
import { useDialog } from '../../../components/DialogProvider';

interface LandingPageProps {
  onStart: () => void;
  onGallery: () => void;
  onAdmin: (tab?: 'settings' | 'concepts' | 'vip') => void;
  settings: PhotoboothSettings;
  notifications?: ProcessNotification[]; 
  isVIPAdmin?: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, onGallery, onAdmin, settings, notifications = [], isVIPAdmin = false }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // VIP State
  const [vipKode, setVipKode] = useState('');
  const [vipLoading, setVipLoading] = useState(false);
  const [vipSuccessMessage, setVipSuccessMessage] = useState<string | null>(null);
  const [vipError, setVipError] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleVipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipKode.trim()) return;

    setVipLoading(true);
    setVipError(null);

    // Give it a tiny delay to feel like it's processing
    setTimeout(() => {
      const guests = settings.vipGuests || [];
      const matchedGuest = guests.find(g => g.kode === vipKode.trim());

      if (matchedGuest) {
        setVipSuccessMessage(`Halo, selamat datang ${matchedGuest.firstName} ${matchedGuest.lastName || ''}!`);
        
        // Save to session storage so Photobooth.tsx knows who is playing
        const guestName = `${matchedGuest.firstName} ${matchedGuest.lastName || ''}`.trim();
        sessionStorage.setItem('vip_kode', matchedGuest.kode);
        sessionStorage.setItem('vip_guest_name', guestName);

        // After 2.5s, trigger normal flow
        setTimeout(() => {
          onStart();
        }, 2500);

      } else {
        setVipError('ID Tidak Ditemukan. Silakan cek kembali.');
        setVipLoading(false);
      }
    }, 500);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen relative p-6 md:p-10 text-center overflow-hidden tour-app-page">
      
      {/* Top Right Controls Group */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-6">
        <button 
          onClick={toggleFullScreen} 
          className="text-gray-500 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest"
        >
          FULL SCREEN
        </button>
        
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)} 
            className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest"
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

      <div className="relative z-10 mb-12 md:mb-16 animate-pulse px-4">
        <h1 className="text-4xl md:text-7xl font-heading font-black neon-text text-white tracking-tighter italic leading-tight mb-4 uppercase">
          {settings.eventName}
        </h1>
        <h2 className="text-sm md:text-xl tracking-[0.3em] md:tracking-[0.5em] text-[#bc13fe] font-bold uppercase">
          {settings.eventDescription}
        </h2>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 md:gap-8 w-full max-w-md md:max-w-none">
        
        {settings.enableVipMode ? (
          <div className="w-full max-w-sm flex flex-col items-center">
            {vipSuccessMessage ? (
              <div className="animate-[slideInUp_0.4s_ease-out] flex flex-col items-center gap-4 bg-[#bc13fe]/20 border border-[#bc13fe]/50 px-8 py-6 rounded-2xl w-full">
                <CheckCircle className="w-12 h-12 text-[#bc13fe] animate-pulse" />
                <h3 className="text-xl md:text-2xl font-bold text-white text-center italic font-heading tracking-wider">
                  {vipSuccessMessage}
                </h3>
              </div>
            ) : (
              <form onSubmit={handleVipSubmit} className="w-full relative flex flex-col items-center space-y-4">
                <input
                  type="text"
                  placeholder="ENTER UNIQUE ID"
                  value={vipKode}
                  onChange={(e) => {
                    setVipKode(e.target.value.toUpperCase());
                    setVipError(null);
                  }}
                  disabled={vipLoading}
                  className="w-full px-6 py-4 bg-black/60 border-2 border-white/20 focus:border-[#bc13fe] rounded-xl text-white font-mono text-center tracking-[0.3em] uppercase transition-all shadow-2xl focus:outline-none"
                  autoFocus
                />
                
                {vipError && (
                  <p className="text-red-400 text-xs font-mono tracking-widest uppercase flex items-center gap-1 animate-pulse">
                    <AlertCircle className="w-3 h-3" /> {vipError}
                  </p>
                )}

                <button 
                  type="submit"
                  disabled={vipLoading || !vipKode.trim()}
                  className="group w-full relative px-8 py-4 bg-[#bc13fe] hover:bg-[#a010d8] disabled:bg-gray-700 disabled:cursor-not-allowed transition-all rounded-xl font-heading text-lg tracking-widest neon-border overflow-hidden"
                >
                  <span className="relative z-10 italic">{vipLoading ? 'VERIFYING...' : 'SUBMIT ID'}</span>
                  {!vipLoading && <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />}
                </button>
              </form>
            )}

            <button 
              onClick={onGallery}
              className="mt-6 px-8 py-3 text-gray-400 hover:text-white transition-all rounded-full font-heading text-sm tracking-widest"
            >
              <span className="italic">VIEW GALLERY</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center">
            <button 
              onClick={onStart}
              className="group relative px-8 md:px-12 py-5 md:py-6 bg-[#bc13fe] hover:bg-[#a010d8] transition-all rounded-none font-heading text-lg md:text-2xl tracking-widest neon-border overflow-hidden"
            >
              <span className="relative z-10 italic">LAUNCH</span>
              <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
            </button>

            <button 
              onClick={onGallery}
              className="group relative px-8 md:px-12 py-5 md:py-6 border-2 border-white/20 hover:border-white transition-all rounded-none font-heading text-lg md:text-2xl tracking-widest overflow-hidden"
            >
              <span className="relative z-10 italic">GALLERY</span>
            </button>
          </div>
        )}

      </div>

      {/* SYSTEM LOGS / NOTIFICATIONS */}
      <div className="absolute bottom-0 left-0 w-full z-20 flex flex-col items-center pb-4 pointer-events-none">
         {notifications.map(n => (
            <div key={n.id} className="mb-2 bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-3 animate-[slideInUp_0.3s_ease-out]">
                {n.status === 'processing' && <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />}
                {n.status === 'completed' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                {n.status === 'failed' && <div className="w-2 h-2 rounded-full bg-red-500" />}
                
                <span className="text-[10px] font-mono uppercase text-gray-300">
                    {n.conceptName} : <span className={n.status === 'completed' ? 'text-green-400' : n.status === 'failed' ? 'text-red-400' : 'text-[#bc13fe]'}>
                        {n.status === 'completed' ? 'READY IN GALLERY' : n.status.toUpperCase()}
                    </span>
                </span>
            </div>
         ))}
         
         <div className="mt-2 text-[8px] md:text-xs text-gray-500 tracking-[0.4em] uppercase opacity-50 px-4 font-mono">
            AI POWERED - COROAI.APP // 2025 GENERATIVE_SYSTEM
         </div>
      </div>
      
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
