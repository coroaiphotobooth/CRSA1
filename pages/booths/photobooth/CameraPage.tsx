
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AspectRatio, PhotoboothSettings } from '../../../types';
import { useWebViewCamera } from '../../../hooks/useWebViewCamera';
import { getGoogleDriveDirectLink } from '../../../lib/imageUtils';

interface CameraPageProps {
  onCapture: (image: string) => void;
  onGenerate: () => void;
  onBack: () => void;
  capturedImage: string | null;
  orientation: 'portrait' | 'landscape';
  cameraRotation?: number; // 0, 90, 180, 270
  aspectRatio?: AspectRatio; // '9:16' | '16:9' etc
  settings?: PhotoboothSettings; // New Prop for accessing settings
  onUpdateSettings?: (settings: PhotoboothSettings) => void; // New Prop for updating model
}

const CameraPage: React.FC<CameraPageProps> = ({ 
    onCapture, 
    onGenerate, 
    onBack, 
    capturedImage, 
    orientation, 
    cameraRotation = 0,
    aspectRatio = '9:16',
    settings,
    onUpdateSettings
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null); // Use Ref for persistent stream access
  
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoRatio, setVideoRatio] = useState<number>(16/9);
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fallbackToWebcam, setFallbackToWebcam] = useState(false);

  const {
    isWrapper,
    isConnected: isDslrConnected,
    liveViewFrame,
    connectCamera: connectDslrCamera,
    capturePhoto: captureDslrPhoto,
    disconnectCamera: disconnectDslrCamera
  } = useWebViewCamera();

  // --- CAMERA CONTROL FUNCTIONS ---

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      console.log("Stopping Camera Stream...");
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        streamRef.current?.removeTrack(track);
      });
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    setIsStreaming(false);
    setIsVideoReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) stopCamera();
    setCameraError(null);
    setIsVideoReady(false);

    if (settings?.useDslr && isWrapper && !fallbackToWebcam) {
      try {
        if (!isDslrConnected && settings.dslrCameraId) {
          await connectDslrCamera('canon', settings.dslrCameraId);
        }
        setIsVideoReady(true);
        setIsStreaming(true);
        return;
      } catch (err: any) {
        console.error("DSLR init failed, falling back", err);
        setFallbackToWebcam(true);
        // Will continue to webcam logic below
      }
    }

    try {
      console.log("Starting Camera...");
      // Relaxed constraints for better compatibility and to prevent native sensor cropping
      // Request high resolution matching the device's longest dimension.
      // By not specifying the shorter dimension, we prevent iOS Safari from 
      // forcing a landscape or square crop on a portrait device.
      const isPortrait = window.innerHeight > window.innerWidth;
      
      const constraints: MediaStreamConstraints = { 
        audio: false,
        video: settings?.selectedCameraId ? {
          deviceId: { exact: settings.selectedCameraId },
          ...(isPortrait ? { height: { ideal: 1920 } } : { width: { ideal: 1920 } })
        } : { 
          facingMode: 'user',
          ...(isPortrait ? { height: { ideal: 1920 } } : { width: { ideal: 1920 } })
        } 
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
            console.log("Video Metadata Loaded");
            if (videoRef.current) {
                const w = videoRef.current.videoWidth;
                const h = videoRef.current.videoHeight;
                if (w && h) setVideoRatio(w / h);
            }
            setIsVideoReady(true);
            videoRef.current?.play().catch(e => console.warn("Play error:", e));
        };
      }
      setIsStreaming(true);
    } catch (err: any) {
      console.error("Camera Setup Error:", err);
      // Fallback: Try basic constraints if HD fails
      try {
          console.log("Retrying with basic constraints...");
          const fallbackConstraints: MediaStreamConstraints = {
            audio: false,
            video: settings?.selectedCameraId ? { deviceId: { exact: settings.selectedCameraId } } : true
          };
          const basicStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          streamRef.current = basicStream;
          if (videoRef.current) {
             videoRef.current.srcObject = basicStream;
             videoRef.current.onloadedmetadata = () => {
                setIsVideoReady(true);
                videoRef.current?.play();
             };
          }
          setIsStreaming(true);
      } catch (fallbackErr) {
          let msg = "Failed to access camera.";
          if (err.name === 'NotAllowedError') msg = "Permission denied. Please allow camera access.";
          else if (err.name === 'NotFoundError') msg = "No camera device found.";
          else if (err.name === 'NotReadableError') msg = "Camera is busy or being used by another app.";
          setCameraError(msg);
      }
    }
  }, [stopCamera, settings?.useDslr, isWrapper, fallbackToWebcam, isDslrConnected, settings?.dslrCameraId, connectDslrCamera, settings?.selectedCameraId]);

  // --- LIFECYCLE MANAGEMENT ---

  useEffect(() => {
    // 1. Start Camera on Mount
    startCamera();

    // 2. Handle Tab Visibility (Stop camera if user switches tabs to save resources)
    const handleVisibilityChange = () => {
        if (document.hidden) {
            stopCamera();
        } else {
            // Only restart if we don't have an image captured yet
            if (!capturedImage) startCamera();
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 3. Cleanup on Unmount
    return () => {
      stopCamera();
      if (settings?.useDslr && isWrapper && isDslrConnected) {
        disconnectDslrCamera();
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startCamera, stopCamera, capturedImage, settings?.useDslr, isWrapper, isDslrConnected, disconnectDslrCamera]);

  // --- CAPTURE LOGIC ---

  // Calculate Aspect Ratio Value
  const getAspectRatioValue = (ratioStr: string): number => {
    const [w, h] = ratioStr.split(':').map(Number);
    return w / h;
  };
  const targetRatioValue = getAspectRatioValue(aspectRatio);

  const capture = useCallback(async () => {
    if (settings?.useDslr && isWrapper && !fallbackToWebcam) {
      try {
        const base64Photo = await captureDslrPhoto();
        if (base64Photo) {
          // Ensure it's a data URL
          const dataUrl = base64Photo.startsWith('data:') ? base64Photo : `data:image/jpeg;base64,${base64Photo}`;
          if (settings?.uiSettings?.confirmPhotoBeforeGenerate) {
             setLocalCapturedImage(dataUrl);
          } else {
             onCapture(dataUrl);
             onGenerate();
          }
        }
      } catch (err) {
        console.error("DSLR capture failed", err);
        setCameraError("DSLR Error, switching to Backup Camera...");
        setFallbackToWebcam(true);
        startCamera(); // Restart with webcam
      }
      return;
    }

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // 1. Get RAW Video Source Dimensions (Usually Landscape 1920x1080)
      const rawW = video.videoWidth;
      const rawH = video.videoHeight;
      
      // Safety check if video hasn't loaded yet
      if (rawW === 0 || rawH === 0) return;

      // 2. Calculate "Effective" Dimensions based on Physical Camera Rotation
      const isSideways = cameraRotation === 90 || cameraRotation === 270;
      
      const effectiveInputW = isSideways ? rawH : rawW;
      const effectiveInputH = isSideways ? rawW : rawH;
      const effectiveInputRatio = effectiveInputW / effectiveInputH;

      // 3. Use Full RAW Stream (No Cropping)
      let srcX = 0;
      let srcY = 0;
      let srcW = rawW;
      let srcH = rawH;

      // 4. Determine Final Output Size (Max 1024px for optimal quality/speed balance)
      // We resize the FULL sensor image to max 1024px
      const MAX_DIMENSION = 1024;
      let destW, destH;

      if (effectiveInputRatio < 1) { // Portrait Source
          destW = Math.round(MAX_DIMENSION * effectiveInputRatio);
          destH = MAX_DIMENSION;
      } else { // Landscape Source
          destW = MAX_DIMENSION;
          destH = Math.round(MAX_DIMENSION / effectiveInputRatio);
      }

      // 6. Set Canvas Size
      canvas.width = destW;
      canvas.height = destH;

      if (ctx) {
         ctx.save();
         // Translate to center
         ctx.translate(canvas.width / 2, canvas.height / 2);
         // Rotate based on settings
         ctx.rotate((cameraRotation * Math.PI) / 180);
         // Mirror (Standard Webcam behavior)
         if (settings?.mirrorCamera !== false) {
           ctx.scale(-1, 1); 
         }

         // Draw Video to Canvas
         const drawW = isSideways ? destH : destW;
         const drawH = isSideways ? destW : destH;
         
         ctx.drawImage(
            video, 
            srcX, srcY, srcW, srcH, 
            -drawW / 2, -drawH / 2, drawW, drawH
         );

         ctx.restore();

         // Generate Base64
         const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
         
         // CRITICAL: Stop Camera IMMEDIATELY after capture to free resources
         stopCamera();
         
         // Pass data up
         if (settings?.uiSettings?.confirmPhotoBeforeGenerate) {
           setLocalCapturedImage(dataUrl);
         } else {
           onCapture(dataUrl);
           onGenerate();
         }
      }
    }
  }, [onCapture, onGenerate, cameraRotation, targetRatioValue, stopCamera, settings?.mirrorCamera, settings?.useDslr, isWrapper, fallbackToWebcam, captureDslrPhoto, startCamera, settings?.uiSettings?.confirmPhotoBeforeGenerate]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Stop camera when uploading file
    stopCamera();

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          // No cropping, just resize to optimal size (max 1024px)
          const imgRatio = img.width / img.height;
          const MAX_DIMENSION = 1024;
          let dW, dH;
          
          if (imgRatio < 1) {
              dW = Math.round(MAX_DIMENSION * imgRatio);
              dH = MAX_DIMENSION;
          } else {
              dW = MAX_DIMENSION;
              dH = Math.round(MAX_DIMENSION / imgRatio);
          }

          canvas.width = dW;
          canvas.height = dH;

          if (ctx) {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dW, dH);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

            if (settings?.uiSettings?.confirmPhotoBeforeGenerate) {
               setLocalCapturedImage(dataUrl);
            } else {
               onCapture(dataUrl);
               onGenerate();
            }
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startCountdown = () => {
    if (!streamRef.current) {
        // Safety: If camera isn't running, try starting it (rare edge case)
        startCamera().then(() => doCountdown());
    } else {
        doCountdown();
    }
  };

  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown === 0) {
      setCountdown(null);
      capture();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, capture]);

  const doCountdown = () => {
      setCountdown(3);
  };

  const handleBack = () => {
      stopCamera(); // Ensure camera stops when going back
      onBack();
  };

  // Model Toggle Logic
  const handleToggleModel = () => {
      if (!settings || !onUpdateSettings) return;
      const isUltra = settings.selectedModel === 'gemini-3-pro-image-preview';
      const newModel = isUltra ? 'gemini-3.1-flash-image-preview' : 'gemini-3-pro-image-preview';
      onUpdateSettings({ ...settings, selectedModel: newModel });
  };

  const [localCapturedImage, setLocalCapturedImage] = useState<string | null>(null);

  const cssAspectRatio = aspectRatio.replace(':', '/');
  const isSideways = cameraRotation === 90 || cameraRotation === 270;
  
  // Shortcut Status
  const showModelShortcut = settings?.enableModelShortcut;
  const isUltraModel = settings?.selectedModel === 'gemini-3-pro-image-preview';

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-black relative overflow-hidden">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-40 bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={handleBack} 
          className="text-white hover:text-purple-400 font-bold tracking-widest uppercase text-xs md:text-base transition-colors bg-black/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10"
        >
          BACK
        </button>
        <h2 className="text-sm md:text-2xl font-heading text-white neon-text italic uppercase drop-shadow-lg">Strike a Pose</h2>
        <div className="w-20" /> 
      </div>

      {/* VIEWPORT CONTAINER */}
      <div className="relative z-10 flex items-center justify-center w-full h-full max-h-screen p-0">
        
        {/* CAMERA ERROR UI */}
        {cameraError && !capturedImage && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
                 <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-xl text-center max-w-sm backdrop-blur-md">
                     <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                         <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                     </div>
                     <h3 className="text-white font-heading uppercase tracking-widest mb-2">Camera Error</h3>
                     <p className="text-gray-300 text-xs font-mono mb-6">{cameraError}</p>
                     <button onClick={startCamera} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold uppercase text-xs rounded transition-colors">
                         Retry Camera
                     </button>
                 </div>
             </div>
        )}

        {/* LOADING SPINNER (While Video Init) */}
        {!isVideoReady && !capturedImage && !localCapturedImage && !cameraError && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )}

        {(!capturedImage && !localCapturedImage) ? (
           // CAMERA PREVIEW
           <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden p-4 md:p-8">
              
              {/* FRAME WITH VIDEO INSIDE */}
              <div className="relative z-20 border-2 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)] rounded-2xl overflow-hidden flex items-center justify-center bg-zinc-900 w-full h-full">
                  
                  <div 
                    className="absolute flex items-center justify-center"
                    style={{
                       width: isSideways ? '100vh' : '100%',
                       height: isSideways ? '100vw' : '100%',
                       transform: `rotate(${cameraRotation}deg)`,
                    }}
                  >
                    {settings?.useDslr && isWrapper && !fallbackToWebcam ? (
                      liveViewFrame ? (
                        <img 
                          src={liveViewFrame} 
                          className="w-full h-full object-contain" 
                          alt="DSLR Live View" 
                          style={{ transform: settings?.mirrorCamera !== false ? 'scaleX(-1)' : 'none' }}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white/50">
                          <div className="w-8 h-8 border-2 border-white/20 border-t-[#bc13fe] rounded-full animate-spin mb-2"></div>
                          <span className="text-xs uppercase tracking-widest">Connecting DSLR...</span>
                        </div>
                      )
                    ) : (
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted
                        className="w-full h-full object-contain"
                        style={{ transform: settings?.mirrorCamera !== false ? 'scaleX(-1)' : 'none' }}
                      />
                    )}
                  </div>
                  
                  {/* Corner Markers */}
                  <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-purple-500 rounded-tl-lg z-30 pointer-events-none" />
                  <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-purple-500 rounded-tr-lg z-30 pointer-events-none" />
                  <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-purple-500 rounded-bl-lg z-30 pointer-events-none" />
                  <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-purple-500 rounded-br-lg z-30 pointer-events-none" />
                  
                  {/* PNG Frame Guide Overlay */}
                  {settings?.uiSettings?.showFrameDuringCapture && settings?.overlayImage && (
                      <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
                          <img 
                              src={getGoogleDriveDirectLink(settings.overlayImage)} 
                              alt="Frame Guide" 
                              className="w-full h-full object-contain opacity-70" 
                          />
                      </div>
                  )}
              </div>

              {/* Countdown Overlay */}
              {countdown && (
                <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-[4px]">
                  <span className="text-[120px] md:text-[250px] font-heading text-white neon-text animate-ping italic">{countdown}</span>
                </div>
              )}
           </div>
        ) : (
           // Result Preview (Same 100% sizing for consistency)
           <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden p-4 md:p-8">
               <div className="relative overflow-hidden border-2 border-white/20 rounded-xl flex items-center justify-center bg-zinc-900 w-full h-full">
                  <img src={capturedImage || localCapturedImage || ''} alt="Capture" className="absolute inset-0 w-full h-full object-contain" />
               </div>
           </div>
        )}
      </div>

      {/* CONTROLS */}
      {localCapturedImage && (
         <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center gap-6 z-50 px-6 pointer-events-auto">
             <button 
                onClick={() => {
                   setLocalCapturedImage(null);
                   setCountdown(null);
                   startCamera();
                }}
                className="px-6 py-3 md:py-4 bg-black/60 border border-white/20 hover:bg-black text-white rounded-full uppercase tracking-widest font-bold text-[10px] md:text-sm backdrop-blur-md transition-all shadow-lg flex items-center gap-2"
             >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                RETAKE
             </button>
             <button 
                onClick={() => {
                   onCapture(localCapturedImage);
                   onGenerate();
                }}
                className="px-8 py-3 md:py-4 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-full uppercase tracking-widest font-bold text-[10px] md:text-sm shadow-[0_0_20px_rgba(188,19,254,0.4)] transition-all flex items-center gap-2 border border-white/10"
             >
                PROCESS NOW
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
             </button>
         </div>
      )}

      {!countdown && !capturedImage && !localCapturedImage && (
        <div className={`absolute ${settings?.uiSettings?.captureButtonPosition === 'top_right' ? 'top-1/2 -translate-y-1/2 right-4 flex-col' : 'bottom-10 left-0 right-0 justify-center flex-row'} flex items-center z-50 px-6 gap-8 pointer-events-none`}>
                
                {/* QUICK MODEL SHORTCUT TOGGLE (LEFT) */}
                <div className="w-16 h-16 md:flex items-center justify-center pointer-events-auto">
                   {showModelShortcut && (
                       <button
                         onClick={handleToggleModel}
                         className={`group flex flex-col items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full backdrop-blur-md border-2 transition-all shadow-lg ${isUltraModel ? 'bg-orange-900/40 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'bg-purple-900/40 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]'}`}
                       >
                           <div className={`text-[8px] md:text-[9px] font-bold font-heading uppercase tracking-widest ${isUltraModel ? 'text-orange-200' : 'text-purple-200'}`}>
                               {isUltraModel ? 'ULTRA' : 'NORMAL'}
                           </div>
                           <div className={`text-[6px] md:text-[7px] font-mono opacity-70 ${isUltraModel ? 'text-orange-300' : 'text-purple-300'}`}>
                               {isUltraModel ? 'GEN3' : 'GEN3.1'}
                           </div>
                       </button>
                   )}
                </div>

                <button 
                  onClick={startCountdown}
                  className="group pointer-events-auto relative w-24 h-24 md:w-28 md:h-28 flex items-center justify-center outline-none transition-transform active:scale-95"
                  disabled={!!cameraError}
                >
                  <div className={`absolute inset-0 border-2 border-dashed ${cameraError ? 'border-red-500/30' : 'border-purple-500/30'} rounded-full animate-[spin_10s_linear_infinite]`} />
                  <div className={`absolute inset-2 border-2 ${cameraError ? 'border-red-500/20' : 'border-white/20'} rounded-full group-hover:border-purple-400/50 transition-colors duration-500`} />
                  <div className={`absolute inset-4 bg-white/5 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center group-hover:bg-purple-600/20 group-hover:border-purple-400 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.05)]`}>
                    <span className="text-[10px] md:text-xs font-heading font-black text-white tracking-[0.2em] italic group-hover:neon-text">CAPTURE</span>
                  </div>
                </button>

                <div className="pointer-events-auto w-16 h-16 md:flex items-center justify-center">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-black/40 border border-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/10 hover:border-purple-500 transition-all group/upload"
                    title="Upload Image"
                  >
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-white/70 group-hover/upload:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </button>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraPage;
