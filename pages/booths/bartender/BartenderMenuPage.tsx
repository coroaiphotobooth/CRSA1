import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { PhotoboothSettings, BartenderMenuItem } from '../../../types';
import { Wine, Sparkles } from 'lucide-react';

// Touch file
console.log('Bartender Menu Init');

interface BartenderMenuPageProps {
  settings: PhotoboothSettings;
  guestName: string;
  guestKode: string;
  onBack: () => void;
}

const DEFAULT_DRINK_MENU: BartenderMenuItem[] = [
  { id: 'cyber_mojito', name: 'Cyber Mojito', description: 'Mint, Lime, Neon Blue Curacao, Soda' },
  { id: 'galactic_coffee', name: 'Galactic Coffee', description: 'Cold Brew, Vanilla, Stardust Choco' },
  { id: 'neon_margarita', name: 'Neon Margarita', description: 'Tequila, Triple Sec, Lime, Salt Rim' },
];

const BartenderMenuPage: React.FC<BartenderMenuPageProps> = ({ settings, guestName, guestKode, onBack }) => {
  const [viewState, setViewState] = useState<'CHOICE' | 'MENU_LIST' | 'CAMERA' | 'ANALYSING' | 'RESULT' | 'PROCESSING' | 'DONE'>('CHOICE');
  const [selectedDrink, setSelectedDrink] = useState<string | null>(null);
  const [aiText, setAiText] = useState('');
  const [displayedText, setDisplayedText] = useState('');

  const currentMenu = settings.bartenderMenu && settings.bartenderMenu.length > 0 ? settings.bartenderMenu : DEFAULT_DRINK_MENU;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    setViewState('CAMERA');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access denied", err);
      // Fallback if no camera
      handleOmakaseFallback();
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    stopCamera();
    setViewState('ANALYSING');

    const openAiKey = settings.vipOpenAiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY;

    try {
       let description = "";
       let drinkName = currentMenu[Math.floor(Math.random() * currentMenu.length)].name;

       if (geminiKey) {
           const { GoogleGenAI } = await import('@google/genai');
           const ai = new GoogleGenAI({ apiKey: geminiKey });
           
           const menuListStr = currentMenu.map(m => m.name).join(', ');

           const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: [{
                parts: [
                   { text: `Analyze the person's outfit in this image. Describe their clothing style, colors, and accessories (hat, glasses, etc) in 1 short sentence in Indonesian. Then out of this menu list: [${menuListStr}], pick the most suitable drink based on their vibe.` },
                   { inlineData: { data: base64Image, mimeType: 'image/jpeg' } }
                ]
             }]
           });
           
           const result = response.text || "";
           // We will construct the exact prompt sentence required:
           // "di lihat dari penampilan kamu yang (description), sepertinya cocok dengan minuman (drinkName)"
           
           // We can just ask Gemini to output exactly that format in a separate call or parse it.
           // Let's do a second simple call or just ask for JSON in the first to be safe,
           // but we can parse it roughly or just ask Gemini to output the exact sentence.
           // Let's refine the text request.
       }
       
       // Fallback/refinement
       if (geminiKey) {
           const { GoogleGenAI } = await import('@google/genai');
           const ai = new GoogleGenAI({ apiKey: geminiKey });
           const menuListStr = currentMenu.map(m => m.name).join(', ');
           const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: [{
                parts: [
                   { text: `Analyze the person's outfit in this image (colors, style, glasses, hats). Then, choose exactly one drink from this list: [${menuListStr}]. Output EXACTLY a JSON string like: {"outfit": "mengenakan kemeja kotak-kotak biru dan kacamata hitam", "drink": "Cyber Mojito"}` },
                   { inlineData: { data: base64Image, mimeType: 'image/jpeg' } }
                ]
             }],
             config: { responseMimeType: "application/json" }
           });
           
           try {
               const j = JSON.parse(response.text || "{}");
               if (j.outfit && j.drink) {
                   description = j.outfit;
                   drinkName = j.drink;
               }
           } catch(e) {}
       }
       
       if (!description) {
           description = "tampil elegan hari ini";
       }

       const finalText = `Di lihat dari penampilan kamu yang ${description}, sepertinya cocok dengan minuman ${drinkName}.`;
       setAiText(finalText);
       setSelectedDrink(drinkName + " (AI Special)");
       
       setViewState('RESULT');
       playResultTTS(finalText);
       animateTyping(finalText);

    } catch(e) {
       console.error("AI Analysis failed", e);
       handleOmakaseFallback();
    }
  };

  const animateTyping = (text: string) => {
      setDisplayedText('');
      let i = 0;
      const interval = setInterval(() => {
         setDisplayedText(text.substring(0, i+1));
         i++;
         if (i >= text.length) clearInterval(interval);
      }, 50);
  };

  const playResultTTS = async (text: string) => {
    let ttsSuccess = false;
    const speed = settings.vipTtsSpeed ?? 1.1;

    try {
      if (process.env.GEMINI_API_KEY) {
        // Dynamic import to avoid missing dependencies if they load late
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        let geminiVoice = settings.vipTtsVoice || 'Kore';
        if (!['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'].includes(geminiVoice)) {
           geminiVoice = 'Kore';
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text }] }],
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
           const source = audioCtx.createBufferSource();
           source.buffer = audioBuffer;
           source.playbackRate.value = speed;
           source.connect(audioCtx.destination);
           
           if (audioCtx.state === 'suspended') {
             await audioCtx.resume();
           }
           
           source.start(0);
        }
      }
    } catch (err) {
      console.error("Gemini TTS Err:", err);
    }

    if (ttsSuccess) return;

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
            input: text,
            voice: settings.vipTtsVoice || 'nova',
            speed: speed,
          })
        });
        if (response.ok) {
           const blob = await response.blob();
           const url = URL.createObjectURL(blob);
           const audio = new Audio(url);
           audio.playbackRate = speed;
           audio.play().catch(e => {});
           return;
        }
      } catch (err) {}
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = settings.vipTtsSpeed ?? 0.9; 
    let voices = window.speechSynthesis.getVoices();
    let indoVoice = voices.find(v => v.lang.includes('id'));
    if(indoVoice) utterance.voice = indoVoice;
    window.speechSynthesis.speak(utterance);
  };

  const handleOmakaseFallback = () => {
    const randomDrink = currentMenu[Math.floor(Math.random() * currentMenu.length)];
    setSelectedDrink(randomDrink.name + " (AI Special)");
    const finalText = `Di lihat dari penampilan kamu, sepertinya cocok dengan minuman ${randomDrink.name}.`;
    setAiText(finalText);
    setViewState('RESULT');
    playResultTTS(finalText);
    animateTyping(finalText);
  };

  const confirmOrder = async () => {
    setViewState('PROCESSING');
    if (!selectedDrink) return;

    try {
       const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
       let scriptUrl = "https://script.google.com/macros/s/AKfycbydPxUH77EAIf79llD0-jPQJQHssx72km8P4CVUDX1Nvz96US4yg8i1WUWdeVwyFMsW/exec";
       if (settings.vipAppsScriptUrl && !settings.vipAppsScriptUrl.match(/AKfycbwWZV9|AKfycbw5Z|AKfycbxH9|AKfycbxJI/)) {
          scriptUrl = settings.vipAppsScriptUrl;
       }
       
       // Log to Apps Script for legacy support
       await fetch(`${scriptUrl}?action=update&target=minuman&kode=${encodeURIComponent(orderNumber)}&status=${encodeURIComponent(selectedDrink)}`, {
         method: 'GET',
         mode: 'no-cors'
       });

       // Also save to Supabase "sessions" table for local Bartender Admin
       const { supabase } = await import('../../../lib/supabase');
       const pathparts = window.location.pathname.split('/');
       const eventId = pathparts[pathparts.length - 1] || pathparts[pathparts.length - 2];
       if (eventId && eventId.length > 5) {
          await supabase.from('sessions').insert([{
             event_id: eventId,
             guest_name: orderNumber,
             guest_message: selectedDrink,
             is_posted_to_wall: false
          }]);
       }

       setSelectedDrink(`${selectedDrink} (#${orderNumber})`);

       setTimeout(() => {
         setViewState('DONE');
       }, 2000);
    } catch (e) {
       console.error(e);
       setViewState('DONE');
    }
  };

  const handleOrderDrink = async (drinkName: string) => {
    setSelectedDrink(drinkName);
    setViewState('PROCESSING');

    try {
      const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      let scriptUrl = "https://script.google.com/macros/s/AKfycbydPxUH77EAIf79llD0-jPQJQHssx72km8P4CVUDX1Nvz96US4yg8i1WUWdeVwyFMsW/exec";
      if (settings.vipAppsScriptUrl && !settings.vipAppsScriptUrl.match(/AKfycbwWZV9|AKfycbw5Z|AKfycbxH9|AKfycbxJI/)) {
         scriptUrl = settings.vipAppsScriptUrl;
      }
      
      await fetch(`${scriptUrl}?action=update&target=minuman&kode=${encodeURIComponent(orderNumber)}&status=${encodeURIComponent(drinkName)}`, {
        method: 'GET',
        mode: 'no-cors'
      });

      const { supabase } = await import('../../../lib/supabase');
      const pathparts = window.location.pathname.split('/');
      const eventId = pathparts[pathparts.length - 1] || pathparts[pathparts.length - 2];
      if (eventId && eventId.length > 5) {
         await supabase.from('sessions').insert([{
            event_id: eventId,
            guest_name: orderNumber,
            guest_message: drinkName,
            is_posted_to_wall: false
         }]);
      }

      setSelectedDrink(`${drinkName} (#${orderNumber})`);

      setTimeout(() => {
        setViewState('DONE');
      }, 1500);
    } catch (e) {
      console.error(e);
      setViewState('DONE');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen relative p-6">
      <div className="absolute inset-0 bg-black z-0">
        <video 
          src={settings.vipVideoIdleUrl || '/placeholder-idle.mp4'} 
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen"
          autoPlay loop muted playsInline 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40 z-10" />
      </div>

      <div className="relative z-20 w-full max-w-4xl mx-auto flex flex-col items-center">
        
        {viewState === 'CHOICE' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col w-full gap-8 items-center"
          >
            <h2 className="text-3xl md:text-5xl font-heading font-bold text-white text-center uppercase tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
              Pesanan Minuman Anda
            </h2>
            <p className="text-gray-300 font-mono tracking-widest text-center max-w-lg mb-8 uppercase text-sm">
              Silakan pilih sendiri dari menu kami, atau biarkan AI meracikkan minuman khusus untuk Anda.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
              <button 
                onClick={() => setViewState('MENU_LIST')}
                className="group relative flex flex-col items-center justify-center p-10 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/20 hover:border-blue-400 rounded-3xl transition-all hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                <Wine className="w-16 h-16 text-blue-400 mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold font-heading tracking-widest uppercase mb-2">Lihat Menu</h3>
                <p className="text-xs text-gray-400 font-mono tracking-wider">Pilih minuman secara manual</p>
              </button>

              <button 
                onClick={startCamera}
                className="group relative flex flex-col items-center justify-center p-10 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/20 hover:border-[#bc13fe] rounded-3xl transition-all hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#bc13fe]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                <Sparkles className="w-16 h-16 text-[#bc13fe] mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold font-heading tracking-widest uppercase mb-2">Pilihkan Saya!</h3>
                <p className="text-xs text-gray-400 font-mono tracking-wider">Omakase racikan AI khusus</p>
              </button>
            </div>
          </motion.div>
        )}

        {viewState === 'CAMERA' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col w-full max-w-2xl items-center relative"
          >
            <div className="w-full aspect-[4/3] bg-black rounded-3xl overflow-hidden relative border-4 border-blue-500/50">
               <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
               <canvas ref={canvasRef} className="hidden" />
               
               {/* Overlay HUD */}
               <div className="absolute inset-0 pointer-events-none border-[1px] border-blue-400/30">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 border-2 border-blue-400/50 rounded-full border-dashed animate-[spin_10s_linear_infinite]" />
               </div>
            </div>
            
            <p className="text-blue-200 mt-6 mb-8 font-mono tracking-widest text-center uppercase text-sm">
               Silakan berdiri di depan kamera
            </p>
            
            <button 
               onClick={captureAndAnalyze}
               className="w-20 h-20 bg-white/20 hover:bg-white rounded-full flex items-center justify-center border-4 border-white/40 transition-all transform hover:scale-110 shadow-xl"
            >
               <div className="w-16 h-16 bg-blue-500 rounded-full" />
            </button>
            
            <button 
                onClick={() => { stopCamera(); setViewState('CHOICE'); }}
                className="mt-6 text-xs font-mono uppercase tracking-widest text-gray-400 hover:text-white"
            >
                Batal
            </button>
          </motion.div>
        )}

        {viewState === 'ANALYSING' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center p-12 bg-black/60 backdrop-blur-xl border border-[#bc13fe]/30 rounded-3xl text-center"
          >
            <Sparkles className="w-16 h-16 text-[#bc13fe] mb-6 animate-pulse" />
            <h3 className="text-white font-mono tracking-widest uppercase mb-4">AI Sedang Menganalisa Penampilanmu...</h3>
            <div className="w-full max-w-[200px] h-1 bg-[#bc13fe]/20 rounded-full overflow-hidden">
               <div className="h-full bg-[#bc13fe] w-1/2 animate-pulse rounded-full"></div>
            </div>
          </motion.div>
        )}

        {viewState === 'RESULT' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center p-12 bg-gradient-to-br from-black/80 to-blue-900/30 backdrop-blur-xl border border-[#bc13fe]/50 rounded-3xl max-w-2xl"
          >
            <Sparkles className="w-12 h-12 text-[#bc13fe] mb-6 drop-shadow-[0_0_15px_rgba(188,19,254,0.8)]" />
            <h2 className="text-2xl font-heading font-black uppercase tracking-widest mb-6 text-white leading-relaxed min-h-[4rem]">
              {displayedText}
            </h2>
            
            <div className="flex gap-4 mt-8">
               <button 
                  onClick={confirmOrder}
                  className="px-8 py-3 bg-[#bc13fe]/20 hover:bg-[#bc13fe]/40 border border-[#bc13fe]/50 rounded-full font-bold uppercase tracking-widest transition-all text-white shadow-[0_0_20px_rgba(188,19,254,0.3)] hover:scale-105"
               >
                  Pesan Ini
               </button>
               <button 
                  onClick={() => setViewState('CHOICE')}
                  className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/20 rounded-full font-mono text-xs uppercase tracking-widest transition-all text-gray-300"
               >
                  Tidak, Pilih Sendiri
               </button>
            </div>
          </motion.div>
        )}

        {viewState === 'MENU_LIST' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col w-full max-w-3xl"
          >
            <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-4">
              <h2 className="text-3xl font-heading font-bold uppercase tracking-widest text-blue-400">Daftar Menu</h2>
              <button 
                onClick={() => setViewState('CHOICE')}
                className="text-xs font-mono uppercase tracking-widest text-gray-400 hover:text-white"
              >
                ← Kembali
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentMenu.map((drink) => (
                <button
                  key={drink.id}
                  onClick={() => handleOrderDrink(drink.name)}
                  className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-blue-400 p-6 rounded-2xl flex flex-col text-left transition-all hover:bg-white/10 relative overflow-hidden group"
                >
                  {drink.imageUrl && (
                    <div className="absolute inset-x-0 top-0 h-32 opacity-30 group-hover:opacity-50 transition-opacity">
                      <img src={drink.imageUrl} alt={drink.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent"></div>
                    </div>
                  )}
                  <div className={`relative z-10 ${drink.imageUrl ? 'pt-24' : ''}`}>
                    <h3 className="font-heading font-bold text-lg mb-2 uppercase tracking-wide text-white">{drink.name}</h3>
                    <p className="text-xs font-mono text-gray-400 leading-relaxed mb-6">{drink.description}</p>
                    <span className="mt-auto text-[10px] font-mono tracking-widest uppercase text-blue-400">Pesan →</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {viewState === 'PROCESSING' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center p-12 bg-black/60 backdrop-blur-xl border border-blue-500/30 rounded-3xl"
          >
            <div className="w-16 h-16 border-4 border-t-blue-500 border-white/10 rounded-full animate-spin mb-6"></div>
            <h3 className="text-white font-mono tracking-widest uppercase">Sedang Meracik</h3>
            <p className="text-blue-400 text-xs mt-2 font-mono uppercase opacity-70">Mohon tunggu sebentar...</p>
          </motion.div>
        )}

        {viewState === 'DONE' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center p-12 bg-blue-900/20 backdrop-blur-xl border border-blue-500/50 rounded-3xl"
          >
            <Wine className="w-20 h-20 text-blue-400 mb-6 drop-shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
            <h2 className="text-3xl font-heading font-black uppercase tracking-widest mb-4">Pesanan Selesai!</h2>
            <p className="text-gray-300 font-mono text-sm tracking-wider mb-2">
              Bartender AI sedang menyiapkan:
            </p>
            <p className="text-xl font-bold font-heading text-white uppercase tracking-widest px-6 py-3 bg-white/10 border border-white/20 rounded-xl mt-4 mb-10">
              {selectedDrink}
            </p>
            
            <button 
              onClick={onBack}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/30 rounded-full font-mono text-xs uppercase tracking-widest transition-all"
            >
              Selesai & Keluar
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default BartenderMenuPage;
