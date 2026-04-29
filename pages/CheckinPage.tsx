import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Maximize, FileSpreadsheet, X, Check } from 'lucide-react';
import { PhotoboothSettings } from '../types';
import { GoogleGenAI } from '@google/genai';

interface CheckinPageProps {
  settings: PhotoboothSettings;
  onExit?: () => void;
}

const CheckinPage: React.FC<CheckinPageProps> = ({ settings, onExit }) => {
  const [vipKode, setVipKode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [step, setStep] = useState<'input' | 'confirm' | 'greet'>('input');
  const [greetState, setGreetState] = useState<'preparing' | 'playing' | 'done'>('preparing');
  const [pendingGuest, setPendingGuest] = useState<{name: string, kode: string} | null>(null);
  const [isVideoTalking, setIsVideoTalking] = useState(false);
  
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

  const playGreetingSynthesis = async (name: string, _: string | undefined, voice: string = 'Kore', speed: number = 1.25) => {
    const greetingText = `Halo ${name}, selamat datang di acara tech data, silakan menikmati acara ini. Terima kasih.`;
    
    let audioReadyToPlay = async () => {};
    let ttsSuccess = false;
    
    try {
      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        let geminiVoice = voice;
        if (!['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'].includes(geminiVoice)) {
           geminiVoice = 'Kore';
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: greetingText }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: geminiVoice as any },
                },
            },
          },
        });

        const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('audio/'));
        const base64Audio = audioPart?.inlineData?.data;

        if (base64Audio) {
           const binary = atob(base64Audio);
           const bytes = new Uint8Array(binary.length);
           for (let i = 0; i < binary.length; i++) {
               bytes[i] = binary.charCodeAt(i);
           }
           
           const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
           const int16Array = new Int16Array(bytes.buffer);
           const audioBuffer = audioCtx.createBuffer(1, int16Array.length, 24000);
           const channelData = audioBuffer.getChannelData(0);
           for (let i = 0; i < int16Array.length; i++) {
             channelData[i] = int16Array[i] / 32768;
           }
           
           ttsSuccess = true;
           audioReadyToPlay = async () => {
             const source = audioCtx.createBufferSource();
             source.buffer = audioBuffer;
             source.playbackRate.value = speed;
             source.connect(audioCtx.destination);
             
             if (audioCtx.state === 'suspended') {
               await audioCtx.resume();
             }
             
             return new Promise<void>((resolve) => {
               source.onended = () => resolve();
               source.start(0);
             });
           };
        }
      }
    } catch (err) {
      console.error("Gemini TTS Err:", err);
    }

    if (!ttsSuccess) {
      const utterance = new SpeechSynthesisUtterance(greetingText);
      utterance.lang = 'id-ID';
      utterance.rate = speed ?? 0.9; 
      
      let voices = window.speechSynthesis.getVoices();
      let indoVoice = voices.find(v => v.lang.includes('id'));
      if(indoVoice) utterance.voice = indoVoice;

      audioReadyToPlay = async () => {
         return new Promise<void>((resolve) => {
            utterance.onend = () => resolve();
            window.speechSynthesis.speak(utterance);
         });
      };
    }
    
    // Play both synchronously
    setGreetState('playing');
    setIsVideoTalking(true);

    let videoPromise = Promise.resolve();
    if (talkingVideoRef.current) {
        talkingVideoRef.current.playbackRate = speed;
        talkingVideoRef.current.currentTime = 0;
        talkingVideoRef.current.muted = true;
        talkingVideoRef.current.play().catch(e => console.error("Video play err:", e));
        
        videoPromise = new Promise<void>((resolve) => {
             // Handle video ended
             if (talkingVideoRef.current) talkingVideoRef.current.onended = () => resolve();
        });
    } else {
        videoPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    }
    
    await Promise.all([audioReadyToPlay(), videoPromise]);
    
    setIsVideoTalking(false);
    setGreetState('done');
    
    // Auto return after 5 seconds
    setTimeout(() => {
        setStep(prev => {
           if (prev === 'greet') {
              setVipKode('');
              return 'input';
           }
           return prev;
        });
    }, 5000);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipKode.trim() || loading) return;

    setLoading(true);
    setError(null);

    const searchQuery = vipKode.trim();

    try {
      let scriptUrl = "https://script.google.com/macros/s/AKfycbydPxUH77EAIf79llD0-jPQJQHssx72km8P4CVUDX1Nvz96US4yg8i1WUWdeVwyFMsW/exec";
      if (settings.vipAppsScriptUrl && !settings.vipAppsScriptUrl.match(/AKfycbwWZV9|AKfycbw5Z|AKfycbxH9|AKfycbxJI/)) {
         scriptUrl = settings.vipAppsScriptUrl;
      }
      
      let data = null;

      // FIRST: Try client-side fuzzy search using getRecent which holds allData
      try {
         const allDataRes = await fetch(`${scriptUrl}?action=getRecent&t=${Date.now()}`);
         const allDataText = await allDataRes.text();
         const allDataJson = JSON.parse(allDataText);
         
         if (allDataJson && allDataJson.success && allDataJson.allData) {
             const lowerQuery = searchQuery.toLowerCase();
             const queryWords = lowerQuery.split(/\s+/);
             const found = allDataJson.allData.find((g: any) => {
                const gId = String(g.id).toLowerCase();
                const gName = String(g.name).toLowerCase();
                
                if (gId === lowerQuery || gId.includes(lowerQuery)) return true;
                
                // Allow matching if all provided words exist anywhere in the name
                return queryWords.every(word => gName.includes(word));
             });
             
             if (found) {
                 data = {
                    success: true,
                    guestName: found.name,
                    kode: found.id
                 };
             }
         }
      } catch (err) {
         console.error("Client side search via getRecent failed", err);
      }

      // SECOND: Fallback to verify action just in case
      if (!data) {
        const verifyUrl = `${scriptUrl}?action=verify&kode=${encodeURIComponent(searchQuery)}`;
        const res = await fetch(verifyUrl);
        const text = await res.text();
        try {
           data = JSON.parse(text);
        } catch(e) {
           throw new Error("Invalid response format from server");
        }
      }

      if (data && data.success && data.guestName) {
        setPendingGuest({
           name: data.guestName,
           kode: data.kode || searchQuery
        });
        setStep('confirm');
      } else {
        setError('Data tidak ditemukan. Silakan cek kembali Nama atau Kode Anda.');
      }
    } catch (e: any) {
       console.error("Search failed", e);
       setError(e.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmYes = async () => {
    if (!pendingGuest) return;
    setLoading(true);
    
    let scriptUrl = "https://script.google.com/macros/s/AKfycbydPxUH77EAIf79llD0-jPQJQHssx72km8P4CVUDX1Nvz96US4yg8i1WUWdeVwyFMsW/exec";
    if (settings.vipAppsScriptUrl && !settings.vipAppsScriptUrl.match(/AKfycbwWZV9|AKfycbw5Z|AKfycbxH9|AKfycbxJI/)) {
       scriptUrl = settings.vipAppsScriptUrl;
    }
    
    // Background Ping update
    fetch(`${scriptUrl}?action=update&target=login&kode=${encodeURIComponent(pendingGuest.kode)}&status=sudah`, {
      method: 'GET',
      mode: 'no-cors'
    }).catch(err => console.error("Ping Error:", err));

    const gName = pendingGuest.name.split(' ')[0]; // First name
    const greetingText = `Halo ${pendingGuest.name}`;
    
    let audioCtx: AudioContext | null = null;
    let audioBuffer: AudioBuffer | null = null;
    let fallbackUtterance: SpeechSynthesisUtterance | null = null;
    const voice = settings.vipTtsVoice || 'Kore';
    const speed = settings.vipTtsSpeed || 1.25;

    try {
      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        let geminiVoice = voice;
        if (!['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'].includes(geminiVoice)) {
           geminiVoice = 'Kore';
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: greetingText }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: geminiVoice as any },
                },
            },
          },
        });

        const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('audio/'));
        const base64Audio = audioPart?.inlineData?.data;

        if (base64Audio) {
           const binary = atob(base64Audio);
           const bytes = new Uint8Array(binary.length);
           for (let i = 0; i < binary.length; i++) {
               bytes[i] = binary.charCodeAt(i);
           }
           
           audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
           const int16Array = new Int16Array(bytes.buffer);
           audioBuffer = audioCtx.createBuffer(1, int16Array.length, 24000);
           const channelData = audioBuffer.getChannelData(0);
           for (let i = 0; i < int16Array.length; i++) {
             channelData[i] = int16Array[i] / 32768;
           }
        }
      }
    } catch (err) {
      console.error("Gemini TTS Err:", err);
    }

    if (!audioBuffer) {
      fallbackUtterance = new SpeechSynthesisUtterance(greetingText);
      fallbackUtterance.lang = 'id-ID';
      fallbackUtterance.rate = speed ?? 0.9; 
      
      let voices = window.speechSynthesis.getVoices();
      let indoVoice = voices.find(v => v.lang.includes('id'));
      if(indoVoice) fallbackUtterance.voice = indoVoice;
    }

    setLoading(false);
    setStep('greet');
    setGreetState('playing');

    if (audioBuffer && audioCtx) {
       const source = audioCtx.createBufferSource();
       source.buffer = audioBuffer;
       source.playbackRate.value = speed;
       source.connect(audioCtx.destination);
       
       if (audioCtx.state === 'suspended') {
         await audioCtx.resume();
       }
       
       await new Promise<void>((resolve) => {
         source.onended = () => resolve();
         source.start(0);
       });
    } else if (fallbackUtterance) {
       await new Promise<void>((resolve) => {
          fallbackUtterance!.onend = () => resolve();
          window.speechSynthesis.speak(fallbackUtterance!);
       });
    }

    setIsVideoTalking(true);
    if (talkingVideoRef.current) {
        talkingVideoRef.current.playbackRate = 1.0;
        talkingVideoRef.current.currentTime = 0;
        talkingVideoRef.current.muted = false;
        await talkingVideoRef.current.play().catch(e => console.error("Video play err:", e));
        
        await new Promise<void>((resolve) => {
             if (talkingVideoRef.current) talkingVideoRef.current.onended = () => resolve();
        });
    } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    }
    
    setIsVideoTalking(false);
    setGreetState('done');
    
    // Auto return after 5 seconds
    setTimeout(() => {
        setStep(prev => {
           if (prev === 'greet') {
              setVipKode('');
              return 'input';
           }
           return prev;
        });
    }, 5000);
  };

  const handleConfirmNo = () => {
    setPendingGuest(null);
    setStep('input');
    setVipKode('');
  };

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-gray-950 font-sans">
        
       {/* Background */}
       <div className="absolute inset-0 z-0">
          {settings.backgroundImage ? (
             <img src={settings.backgroundImage} className="w-full h-full object-cover opacity-30 blur-sm" alt="bg" />
          ) : (
             <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-[#120024]"></div>
          )}
          <div className="absolute inset-0 bg-black/60 z-10"></div>
          
          {/* Avatar Videos */}
          {(settings.vipVideoIdleUrl || settings.vipVideoTalkingUrl) && (
             <>
                <video 
                  src={settings.vipVideoIdleUrl || '/placeholder-idle.mp4'} 
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out blur-sm lg:blur-none ${isVideoTalking ? 'opacity-0' : 'opacity-100'}`}
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                />
                
                <video 
                  ref={talkingVideoRef}
                  src={settings.vipVideoTalkingUrl || '/placeholder-talking.mp4'} 
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out blur-sm lg:blur-none ${isVideoTalking ? 'opacity-100' : 'opacity-0'}`}
                  playsInline 
                  muted
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20 z-10 lg:hidden" />
                {/* Desktop layout gradient */}
                <div className="absolute inset-0 top-auto bottom-0 h-1/2 bg-gradient-to-t from-black via-black/80 to-transparent z-10 hidden lg:block" />
             </>
          )}
       </div>

       {/* Logo */}
       <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50">
          <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/TECH%20DATA/LOGO%20TECH%20DATA.png" alt="Tech Data" className="h-[80px] md:h-[120px] object-contain transition-all" />
       </div>

       {/* Controls */}
       <div className="absolute top-4 right-4 z-50 flex gap-4">
         <button onClick={toggleFullScreen} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-colors border border-white/20">
            <Maximize className="w-4 h-4" />
         </button>
         {onExit && (
           <button onClick={onExit} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-colors border border-white/20 flex items-center justify-center gap-2">
               Settings
           </button>
         )}
       </div>

       <div className="relative z-20 flex-1 flex flex-col justify-center items-center p-6 w-full max-w-7xl mx-auto h-screen text-center">
          
          <div className="flex flex-col items-center w-full">
             
             {step !== 'greet' && (
                 <div className="mb-12 flex flex-col items-center">
                   <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-6 border border-green-500/40 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                       <FileSpreadsheet className="w-8 h-8 text-green-400" />
                   </div>
                   <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-widest mb-4">
                      {settings.eventName || "Registration"}
                   </h1>
                   <p className="text-gray-400 max-w-md text-sm md:text-base">
                      {step === 'input' 
                         ? "Welcome, please enter your Unique ID or search by your name to check-in."
                         : "Please verify your information below."}
                   </p>
                 </div>
             )}

             <AnimatePresence mode="wait">
               {step === 'input' && (
                   <motion.div 
                     key="input-form"
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -20 }}
                     className="w-full max-w-lg p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden"
                   >
                     <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-green-500/20 blur-[100px] rounded-full pointer-events-none"></div>

                     <form onSubmit={handleSearch} className="relative z-10 flex flex-col gap-6">
                        <div className="relative">
                          <label className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold mb-2 block">
                             Unique Code or Name
                          </label>
                          <input 
                             type="text"
                             value={vipKode}
                             onChange={(e) => {
                                 setVipKode(e.target.value.toUpperCase());
                                 setError(null);
                             }}
                             placeholder="E.g., 69GG or JOHN DOE"
                             className="w-full bg-white/5 border border-white/20 rounded-2xl px-6 py-5 text-center text-xl md:text-2xl font-heading text-white tracking-[0.2em] focus:border-green-400 focus:bg-white/10 outline-none transition-all shadow-xl uppercase"
                             autoComplete="off"
                             disabled={loading}
                             autoFocus
                          />
                          {error && (
                             <div className="text-red-400 text-xs tracking-widest mt-3 text-center border border-red-500/30 bg-red-500/10 py-2 rounded-lg">
                                {error}
                             </div>
                          )}
                        </div>

                        <button 
                          type="submit" 
                          disabled={loading || !vipKode}
                          className="w-full relative overflow-hidden rounded-2xl py-5 transition-all text-sm font-bold tracking-[0.4em] justify-center items-center flex gap-3
                            bg-gradient-to-r from-transparent via-green-500/20 to-transparent border border-green-500/50 text-green-400 uppercase
                            hover:bg-green-500/30 hover:border-green-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group
                          "
                        >
                          {loading ? (
                            <span className="flex items-center gap-2 animate-pulse">
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 
                              Searching
                            </span>
                          ) : (
                            <>
                              Check data <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </button>
                     </form>
                   </motion.div>
               )}

               {step === 'confirm' && pendingGuest && (
                 <motion.div 
                   key="confirm-view"
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.95 }}
                   className="w-full max-w-lg p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden text-center"
                 >
                   <p className="text-gray-400 text-xs uppercase tracking-[0.3em] font-bold mb-2">Confirm Identity</p>
                   <h2 className="text-3xl md:text-4xl text-white font-black tracking-wider uppercase mb-8">
                     {pendingGuest.name}
                   </h2>

                   <div className="flex gap-4">
                      <button 
                         onClick={handleConfirmNo}
                         disabled={loading}
                         className="flex-1 py-4 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-xl text-white text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <X className="w-4 h-4 text-red-400" /> No, Re-enter
                      </button>
                      <button 
                         onClick={handleConfirmYes}
                         disabled={loading}
                         className="flex-1 py-4 bg-green-500/20 border border-green-500/50 hover:bg-green-500/30 hover:border-green-400 rounded-xl text-green-400 text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                         {loading ? 'Menyiapkan...' : <><Check className="w-4 h-4" /> Check In</>}
                      </button>
                   </div>
                 </motion.div>
               )}

               {step === 'greet' && pendingGuest && (
                 <motion.div 
                   key="greet-view"
                   initial={{ opacity: 0, x: -50 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0 }}
                   className="w-full"
                 >
                    <div className="flex items-center gap-4 mb-4">
                       <div className="w-2 h-12 bg-green-400 rounded-full animate-pulse" />
                       <h2 className="text-4xl md:text-6xl text-white font-black tracking-widest uppercase">
                         Access <span className="text-green-400">Granted</span>
                       </h2>
                    </div>
                    <p className="text-xl text-white/70 font-mono tracking-widest uppercase pl-6 mb-8 drop-shadow-md">
                       Selamat datang, <b className="text-white">{pendingGuest.name}</b>
                    </p>
                    
                    {greetState === 'preparing' && (
                       <div className="flex items-center gap-4 text-blue-400/80 text-sm font-mono pl-6">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                          </span>
                          Menyiapkan AI Assistant...
                       </div>
                    )}

                    {greetState === 'playing' && (
                       <div className="flex items-center gap-4 text-green-400/80 text-sm font-mono pl-6">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                          </span>
                          AI Assistant sedang berbicara...
                       </div>
                    )}

                    {greetState === 'done' && (
                       <div className="pl-6 mt-8">
                          <button 
                             onClick={() => { setStep('input'); setVipKode(''); }}
                             className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white font-mono uppercase tracking-widest text-sm transition-all shadow-lg hover:scale-105"
                          >
                             Kembali
                          </button>
                       </div>
                    )}
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
       </div>

    </div>
  );
};

export default CheckinPage;
