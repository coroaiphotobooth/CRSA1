import React, { useRef, useState, useEffect } from 'react';
import { Settings, ArrowRight, ArrowLeft } from 'lucide-react';
import { PhotoboothSettings } from '../../../types';

interface InteractiveVideoPageProps {
  pageConfig: any;
  settings: PhotoboothSettings;
  onNext: () => void;
  onBack: () => void;
  onAdmin?: () => void;
}

const InteractiveVideoPage: React.FC<InteractiveVideoPageProps> = ({ pageConfig, settings, onNext, onBack, onAdmin }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const interaction = pageConfig?.interaction || 'click_anywhere';
  const videoSize = pageConfig?.videoSize || 'full';
  const showBackButton = pageConfig?.showBackButton ?? true;
  const videoUrl = pageConfig?.videoUrl;

  useEffect(() => {
    if (interaction === 'watch_until_end' && videoRef.current) {
      const vid = videoRef.current;
      const handleEnded = () => {
        onNext();
      };
      vid.addEventListener('ended', handleEnded);
      return () => vid.removeEventListener('ended', handleEnded);
    }
  }, [interaction, onNext]);

  const handleClickAnywhere = (e: React.MouseEvent) => {
    if (interaction === 'click_anywhere') {
      onNext();
    }
  };

  const getVideoContainerClass = () => {
    switch (videoSize) {
      case 'medium':
        return 'w-[80%] max-w-4xl max-h-[80vh] aspect-video rounded-3xl overflow-hidden shadow-2xl relative z-10';
      case 'small':
        return 'w-[60%] max-w-2xl max-h-[60vh] aspect-video rounded-3xl overflow-hidden shadow-2xl relative z-10';
      case 'full':
      default:
        return 'w-full h-full absolute inset-0 z-0';
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

      {/* Video Element */}
      <div className={getVideoContainerClass()}>
        {videoUrl ? (
          <video 
            ref={videoRef}
            src={videoUrl}
            autoPlay
            playsInline
            muted={false} // user might want sound
            loop={interaction !== 'watch_until_end'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white flex-col gap-4">
            <span>Video not configured. Please upload a video in settings.</span>
            {interaction === 'watch_until_end' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onNext(); }} 
                className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl"
              >
                Skip (Admin Debug)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Foreground Content for Medium/Small mode (Background UI) */}
      {videoSize !== 'full' && (
        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
           {settings.backgroundVideoUrl ? (
             <video src={settings.backgroundVideoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
           ) : settings.backgroundImage ? (
             <img src={settings.backgroundImage} className="w-full h-full object-cover" alt="Background" />
           ) : (
             <div className="w-full h-full bg-gradient-to-br from-[#bc13fe]/20 to-black/80" />
           )}
        </div>
      )}

      {/* Top Banner indicating click anywhere */}
      {interaction === 'click_anywhere' && (
        <div className="absolute top-10 left-1/2 transform -translate-x-1/2 z-50 animate-pulse pointer-events-none">
          <p className="px-6 py-3 bg-black/50 backdrop-blur-md rounded-full text-white text-sm font-bold uppercase tracking-widest border border-white/10">
            Touch anywhere to continue
          </p>
        </div>
      )}

      {/* Buttons */}
      <div className="absolute bottom-12 w-full px-12 flex justify-between items-center z-50 pointer-events-none">
        <div className="w-1/3 pointer-events-auto">
          {showBackButton && (
            <button 
              onClick={(e) => { e.stopPropagation(); onBack(); }}
              className="px-6 py-4 bg-black/50 backdrop-blur-xl border border-white/20 hover:border-white text-white rounded-full font-bold uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-3 w-fit"
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
          )}
        </div>
        
        <div className="w-1/3 flex justify-end pointer-events-auto">
          {interaction === 'button_next' && (
            <button 
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="px-8 py-4 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-full font-bold uppercase tracking-widest text-sm shadow-xl shadow-[#bc13fe]/30 transition-all flex items-center justify-center gap-3 w-fit animate-bounce"
            >
              Launch / Next <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InteractiveVideoPage;
