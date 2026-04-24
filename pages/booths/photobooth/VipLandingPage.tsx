import React, { useState, useRef, useEffect } from 'react';
import { Settings, ChevronDown, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { PhotoboothSettings } from '../../../types';

interface VipLandingPageProps {
  onStart: () => void;
  onGallery: () => void;
  onAdmin: (tab?: 'settings' | 'concepts' | 'vip' | 'display') => void;
  settings: PhotoboothSettings;
  isVIPAdmin?: boolean;
}

const VipLandingPage: React.FC<VipLandingPageProps> = ({ onStart, onGallery, onAdmin, settings, isVIPAdmin = false }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [isVideoTalking, setIsVideoTalking] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [showInteractPrompt, setShowInteractPrompt] = useState(true);
  
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

  const handleLaunch = () => {
    setIsVideoTalking(true);
    setShowInteractPrompt(false);
    
    if (talkingVideoRef.current) {
      talkingVideoRef.current.currentTime = 0;
      talkingVideoRef.current.play().catch(e => console.error("Video play err:", e));
      
      talkingVideoRef.current.onended = () => {
        setIsExiting(true);
        setTimeout(() => {
          onStart();
        }, 800);
      };
    } else {
      // Fallback if no video element
      setIsExiting(true);
      setTimeout(() => {
        onStart();
      }, 800);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-end w-full min-h-screen relative text-center overflow-hidden tour-app-page transition-opacity duration-1000 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* BACKGROUND AVATAR VIDEO LAYER */}
      <div className="absolute inset-0 w-full h-full bg-black z-0">
        {/* Idle Video */}
        <video 
          src={settings.vipVideoIdleUrl || '/placeholder-idle.mp4'} 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${!isVideoTalking ? 'opacity-100' : 'opacity-0'}`}
          autoPlay 
          loop 
          muted 
          playsInline 
        />
        
        {/* Talking Video (Unmuted so user hears the embedded greeting!) */}
        <video 
          ref={talkingVideoRef}
          src={settings.vipVideoTalkingUrl || '/placeholder-talking.mp4'} 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${isVideoTalking ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          playsInline 
        />
        
        {/* Fallback Overlay if no video provided */}
        {(!settings.vipVideoIdleUrl && !settings.vipVideoTalkingUrl) && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <span className="text-gray-500 text-xs">Video Avatar Background Not Configured</span>
            </div>
        )}
        
        {/* Dark Gradient Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40 z-10" />
      </div>


      {/* Top Right Controls Group */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-6">
        <button 
          onClick={toggleFullScreen} 
          className="text-white/50 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest drop-shadow-md bg-black/20 px-3 py-1.5 rounded-full"
        >
          FULL SCREEN
        </button>
        
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)} 
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest drop-shadow-md bg-black/20 px-3 py-1.5 rounded-full"
          >
            <Settings className="w-5 h-5" /> <ChevronDown className={`w-4 h-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isMenuOpen && (
            <div className="absolute right-0 mt-4 w-48 bg-black/95 border border-white/10 rounded-lg shadow-2xl overflow-hidden flex flex-col">
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

      {/* Main Interaction Content */}
      <div className="relative z-20 w-full max-w-2xl mx-auto px-6 h-screen flex flex-col justify-center items-center pointer-events-none">
        
        <AnimatePresence>
        {showInteractPrompt && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            className="flex flex-col items-center pointer-events-auto"
          >
            <h1 className="text-4xl md:text-6xl font-heading font-bold text-white tracking-[0.2em] uppercase mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
              {settings.title}
            </h1>
            <p className="text-white/80 font-mono tracking-widest text-sm md:text-base mb-12 max-w-sm text-center drop-shadow-md">
              Tap the button below to initialize the AI Photobooth Experience
            </p>

            <button 
              onClick={handleLaunch}
              className="group relative overflow-hidden rounded-full p-1 transition-all hover:scale-105 active:scale-95"
            >
              {/* Animated border glow */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-glow via-blue-500 to-glow animate-[spin_4s_linear_infinite]" />
              
              <div className="relative flex items-center justify-center gap-4 bg-black/80 backdrop-blur-xl rounded-full px-12 py-6 border border-white/10 group-hover:bg-black/60 transition-colors">
                <Camera className="w-8 h-8 text-glow group-hover:scale-110 transition-transform" />
                <span className="text-2xl font-bold tracking-[0.3em] uppercase text-white">Start</span>
              </div>
            </button>
          </motion.div>
        )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default VipLandingPage;
