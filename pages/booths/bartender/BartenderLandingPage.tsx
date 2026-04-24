import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhotoboothSettings } from '../../../types';
import { Settings } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

// Touch file
console.log('Bartender Landing Init');

interface BartenderLandingPageProps {
  onStart: (name: string, kode: string) => void;
  settings: PhotoboothSettings;
}

const BartenderLandingPage: React.FC<BartenderLandingPageProps> = ({ onStart, settings }) => {
  const [isVideoTalking, setIsVideoTalking] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  const talkingVideoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { eventId } = useParams();

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

  const handleAccessBar = async () => {
    setIsVideoTalking(true);

    if (talkingVideoRef.current) {
      talkingVideoRef.current.playbackRate = settings.vipTtsSpeed ?? 1.1;
      talkingVideoRef.current.currentTime = 0;
      
      talkingVideoRef.current.play().catch(e => console.error("Video play err:", e));
      
      talkingVideoRef.current.onended = () => {
        setIsVideoTalking(false);
        setIsExiting(true);
        setTimeout(() => {
          onStart('', '');
        }, 1000);
      };
    } else {
      setTimeout(() => {
        setIsVideoTalking(false);
        setIsExiting(true);
        setTimeout(() => {
          onStart('', '');
        }, 1000);
      }, 5000);
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
        {eventId && (
          <button 
            onClick={() => navigate(`/admin/${eventId}/bartender`)}
            className="w-12 h-12 bg-white/5 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center transition-all hover:scale-110 border border-white/10"
          >
            <Settings className="text-white w-5 h-5" />
          </button>
        )}
      </div>

      <div className="relative z-20 w-full max-w-md mx-auto px-6 min-h-screen flex flex-col justify-center">
        {!isVideoTalking ? (
            <motion.div 
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, filter: 'blur(5px)' }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex flex-col gap-4 items-center w-full"
            >
              <button 
                onClick={handleAccessBar}
                className="mt-6 w-full glass-button group relative overflow-hidden rounded-2xl py-5 transition-all text-sm font-bold tracking-[0.4em] uppercase hover:scale-[1.02] active:scale-95 bg-white/10 hover:bg-blue-500/40 border border-white/10 hover:border-blue-500/50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-sweep"></div>
                Access Bar
              </button>
            </motion.div>
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
                        Selamat Datang
                    </motion.h2>
                    
                    <motion.div 
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: '120px' }}
                      transition={{ delay: 1.2, duration: 0.8 }}
                      className="h-[2px] bg-gradient-to-r from-transparent via-white to-transparent my-8"
                    ></motion.div>
                </div>
            </motion.div>
        )}
      </div>
    </div>
  );
};

export default BartenderLandingPage;
