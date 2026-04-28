import React, { useRef, useState, useEffect } from 'react';
import { Settings, ArrowRight, ArrowLeft } from 'lucide-react';
import { PhotoboothSettings } from '../../../types';

interface InteractiveVideoStartPageProps {
  pageConfig: any;
  settings: PhotoboothSettings;
  onNext: () => void;
  onBack: () => void;
  onAdmin?: () => void;
  onGallery: () => void;
}

const InteractiveVideoStartPage: React.FC<InteractiveVideoStartPageProps> = ({ pageConfig, settings, onNext, onBack, onAdmin, onGallery }) => {
  const [isPlayingGreeting, setIsPlayingGreeting] = useState(false);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const greetingVideoRef = useRef<HTMLVideoElement>(null);

  const startOption = pageConfig?.startOption || 'click_anywhere';
  const startLabel = pageConfig?.startLabel || 'START';
  const enableNameEvent = pageConfig?.enableNameEvent ?? true;
  const enableDescription = pageConfig?.enableDescription ?? true;
  const enableGalleryButton = pageConfig?.enableGalleryButton ?? true;
  const videoIdleUrl = pageConfig?.videoIdleUrl;
  const videoGreetingUrl = pageConfig?.videoGreetingUrl;

  const handleStart = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isPlayingGreeting) return;

    if (videoGreetingUrl) {
      setIsPlayingGreeting(true);
      if (idleVideoRef.current) idleVideoRef.current.pause();
      if (greetingVideoRef.current) {
        greetingVideoRef.current.currentTime = 0;
        greetingVideoRef.current.play();
      }
    } else {
      onNext();
    }
  };

  useEffect(() => {
    if (isPlayingGreeting && greetingVideoRef.current) {
      const vid = greetingVideoRef.current;
      const handleEnded = () => {
        onNext();
      };
      vid.addEventListener('ended', handleEnded);
      return () => vid.removeEventListener('ended', handleEnded);
    }
  }, [isPlayingGreeting, onNext]);

  const handleClickAnywhere = (e: React.MouseEvent) => {
    if (startOption === 'click_anywhere') {
      handleStart(e);
    }
  };

  return (
    <div 
      className="w-full h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden"
      onClick={handleClickAnywhere}
    >
      {/* Settings Action (admin) */}
      {onAdmin && (
        <button 
          onClick={(e) => { e.stopPropagation(); onAdmin(); }} 
          className="absolute top-8 right-8 z-50 p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full shadow-2xl transition-all"
        >
          <Settings className="w-8 h-8 text-white/50 hover:text-white" />
        </button>
      )}

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
      {!isPlayingGreeting && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full w-full max-w-4xl px-4 pointer-events-none">
          <div className="flex-1 flex flex-col items-center justify-center">
            {enableNameEvent && settings.eventName && (
              <h1 className={`${settings.uiSettings?.eventNameSize || 'text-5xl md:text-8xl'} font-heading font-black neon-text text-white tracking-tighter italic leading-none uppercase text-center w-full mb-2 drop-shadow-2xl`}>
                {settings.eventName}
              </h1>
            )}
            {enableDescription && settings.eventDescription && (
              <h2 className={`${settings.uiSettings?.eventDescSize || 'text-lg md:text-2xl'} tracking-[0.3em] md:tracking-[0.5em] text-glow font-bold uppercase text-center w-full mb-8 drop-shadow-xl text-white`}>
                {settings.eventDescription}
              </h2>
            )}
          </div>
          
          <div className="pb-24 pointer-events-auto flex flex-col items-center gap-6">
            {startOption === 'button' && (
              <button 
                onClick={handleStart}
                style={settings.uiSettings?.buttonColor ? { backgroundColor: settings.uiSettings.buttonColor } : { backgroundColor: '#bc13fe' }}
                className={`group relative py-4 md:py-6 transition-all rounded-none font-heading text-xl md:text-3xl tracking-widest neon-border overflow-hidden px-12 md:px-20 w-auto`}
              >
                <span className="relative z-10 italic uppercase">{startLabel}</span>
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
              </button>
            )}

            {startOption === 'text' && (
              <button 
                onClick={handleStart}
                className="text-white text-3xl md:text-5xl font-heading tracking-widest font-bold uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-pulse"
              >
                {startLabel}
              </button>
            )}

            {enableGalleryButton && (
               <button 
                 onClick={(e) => { e.stopPropagation(); onGallery(); }}
                 className={`group relative py-3 md:py-4 border-2 border-white/20 hover:border-white transition-all rounded-none font-heading text-sm md:text-xl tracking-widest overflow-hidden px-8 md:px-12 bg-black/40 backdrop-blur-sm w-auto mt-4`}
               >
                 <span className="relative z-10 italic">GALLERY</span>
               </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveVideoStartPage;
