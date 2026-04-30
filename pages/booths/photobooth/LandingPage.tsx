
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhotoboothSettings, ProcessNotification } from '../../../types';
import { ChevronDown, Settings, AlertCircle, CheckCircle } from 'lucide-react';
import { useDialog } from '../../../components/DialogProvider';
import { prewarmCamera } from '../../../lib/cameraUtils';

interface LandingPageProps {
  onStart: () => void;
  onGallery: () => void;
  onAdmin: (tab?: 'settings' | 'concepts' | 'vip' | 'interactive') => void;
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
    
    // Prewarm camera immediately to eliminate device setup delay
    prewarmCamera(settings);
    
    // Increased timeout to allow ripple animation to play
    setTimeout(() => {
      onStart();
    }, 1200); 
  };

  const isBackgroundOnly = settings.uiSettings?.launchLayout === 'background_only';
  const launchLayout = settings.uiSettings?.launchLayout || 'button_with_gallery';
  const showNameEvent = settings.uiSettings?.launchEnableNameEvent !== false;
  const showDescEvent = settings.uiSettings?.launchEnableDescEvent !== false;

  const launchButtonLabel = settings.uiSettings?.launchButtonLabel || 'LAUNCH';
  const launchTextLabel = settings.uiSettings?.launchTextLabel || 'START NOW';

  const isClickableBackground = isBackgroundOnly || launchLayout === 'touch_anywhere';

  return (
    <div 
      className={`flex flex-col items-center justify-center w-full h-[100dvh] relative p-4 md:p-10 text-center overflow-hidden tour-app-page ${isClickableBackground && !isTransitioning ? 'cursor-pointer' : ''}`}
      onClick={isClickableBackground ? handleStartBackgroundMode : undefined}
    >
      {/* Ripple Animation Element */}
      {ripple && (
        <div 
          className="absolute z-[100] pointer-events-none rounded-full border-4 border-white/40 shadow-[0_0_60px_30px_rgba(var(--glow-color-rgb),0.4)] animate-[ripple-effect_1.5s_cubic-bezier(0.1,0.8,0.3,1)_forwards]"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: '100px',
            height: '100px',
            marginLeft: '-50px',
            marginTop: '-50px'
          }}
        />
      )}

      {/* Screen Fade Transition (Removed heavy blur for performance) */}
      <div 
        className={`absolute inset-0 z-[99] transition-all duration-1000 pointer-events-none ${isTransitioning ? 'bg-black/80' : 'bg-transparent'}`} 
      />
      
       {/* Tech Data Logo (Conditional for Demo) */}
       {((settings?.vendorEmail === 'demo@coroai.app') || (settings?.eventName && settings.eventName.toLowerCase().includes('tech data'))) && (
         <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/TECH%20DATA/LOGO%20TECH%20DATA.png" alt="Tech Data" className="h-[80px] md:h-[120px] object-contain transition-all" />
         </div>
       )}

      {/* Top Right Controls Group */}
      <div 
        className="absolute top-6 right-6 z-50 flex items-center gap-4 md:gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {(isBackgroundOnly || launchLayout === 'button_only' || launchLayout === 'touch_anywhere') && (
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
                onClick={() => { setIsMenuOpen(false); onAdmin('concepts'); }}
                className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
              >
                Settings Concept
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); onAdmin('settings'); }}
                className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
              >
                Settings Event
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); onAdmin('interactive'); }}
                className="px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors border-b border-white/5"
              >
                Interactive & Display
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); navigate('/dashboard'); }}
                className={`px-4 py-3 text-left text-xs text-gray-300 hover:text-white hover:bg-white/10 uppercase tracking-widest transition-colors ${isVIPAdmin ? 'border-b border-white/5' : ''}`}
              >
                Dashboard
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
        <div className="relative z-10 flex flex-col items-center justify-center gap-4 w-full max-w-2xl mx-auto px-4 h-full py-8">
          
          {settings.uiSettings?.logoPosition === 'top' && settings.uiSettings?.logoUrl && (
            <div className="mb-2"><img src={settings.uiSettings.logoUrl} className={`${settings.uiSettings.logoSize || 'w-32'} object-contain z-20`} alt="Event Logo" /></div>
          )}

          <div className="flex flex-col items-center justify-center gap-1 mb-4">
            {showNameEvent && (
              <h1 className={`${settings.uiSettings?.eventNameSize || 'text-3xl md:text-5xl'} font-heading font-black neon-text text-white tracking-tighter italic leading-none uppercase text-center w-full`}>
                {settings.eventName}
              </h1>
            )}
            {showDescEvent && (
              <h2 className={`${settings.uiSettings?.eventDescSize || 'text-xs md:text-lg'} tracking-[0.2em] md:tracking-[0.4em] text-glow font-bold uppercase text-center w-full`}>
                {settings.eventDescription}
              </h2>
            )}
          </div>

          {settings.uiSettings?.logoPosition === 'middle' && settings.uiSettings?.logoUrl && (
            <div className="my-2"><img src={settings.uiSettings.logoUrl} className={`${settings.uiSettings.logoSize || 'w-32'} object-contain z-20`} alt="Event Logo" /></div>
          )}

          <div className={`flex items-center justify-center gap-4 w-full flex-col md:flex-row`}>
            {(launchLayout === 'button_with_gallery' || launchLayout === 'split_left_right' || launchLayout === 'top_bottom' || launchLayout === 'button_only') && (
              <button 
                key="btn-launch"
                onClick={(e) => { 
                    e.stopPropagation(); 
                    prewarmCamera(settings);
                    onStart(); 
                }}
                style={settings.uiSettings?.buttonColor ? { backgroundColor: settings.uiSettings.buttonColor } : { backgroundColor: '#bc13fe' }}
                className={`group relative ${settings.uiSettings?.buttonSize || 'py-3 md:py-4 px-8 text-base md:text-xl'} transition-all rounded-none font-heading tracking-widest neon-border overflow-hidden w-full max-w-fit md:min-w-[280px] h-fit inline-flex items-center justify-center`}
              >
                <span className="relative z-10 italic whitespace-nowrap">{launchButtonLabel}</span>
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
              </button>
            )}

            {(launchLayout === 'button_with_gallery' || launchLayout === 'split_left_right' || launchLayout === 'top_bottom') && (
              <button 
                key="btn-gallery"
                onClick={(e) => { e.stopPropagation(); onGallery(); }}
                className={`group relative ${settings.uiSettings?.buttonSize || 'py-3 md:py-4 px-8 text-base md:text-xl'} border-2 border-white/20 hover:border-white transition-all rounded-none font-heading tracking-widest overflow-hidden bg-black/40 backdrop-blur-sm w-full max-w-fit md:min-w-[280px] h-fit inline-flex items-center justify-center`}
              >
                <span className="relative z-10 italic whitespace-nowrap">GALLERY</span>
              </button>
            )}

            {launchLayout === 'custom_text' && (
              <button 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    prewarmCamera(settings);
                    onStart(); 
                }}
                className={`${settings.uiSettings?.launchTextSize || 'text-2xl md:text-4xl'} font-bold uppercase hover:scale-105 transition-transform`}
                style={{
                  fontFamily: settings.uiSettings?.launchTextFont || 'inherit',
                  color: settings.uiSettings?.launchTextColor || '#ffffff',
                  textShadow: settings.uiSettings?.launchTextShadow || '0px 0px 15px rgba(255,255,255,0.8)'
                }}
              >
                {launchTextLabel}
              </button>
            )}
          </div>
          
          {settings.uiSettings?.logoPosition === 'bottom' && settings.uiSettings?.logoUrl && (
            <div className="mt-8"><img src={settings.uiSettings.logoUrl} className={`${settings.uiSettings.logoSize || 'w-32'} object-contain z-20`} alt="Event Logo" /></div>
          )}
        </div>
      )}

      {/* SYSTEM LOGS / NOTIFICATIONS */}
      <div className="absolute bottom-0 left-0 w-full z-20 flex flex-col items-center pb-4 pointer-events-none">
         {notifications.map(n => (
            <div key={n.id} className="mb-2 bg-black/90 border border-white/10 px-4 py-2 rounded-full flex items-center gap-3 animate-[slideInUp_0.3s_ease-out]">
                {n.status === 'processing' && <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />}
                {n.status === 'completed' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                {n.status === 'failed' && <div className="w-2 h-2 rounded-full bg-red-500" />}
                
                <span className="text-[10px] font-mono uppercase text-gray-300">
                    {n.conceptName} : <span className={n.status === 'completed' ? 'text-green-400' : n.status === 'failed' ? 'text-red-400' : 'text-glow'}>
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
            transform: scale(0);
            opacity: 0.8;
          }
          100% {
            transform: scale(25);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
