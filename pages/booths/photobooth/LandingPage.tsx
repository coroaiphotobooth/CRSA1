
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhotoboothSettings, ProcessNotification } from '../../../types';
import { ChevronDown, Settings, AlertCircle, CheckCircle } from 'lucide-react';
import { useDialog } from '../../../components/DialogProvider';

interface LandingPageProps {
  onStart: () => void;
  onGallery: () => void;
  onAdmin: (tab?: 'settings' | 'concepts' | 'vip' | 'display') => void;
  settings: PhotoboothSettings;
  notifications?: ProcessNotification[]; 
  isVIPAdmin?: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, onGallery, onAdmin, settings, notifications = [], isVIPAdmin = false }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleStartBackgroundMode = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTransitioning) return;
    
    // Capture click coordinates for ripple effect
    setRipple({ x: e.clientX, y: e.clientY });
    setIsTransitioning(true);
    
    // Increased timeout to allow ripple animation to play
    setTimeout(() => {
      onStart();
    }, 1200); 
  };

  const isBackgroundOnly = settings.uiSettings?.launchLayout === 'background_only';

  return (
    <div 
      className={`flex flex-col items-center justify-center w-full min-h-screen relative p-6 md:p-10 text-center overflow-hidden tour-app-page ${isBackgroundOnly && !isTransitioning ? 'cursor-pointer' : ''}`}
      onClick={isBackgroundOnly ? handleStartBackgroundMode : undefined}
    >
      {/* Ripple Animation Element */}
      {ripple && (
        <div 
          className="absolute z-[100] pointer-events-none rounded-full border border-white/40 shadow-[0_0_60px_30px_rgba(188,19,254,0.4)] animate-[ripple-effect_1.5s_cubic-bezier(0.1,0.8,0.3,1)_forwards]"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Screen Fade and Blur Transition */}
      <div 
        className={`absolute inset-0 z-[99] transition-all duration-1000 pointer-events-none ${isTransitioning ? 'bg-black/60 backdrop-blur-2xl' : 'bg-transparent backdrop-blur-0'}`} 
      />
      
      {/* Top Right Controls Group */}
      <div 
        className="absolute top-6 right-6 z-50 flex items-center gap-4 md:gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {isBackgroundOnly && (
           <button 
             onClick={onGallery}
             className="text-gray-500 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest"
           >
             GALLERY
           </button>
        )}
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
                className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
              >
                Settings Concept
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); onAdmin('display'); }}
                className={`px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors ${isVIPAdmin ? 'border-b border-white/5' : ''}`}
              >
                Settings UI Display
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

      {!isBackgroundOnly && (
        <>
          <div className="relative z-10 mb-12 md:mb-16 animate-pulse px-4">
            <h1 className={`${settings.uiSettings?.eventNameSize || 'text-4xl md:text-7xl'} font-heading font-black neon-text text-white tracking-tighter italic leading-tight mb-4 uppercase`}>
              {settings.eventName}
            </h1>
            <h2 className={`${settings.uiSettings?.eventDescSize || 'text-sm md:text-xl'} tracking-[0.3em] md:tracking-[0.5em] text-[#bc13fe] font-bold uppercase`}>
              {settings.eventDescription}
            </h2>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-4 md:gap-8 w-full max-w-md md:max-w-none">
              <div className={`flex gap-4 md:gap-8 justify-center ${settings.uiSettings?.launchLayout === 'top_bottom' ? 'flex-col items-center' : 'flex-col md:flex-row'}`}>
                <button 
                  onClick={(e) => { e.stopPropagation(); onStart(); }}
                  style={settings.uiSettings?.buttonColor ? { backgroundColor: settings.uiSettings.buttonColor } : { backgroundColor: '#bc13fe' }}
                  className={`group relative py-5 md:py-6 transition-all rounded-none font-heading text-lg md:text-2xl tracking-widest neon-border overflow-hidden ${settings.uiSettings?.launchLayout === 'top_bottom' ? 'w-64 px-4' : 'px-8 md:px-12'}`}
                >
                  <span className="relative z-10 italic">LAUNCH</span>
                  <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
                </button>

                <button 
                  onClick={(e) => { e.stopPropagation(); onGallery(); }}
                  className={`group relative py-3 md:py-4 border-2 border-white/20 hover:border-white transition-all rounded-none font-heading text-sm md:text-lg tracking-widest overflow-hidden ${settings.uiSettings?.launchLayout === 'top_bottom' ? 'w-48 px-4 opacity-70 hover:opacity-100' : 'px-8 md:px-12 py-5 md:py-6 text-lg md:text-2xl'}`}
                >
                  <span className="relative z-10 italic">GALLERY</span>
                </button>
              </div>
          </div>
        </>
      )}

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
        @keyframes ripple-effect {
          0% {
            width: 0px;
            height: 0px;
            opacity: 0.8;
            border-width: 8px;
          }
          100% {
            width: 150vmax;
            height: 150vmax;
            opacity: 0;
            border-width: 0px;
          }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
