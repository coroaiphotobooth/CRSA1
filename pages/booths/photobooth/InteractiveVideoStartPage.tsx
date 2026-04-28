import React, { useRef, useState, useEffect } from 'react';
import { Settings, ArrowRight, ArrowLeft, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PhotoboothSettings } from '../../../types';

interface InteractiveVideoStartPageProps {
  pageConfig: any;
  settings: PhotoboothSettings;
  onNext: () => void;
  onBack: () => void;
  onAdmin?: (tab?: 'settings' | 'concepts' | 'interactive' | 'vip') => void;
  onGallery: () => void;
  isVIPAdmin?: boolean;
}

const InteractiveVideoStartPage: React.FC<InteractiveVideoStartPageProps> = ({ pageConfig, settings, onNext, onBack, onAdmin, onGallery, isVIPAdmin = false }) => {
  const [isPlayingGreeting, setIsPlayingGreeting] = useState(false);
  const [isTransitioningOut, setIsTransitioningOut] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const greetingVideoRef = useRef<HTMLVideoElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const startOption = pageConfig?.startOption || 'click_anywhere';
  const startLabel = pageConfig?.startLabel || 'START';
  const enableNameEvent = pageConfig?.enableNameEvent ?? true;
  const enableDescription = pageConfig?.enableDescription ?? true;
  const enableGalleryButton = pageConfig?.enableGalleryButton ?? true;
  const videoIdleUrl = pageConfig?.videoIdleUrl || 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/talking%20video/iddle%20v1%20.mp4';
  const videoGreetingUrl = pageConfig?.videoGreetingUrl || 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/talking%20video/TALKING%20V1.mp4';

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

  const handleStart = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isPlayingGreeting || isTransitioningOut) return;

    if (videoGreetingUrl) {
      setIsPlayingGreeting(true);
      if (idleVideoRef.current) idleVideoRef.current.pause();
      if (greetingVideoRef.current) {
        greetingVideoRef.current.currentTime = 0;
        greetingVideoRef.current.play();
      }
    } else {
      triggerTransitionOut();
    }
  };

  const triggerTransitionOut = () => {
    setIsTransitioningOut(true);
    setTimeout(() => {
      onNext();
    }, 1000); // 1-second fade
  };

  useEffect(() => {
    if (isPlayingGreeting && greetingVideoRef.current) {
      const vid = greetingVideoRef.current;
      const handleTimeUpdate = () => {
        // Trigger fade out in the last 1 second of the video
        if (vid.duration - vid.currentTime <= 1 && !isTransitioningOut) {
          triggerTransitionOut();
        }
      };
      const handleEnded = () => {
        if (!isTransitioningOut) triggerTransitionOut();
      };
      
      vid.addEventListener('timeupdate', handleTimeUpdate);
      vid.addEventListener('ended', handleEnded);
      
      return () => {
        vid.removeEventListener('timeupdate', handleTimeUpdate);
        vid.removeEventListener('ended', handleEnded);
      };
    }
  }, [isPlayingGreeting, isTransitioningOut, onNext]);

  const handleClickAnywhere = (e: React.MouseEvent) => {
    if (startOption === 'click_anywhere') {
      handleStart(e);
    }
  };

  return (
    <div 
      className={`w-full h-[100dvh] bg-black flex flex-col items-center justify-center relative overflow-hidden transition-opacity duration-1000 ${isTransitioningOut ? 'opacity-0' : 'opacity-100'}`}
      onClick={handleClickAnywhere}
    >
      {/* Top Right Controls Group */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-6" onClick={(e) => { e.stopPropagation(); }}>
        <button 
          onClick={toggleFullScreen} 
          className="text-gray-500 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest"
        >
          FULL SCREEN
        </button>

        {onAdmin && (
          <div className="relative" ref={menuRef}>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }} 
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
                  onClick={() => { setIsMenuOpen(false); onAdmin?.('settings'); }}
                  className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
                >
                  Settings Event
                </button>
                <button 
                  onClick={() => { setIsMenuOpen(false); onAdmin?.('concepts'); }}
                  className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
                >
                  Settings Concept
                </button>
                <button 
                  onClick={() => { setIsMenuOpen(false); onAdmin?.('interactive'); }}
                  className={`px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors ${isVIPAdmin ? 'border-b border-white/5' : ''}`}
                >
                  Interactive & Display
                </button>
                {isVIPAdmin && (
                  <button 
                    onClick={() => { setIsMenuOpen(false); onAdmin?.('vip'); }}
                    className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors"
                  >
                    VIP Import
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Videos */}
      <div className="w-full h-full absolute inset-0 z-0 bg-black">
        {videoIdleUrl && (
          <video 
            ref={idleVideoRef}
            src={videoIdleUrl}
            autoPlay
            playsInline
            muted={false}
            loop
            className={`w-full h-full object-cover transition-opacity duration-500 ${isPlayingGreeting ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}
          />
        )}
        
        {videoGreetingUrl && (
          <video 
            ref={greetingVideoRef}
            src={videoGreetingUrl}
            playsInline
            muted={false}
            className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-500 ${isPlayingGreeting ? 'opacity-100 z-10' : 'opacity-0 z-[-1]'}`}
          />
        )}
      </div>

      {/* UI Overlay */}
      <div className={`relative z-10 flex flex-col items-center justify-center h-full w-full max-w-4xl px-4 transition-opacity duration-1000 ${isPlayingGreeting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className={`${settings.uiSettings?.videoStartButtonPosition === 'bottom' ? 'flex-1' : ''} flex flex-col items-center justify-center pointer-events-none`}>
            {enableNameEvent && settings.eventName && (
              <h1 className={`${settings.uiSettings?.eventNameSize || 'text-3xl md:text-5xl'} font-heading font-black neon-text text-white tracking-tighter italic leading-none uppercase text-center w-full mb-1 md:mb-2 drop-shadow-2xl`}>
                {settings.eventName}
              </h1>
            )}
            {enableDescription && settings.eventDescription && (
              <h2 className={`${settings.uiSettings?.eventDescSize || 'text-sm md:text-lg'} tracking-[0.2em] md:tracking-[0.4em] text-glow font-bold uppercase text-center w-full drop-shadow-xl text-white`}>
                {settings.eventDescription}
              </h2>
            )}
          </div>
          
          <div className={`${settings.uiSettings?.videoStartButtonPosition === 'bottom' ? 'pb-16' : 'py-4'} pointer-events-auto flex flex-col items-center gap-4`}>
            {startOption === 'button' && (
              <button 
                onClick={handleStart}
                style={settings.uiSettings?.buttonColor ? { backgroundColor: settings.uiSettings.buttonColor } : { backgroundColor: '#bc13fe' }}
                className={`group relative py-3 md:py-4 transition-all rounded-none font-heading text-lg md:text-xl tracking-widest neon-border overflow-hidden px-8 md:px-12 w-auto`}
              >
                <span className="relative z-10 italic uppercase">{startLabel}</span>
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
              </button>
            )}

            {startOption === 'text' && (
              <button 
                onClick={handleStart}
                className="text-white text-2xl md:text-4xl font-heading tracking-widest font-bold uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-pulse"
              >
                {startLabel}
              </button>
            )}

            {enableGalleryButton && (
               <button 
                 onClick={(e) => { e.stopPropagation(); onGallery(); }}
                 className={`group relative py-2 md:py-3 border-2 border-white/20 hover:border-white transition-all rounded-none font-heading text-xs md:text-base tracking-widest overflow-hidden px-6 md:px-8 bg-black/40 backdrop-blur-sm w-auto mt-2`}
               >
                 <span className="relative z-10 italic">GALLERY</span>
               </button>
            )}
          </div>
        </div>
    </div>
  );
};

export default InteractiveVideoStartPage;
