import React, { useEffect, useRef, useState } from 'react';
import * as deepar from 'deepar';
import { Camera, ChevronRight } from 'lucide-react';
import { PhotoboothSettings } from '../../../types';

interface CameraFXPageProps {
  pageConfig: any;
  settings: PhotoboothSettings;
  onNext: (data?: any) => void;
  onBack: () => void;
  onCapture?: (imageStr: string) => void;
}

export default function CameraFXPage({ pageConfig, settings, onNext, onBack, onCapture }: CameraFXPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deepARRef = useRef<deepar.DeepAR | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeEffectIndex, setActiveEffectIndex] = useState(0);

  useEffect(() => {
    let unmounted = false;

    const initDeepAR = async () => {
      if (!canvasRef.current) return;
      if (!pageConfig.deepArLicenseKey) {
        setErrorMsg("DeepAR License Key is missing. Please configure it in the Admin settings.");
        setIsInitializing(false);
        return;
      }

      try {
        deepARRef.current = await deepar.initialize({
          licenseKey: pageConfig.deepArLicenseKey,
          canvas: canvasRef.current,
          rootPath: "https://cdn.jsdelivr.net/npm/deepar/",
          effect: pageConfig.effects?.[0]?.url || undefined
        });

        if (!unmounted) {
          setIsInitializing(false);
          // start camera
          await deepARRef.current.startCamera();
        }
      } catch (error: any) {
        console.error("DeepAR Init Error:", error);
        if (!unmounted) {
          setErrorMsg(error.message || "Failed to initialize DeepAR");
          setIsInitializing(false);
        }
      }
    };

    initDeepAR();

    return () => {
      unmounted = true;
      if (deepARRef.current) {
        deepARRef.current.stopCamera();
        deepARRef.current.shutdown();
      }
    };
  }, [pageConfig.deepArLicenseKey]);

  const loadEffect = async (index: number) => {
    if (!deepARRef.current) return;
    const effectUrl = pageConfig.effects?.[index]?.url;
    if (effectUrl) {
      try {
        await deepARRef.current.switchEffect(effectUrl);
        setActiveEffectIndex(index);
      } catch (err) {
        console.error("Error switching effect", err);
      }
    }
  };

  const handleCapture = async () => {
    if (!deepARRef.current) return;
    try {
      const base64Image = await deepARRef.current.takeScreenshot();
      if (onCapture) {
        onCapture(base64Image);
      } else {
        onNext({ type: 'camera_fx_image', image: base64Image });
      }
    } catch (err) {
      console.error("Capture Error", err);
    }
  };

  return (
    <div className="w-full h-[100dvh] bg-black relative flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
      </div>

      {isInitializing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
          <div className="text-white text-sm tracking-widest font-bold uppercase animate-pulse">
            LOADING EXPERIENCE...
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-6">
          <div className="bg-red-500/20 border border-red-500 text-red-100 p-4 rounded-xl text-center max-w-md">
            <h3 className="font-bold mb-2">Could Not Start DeepAR</h3>
            <p className="text-sm opacity-80">{errorMsg}</p>
          </div>
        </div>
      )}

      <div className="absolute top-0 w-full p-6 z-20 flex justify-between items-start">
         <button onClick={onBack} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur border border-white/20 flex items-center justify-center text-white">
           <ChevronRight className="w-5 h-5 rotate-180" />
         </button>
         
         {pageConfig.instructionText && (
           <div className="px-4 py-2 bg-black/40 backdrop-blur border border-white/20 rounded-full text-white text-xs font-bold uppercase tracking-widest text-center mt-2 max-w-[60vw]">
             {pageConfig.instructionText}
           </div>
         )}
         
         {!pageConfig.allowCapture && (
           <button onClick={() => onNext()} className="px-6 py-3 rounded-full bg-[#bc13fe] text-white font-bold uppercase text-xs tracking-widest shadow-[0_0_15px_rgba(188,19,254,0.3)]">
             CONTINUE
           </button>
         )}
      </div>

      {(pageConfig.effects && pageConfig.effects.length > 1) && (
        <div className="absolute bottom-32 z-20 w-full px-6 flex gap-3 overflow-x-auto custom-scrollbar snap-x py-2">
          {pageConfig.effects.map((effect: any, idx: number) => (
             <button key={idx} onClick={() => loadEffect(idx)} className={`snap-center flex-shrink-0 px-4 py-2 rounded-full border text-xs font-bold whitespace-nowrap transition-colors ${activeEffectIndex === idx ? 'bg-[#bc13fe] border-[#bc13fe] text-white' : 'bg-black/50 border-white/20 text-gray-300 hover:bg-white/10'}`}>
               {effect.name || `Effect ${idx + 1}`}
             </button>
          ))}
        </div>
      )}

      {pageConfig.allowCapture && (
         <div className="absolute bottom-8 w-full flex justify-center z-20">
           <button onClick={handleCapture} className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md border-4 border-white flex items-center justify-center text-white hover:bg-white hover:text-black transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)]">
             <Camera className="w-8 h-8" />
           </button>
         </div>
      )}
    </div>
  );
}
