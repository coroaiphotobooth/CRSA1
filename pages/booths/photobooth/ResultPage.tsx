
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Concept, PhotoboothSettings, AspectRatio } from '../../../types';
import { generateAIImage } from '../../../lib/gemini';
import { uploadToDrive, createSessionFolder, queueVideoTask, saveSessionToCloud } from '../../../lib/appsScript';
import { applyOverlay, getGoogleDriveDirectLink, createDoublePrintLayout, createMergedPrintLayout, processPrintOrientation, applyPrintAdjustments, padImageForVideo } from '../../../lib/imageUtils';
import { OverlayCache } from '../../../lib/overlayCache'; 
import { printImage } from '../../../lib/printUtils';
import { decrementCredits, supabase } from '../../../lib/supabase';
import { useDialog } from '../../../components/DialogProvider';

interface ResultPageProps {
  capturedImage: string;
  concept?: Concept;
  settings: PhotoboothSettings;
  concepts: Concept[]; 
  onDone: () => void;
  onGallery: () => void;
  isUltraQuality?: boolean;
  existingSession?: {id: string, url: string, originalId?: string} | null;
  interactiveFormData?: Record<string, any>;
  skipAI?: boolean;
  hasNextPage?: boolean;
  onNext?: () => void;
  isInteractiveFlow?: boolean;
}

const ResultPage: React.FC<ResultPageProps> = ({ capturedImage, concept: initialConcept, settings, concepts, onDone, onGallery, isUltraQuality = false, existingSession, interactiveFormData = {}, skipAI, hasNextPage, onNext, isInteractiveFlow }) => {
  const [concept, setConcept] = useState(initialConcept);
  const [isProcessing, setIsProcessing] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [printLayoutImage, setPrintLayoutImage] = useState<string | null>(null);
  const [sessionFolder, setSessionFolder] = useState<{id: string, url: string, originalId?: string} | null>(existingSession || null);
  const [photoId, setPhotoId] = useState<string | null>(null); 
  const [viewMode, setViewMode] = useState<'result' | 'original'>('result');
  const [showConceptSelector, setShowConceptSelector] = useState(false);
  const [selectedRegenConcept, setSelectedRegenConcept] = useState<Concept | null>(null);
  const [currentQuality, setCurrentQuality] = useState(isUltraQuality);
  const [pendingQuality, setPendingQuality] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("INITIATING...");
  const [timer, setTimer] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [generationTrigger, setGenerationTrigger] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      interval = setInterval(() => setTimer(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);
  const [isVideoRequested, setIsVideoRequested] = useState(false);
  const [videoRedirectTimer, setVideoRedirectTimer] = useState<number | null>(null);
  const videoRedirectIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [videoStatusText, setVideoStatusText] = useState("PREPARING REQUEST...");
  const { showDialog } = useDialog();

  useEffect(() => {
    return () => {
      if (videoRedirectIntervalRef.current) {
        clearInterval(videoRedirectIntervalRef.current);
      }
    };
  }, []);

  let targetWidth = 1080;
  let targetHeight = 1920;
  let displayAspectRatio = '9/16';
  const outputRatio: AspectRatio = settings.outputRatio || '9:16';
  switch (outputRatio) {
    case '16:9': targetWidth = 1920; targetHeight = 1080; displayAspectRatio = '16/9'; break;
    case '9:16': targetWidth = 1080; targetHeight = 1920; displayAspectRatio = '9/16'; break;
    case '3:2': targetWidth = 1800; targetHeight = 1200; displayAspectRatio = '3/2'; break;
    case '2:3': targetWidth = 1200; targetHeight = 1800; displayAspectRatio = '2/3'; break;
  }

  const hasProcessed = useRef(false);

  const handleProcessFlow = useCallback(async () => {
    if (hasProcessed.current) {
        console.log("Skipping duplicate process flow execution");
        return;
    }
    hasProcessed.current = true;

    setIsProcessing(true);
    setIsFinalizing(true); 
    setError(null);
    setTimer(0);
    setResultImage(null);
    setPhotoId(null);

    try {
      const currentSessionId = sessionFolder?.id || existingSession?.id;
      const currentSessionUrl = sessionFolder?.url || existingSession?.url;
      const isRegeneration = !!currentSessionId;

      let sessionTask;
      if (currentSessionId && currentSessionUrl) {
           sessionTask = Promise.resolve({ ok: true, folderId: currentSessionId, folderUrl: currentSessionUrl });
      } else {
           sessionTask = createSessionFolder(settings.activeEventId).then(res => {
              if (res.ok && res.folderId) {
                  setSessionFolder({ id: res.folderId, url: res.folderUrl! });
              }
              return res;
           });
      }

      const originalUploadTask = (!isRegeneration && (settings.originalFolderId || settings.activeEventId)) 
        ? uploadToDrive(capturedImage, {
             conceptName: "ORIGINAL_CAPTURE",
             eventName: settings.eventName,
             eventId: settings.activeEventId,
             folderId: settings.originalFolderId,
             storage_folder: settings.storage_folder,
             skipGallery: true 
          })
        : Promise.resolve({ ok: true, id: null });

      const overlayPreloadTask = settings.overlayImage 
        ? OverlayCache.preloadOverlay(settings.overlayImage)
        : Promise.resolve(null);

      let aiOutput = capturedImage;

      if (!skipAI) {
        if (!concept) throw new Error("AI Processing requires a selected concept.");
        if (settings.activeEventId) {
          const hasCredits = await decrementCredits(settings.activeEventId);
          if (!hasCredits) {
            throw new Error("Insufficient credits for this event.");
          }
        }
        setProgress(currentQuality ? "GENERATING ULTRA QUALITY (SLOW)..." : "GENERATING AI VISUALS...");
        aiOutput = await generateAIImage(capturedImage, concept, outputRatio, currentQuality);
      } else {
        setProgress("PROCESSING ORIGINAL PHOTO...");
        await new Promise(res => setTimeout(res, 500));
      }

      setProgress("APPLYING FINAL TOUCHES...");
      await overlayPreloadTask;
      let finalImage = await applyOverlay(aiOutput, settings.overlayImage, targetWidth, targetHeight);

      let doublePrintImage = null;
      const isDuplicateMode = settings.doublePrintMode === 'duplicate' || (settings.enableDoublePrint && (!settings.doublePrintMode || settings.doublePrintMode === 'disabled'));
      const isSingle2RMode = settings.doublePrintMode === 'single_2r';
      
      if (isDuplicateMode || isSingle2RMode) {
        setProgress(isSingle2RMode ? "CREATING 2R LAYOUT..." : "CREATING PRINT LAYOUT...");
        const modeToUse = isSingle2RMode ? 'single_2r' : 'duplicate';
        doublePrintImage = await createDoublePrintLayout(finalImage, targetWidth, targetHeight, modeToUse, settings.printOrientation);
      } else if (settings.doublePrintMode !== 'queue' && settings.printOrientation && settings.printOrientation !== 'auto') {
        setProgress("APPLYING FORMATTING...");
        doublePrintImage = await processPrintOrientation(finalImage, settings.printOrientation);
      }
      
      setResultImage(finalImage);
      if (doublePrintImage) {
        setPrintLayoutImage(doublePrintImage);
      }
      setIsProcessing(false);

      const sessionRes = await sessionTask;
      const originalRes = await originalUploadTask;

      if (!sessionRes.ok || !sessionRes.folderId) {
          throw new Error("Gagal membuat/akses folder sesi.");
      }

      const uploadRes = await uploadToDrive(finalImage, {
          conceptName: concept?.name || "Original",
          eventName: settings.eventName,
          eventId: settings.activeEventId,
          folderId: sessionRes.folderId, 
          storage_folder: settings.storage_folder,
          originalId: originalRes.id,
          sessionFolderId: sessionRes.folderId,
          sessionFolderUrl: sessionRes.folderUrl
      });

      if (uploadRes.ok) {
        setPhotoId(uploadRes.id);
        
        // Save to Cloud for Guest Result Page
        const directLink = getGoogleDriveDirectLink(uploadRes.id);
        await saveSessionToCloud({
          sessionId: sessionRes.folderId,
          eventId: settings.activeEventId,
          resultImageUrl: directLink,
          originalImageUrl: originalRes.id ? getGoogleDriveDirectLink(originalRes.id) : (existingSession?.originalId || undefined),
          interactiveFormData
        });
      }
      
      setIsFinalizing(false);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Processing Failed");
      setIsProcessing(false);
      setIsFinalizing(false);
    }
  }, [capturedImage, concept, settings, outputRatio, currentQuality, existingSession, sessionFolder]);

  useEffect(() => {
    // Only run if not processed yet, do NOT reset hasProcessed.current here
    if (!hasProcessed.current) {
      handleProcessFlow();
    }
  }, [handleProcessFlow, generationTrigger]); 

  // FIXED: Trigger queueing instead of direct generate and AWAIT RESPONSE
  const handleGenerateVideo = async () => {
    if (!photoId || !resultImage) return;
    
    if (settings.activeEventId) {
      const videoRes = settings.videoResolution || '480p';
      const creditCost = videoRes === '720p' ? 5 : 3;
      const hasCredits = await decrementCredits(settings.activeEventId, creditCost);
      if (!hasCredits) {
        await showDialog('alert', 'Error', `Insufficient credits for video generation. You need ${creditCost} credits.`);
        return;
      }
    }

    setIsVideoRequested(true);
    setVideoStatusText("CONNECTING TO SERVER...");

    let finalVideoPrompt = settings.videoPrompt || '';
    let finalFallbackBase64 = resultImage;

    try {
       // PADDING LOGIC KHUSUS 2:3
       if (outputRatio === '2:3') {
           setVideoStatusText("PREPARING IMAGE...");
           finalFallbackBase64 = await padImageForVideo(resultImage, 544, 736);
           
           if (settings.activeEventId && sessionFolder?.id) {
               setVideoStatusText("UPLOADING VIDEO FRAME...");
               const uploadRes = await uploadToDrive(finalFallbackBase64, {
                   conceptName: "VIDEO_PREP",
                   eventName: settings.eventName,
                   eventId: settings.activeEventId,
                   folderId: sessionFolder.id, 
                   storage_folder: settings.storage_folder,
                   sessionFolderId: sessionFolder.id
               });

               if (uploadRes.ok && uploadRes.id) {
                   // Inject the secret tag into the prompt for the backend queue worker to catch
                   finalVideoPrompt += ` [FRAME_URL: ${uploadRes.id}]`;
                   console.log("Padded video frame uploaded and tag injected");
               }
           }
       }

       // Save to cloud that video was requested
       if (sessionFolder?.id) {
         await saveSessionToCloud({
           sessionId: sessionFolder.id,
           eventId: settings.activeEventId,
           isVideoRequested: true,
           videoPrompt: finalVideoPrompt // Saving injected prompt
         });
       }

       // Explicitly pass settings to avoid missing parameters in backend
       const res = await queueVideoTask(photoId, {
           prompt: finalVideoPrompt,
           resolution: settings.videoResolution || '480p',
           model: settings.videoModel || 'seedance-1-0-pro-fast-251015',
           eventId: settings.activeEventId,
           sessionId: sessionFolder?.id
       });

       if (!res.ok) {
           throw new Error("Queue failed, trying direct API...");
       }
       
       setVideoStatusText("VIDEO QUEUED SUCCESSFULLY");
       console.log("Video task queued successfully");

    } catch(e) { 
       console.warn("Queue failed, attempting fallback...", e);
       setVideoStatusText("TRYING DIRECT RENDER...");
       
       // Fallback: Direct API Call if Sheet Queue fails
       try {
           await fetch('/api/video/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                 driveFileId: (sessionFolder?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionFolder.id)) ? sessionFolder.id : photoId, 
                 imageUrl: null, 
                 imageBase64: finalFallbackBase64, // Pass directly via base64 for fallback
                 prompt: settings.videoPrompt, // Use base prompt since base64 overrides URL
                 resolution: settings.videoResolution || '480p',
                 model: settings.videoModel 
              })
           });
           setVideoStatusText("RENDER STARTED");
       } catch (err) {
           console.error("Fallback failed", err);
           setVideoStatusText("REQUEST SENT (CHECK GALLERY)");
       }
    }

    // Start Redirect Countdown AFTER request attempts are done
    let countdown = 3;
    setVideoRedirectTimer(countdown);
    
    videoRedirectIntervalRef.current = setInterval(() => {
       countdown--;
       setVideoRedirectTimer(countdown);
       if (countdown <= 0) {
          if (videoRedirectIntervalRef.current) clearInterval(videoRedirectIntervalRef.current);
          onDone(); 
       }
    }, 1000);
  };

  const handleRegenerateClick = () => {
      setPendingQuality(currentQuality);
      setShowConceptSelector(true);
  };
  
  const executeRegeneration = () => {
    if (selectedRegenConcept) {
        hasProcessed.current = false; // Clear lock to allow re-processing
        setResultImage(null);
        setPrintLayoutImage(null);
        setError(null);
        setIsProcessing(true);
        setCurrentQuality(pendingQuality);
        setConcept(selectedRegenConcept);
        setShowConceptSelector(false);
        setGenerationTrigger(prev => prev + 1);
    }
  };

  const handlePrint = async () => {
      let imageToPrint = printLayoutImage || resultImage;
      if (!imageToPrint) return;

      // Handle Queue Mode
      if (settings.doublePrintMode === 'queue') {
         const queueKey = `printQueue_${settings.activeEventId}`;
         const queuedImage = localStorage.getItem(queueKey);
         
         if (!queuedImage) {
            // Nothing in queue, save this image to queue and do not print yet
            localStorage.setItem(queueKey, imageToPrint);
            await showDialog('alert', 'Photo Queued!', 'Success! Your photo is queued and will print with the next guest to save paper.');
            return;
         } else {
            // Something is in queue, merge it with current image
            setProgress("MERGING PRINTS...");
            // Use targetWidth and targetHeight for the base image size
            try {
               imageToPrint = await createMergedPrintLayout(queuedImage, imageToPrint, targetWidth, targetHeight, settings.printOrientation);
               // Clear queue since we are printing
               localStorage.removeItem(queueKey);
            } catch (e) {
               console.error("Queue merge failed", e);
               // If merge fails, clear queue anyway? Wait, preserve queue if fail or clear to avoid blocking?
               // It's safer to clear it and just print current image. Use fallback inside createMergedPrintLayout.
            }
         }
      }
      
      // Apply color/transparency adjustments specifically for print
      if (settings.printBrightness !== 0 || settings.printTransparency !== 0) {
        try {
          setProgress("APPLYING COLOR FIXES...");
          imageToPrint = await applyPrintAdjustments(imageToPrint, settings.printBrightness || 0, settings.printTransparency || 0);
        } catch(e) {
          console.error("Failed to apply color adjustments prior to print", e);
        }
      }

      if (settings.printMethod === 'server') {
        // Send broadcast to print server
        const channel = supabase.channel(`print_server_${settings.activeEventId}`);
        await channel.send({
          type: 'broadcast',
          event: 'print_job',
          payload: { imageUrl: imageToPrint }
        });
        showDialog('alert', 'Print Job Sent', 'Your photo has been sent to the print server.');
      } else {
        // Direct print
        printImage(imageToPrint);
      }
  };

  if (isProcessing) {
    const procStyle = settings.uiSettings?.processingStyle || 'progress_bar';
    const mainText = settings.uiSettings?.processingText || 'GENERATING AI VISUALS...';
    
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center relative p-6 text-center overflow-hidden bg-black/90 backdrop-blur-md">
        <div className="absolute inset-0 z-0 flex items-center justify-center p-4">
          <img src={capturedImage} className="max-w-full max-h-full object-contain opacity-50 blur-lg" alt="Preview" />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 flex flex-col items-center w-full">
          
          {procStyle === 'progress_bar' && (
            <>
              <div className="relative w-40 h-40 md:w-64 md:h-64 mb-8 shrink-0">
                 <div className="absolute inset-0 border-[6px] border-white/5 rounded-full" />
                 <div className="absolute inset-0 border-[6px] border-t-glow rounded-full animate-spin shadow-[0_0_30px_rgba(var(--glow-color-rgb),0.4)]" />
                 <div className="absolute inset-0 flex items-center justify-center flex-col">
                   <span className="text-[10px] tracking-[0.3em] text-glow font-bold mb-1 uppercase italic">Processing</span>
                   <span className="text-3xl md:text-5xl font-heading text-white italic">{timer}<span className="text-lg md:text-2xl text-white/50 ml-1">s</span></span>
                 </div>
              </div>
              <div className="max-w-md w-full bg-black/40 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                <h2 className="text-xl md:text-2xl font-heading mb-3 neon-text italic uppercase tracking-tighter">{mainText}</h2>
                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mb-3">
                  <div className="bg-glow h-full animate-[progress_10s_ease-in-out_infinite]" style={{width: '60%'}} />
                </div>
                <p className="text-[8px] text-glow/70 uppercase tracking-widest animate-pulse">{progress}</p>
              </div>
            </>
          )}

          {procStyle === 'futuristic_progress' && (
            <div className="flex flex-col items-center justify-center max-w-lg w-full bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-[2rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
              <div className="text-glow text-[10px] md:text-sm tracking-[0.5em] uppercase font-bold text-center mb-8 animate-pulse neon-text">{mainText}</div>
              <div className="w-full relative h-1.5 md:h-2 rounded-full bg-black/80 border border-white/5 overflow-hidden shadow-[inset_0_0_10px_rgba(0,0,0,1)] mb-4">
                <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-glow/20 via-glow to-glow/20 animate-[progress_10s_ease-in-out_infinite] blur-[2px]" style={{width: '60%'}} />
                <div className="absolute top-0 bottom-0 left-0 bg-white drop-shadow-[0_0_10px_rgba(255,255,255,1)] animate-[progress_10s_ease-in-out_infinite]" style={{width: '60%'}} />
              </div>
              <div className="flex justify-between w-full mt-2 text-[8px] md:text-[10px] text-white/50 uppercase font-mono tracking-widest">
                <span>{progress}</span>
                <span>{timer}s</span>
              </div>
            </div>
          )}

          {procStyle === 'ai_neural' && (
            <div className="flex flex-col items-center justify-center w-full">
              <div className="relative w-32 h-32 md:w-48 md:h-48 mb-10 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-dashed border-white/20 animate-[spin_20s_linear_infinite]" />
                <div className="absolute inset-4 rounded-full border border-glow/40 animate-[spin_10s_linear_reverse_infinite]" />
                <div className="absolute inset-8 rounded-full border-2 border-dashed border-glow/80 animate-[spin_15s_linear_infinite]" />
                <div className="w-3 h-3 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,1)] animate-ping" />
                <div className="absolute w-2 h-2 bg-glow rounded-full top-0 left-1/2 -translate-x-1/2 shadow-[0_0_10px_rgba(var(--glow-color-rgb),1)] animate-pulse" />
                <div className="absolute w-2 h-2 bg-glow rounded-full bottom-0 left-1/2 -translate-x-1/2 shadow-[0_0_10px_rgba(var(--glow-color-rgb),1)] animate-pulse" />
                <div className="absolute w-2 h-2 bg-glow rounded-full left-0 top-1/2 -translate-y-1/2 shadow-[0_0_10px_rgba(var(--glow-color-rgb),1)] animate-pulse" />
                <div className="absolute w-2 h-2 bg-glow rounded-full right-0 top-1/2 -translate-y-1/2 shadow-[0_0_10px_rgba(var(--glow-color-rgb),1)] animate-pulse" />
              </div>
              <h2 className="text-xl md:text-3xl font-heading mb-4 neon-text italic uppercase tracking-widest">{mainText}</h2>
              <p className="text-[10px] text-white/60 tracking-[0.3em] uppercase font-mono bg-black/40 px-4 py-2 rounded-full border border-white/5">{progress}</p>
            </div>
          )}

          {procStyle === 'heartbeat' && (
            <div className="flex flex-col items-center justify-center w-full max-w-xl bg-black/60 backdrop-blur-lg p-10 rounded-3xl border border-[#bc13fe]/20 shadow-[0_0_40px_rgba(var(--glow-color-rgb),0.1)]">
              <div className="text-glow animate-pulse mb-8 drop-shadow-[0_0_10px_rgba(var(--glow-color-rgb),0.8)]">
                 <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                 </svg>
              </div>
              <h2 className="text-xl md:text-4xl text-white font-black italic uppercase tracking-tighter mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">{mainText}</h2>
              <p className="text-xs text-white/70 tracking-[0.4em] uppercase font-bold flex items-center gap-4">
                 <span>{progress}</span>
                 <span className="text-glow text-lg">{timer}s</span>
              </p>
            </div>
          )}

          {procStyle === 'sound_wave' && (
            <div className="flex flex-col items-center justify-center w-full bg-black/50 backdrop-blur-md py-12 px-8 rounded-3xl border border-white/10">
              <div className="flex items-end justify-center gap-1.5 md:gap-2 h-16 md:h-24 mb-10 w-full max-w-xs overflow-hidden">
                {[...Array(21)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1.5 md:w-2 bg-[#bc13fe] rounded-full shadow-[0_0_15px_rgba(188,19,254,0.8)]"
                    style={{ 
                      height: `${Math.max(10, Math.random() * 100)}%`, 
                      animation: `pulse ${0.4 + Math.random() * 0.8}s infinite alternate ease-in-out` 
                    }} 
                  />
                ))}
              </div>
              <h2 className="text-xl md:text-3xl text-white font-heading italic uppercase tracking-[0.2em] mb-4 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{mainText}</h2>
              <p className="text-[10px] text-white/50 tracking-[0.4em] uppercase font-mono">{progress}</p>
            </div>
          )}

          {procStyle === 'pulse_wave' && (
            <div className="flex flex-col items-center justify-center relative w-full py-16">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                 <div className="absolute w-[300px] h-[300px] md:w-[500px] md:h-[500px] border-[1px] border-[#bc13fe]/30 rounded-full animate-ping opacity-20" style={{ animationDuration: '4s' }} />
                 <div className="absolute w-[200px] h-[200px] md:w-[350px] md:h-[350px] border-[2px] border-[#bc13fe]/40 rounded-full animate-ping opacity-40" style={{ animationDuration: '3s' }} />
                 <div className="absolute w-[100px] h-[100px] md:w-[200px] md:h-[200px] border-[3px] border-white/30 rounded-full animate-ping opacity-60" style={{ animationDuration: '2s' }} />
              </div>
              <div className="relative z-10 bg-black/70 backdrop-blur-md px-8 md:px-16 py-8 rounded-[2rem] border border-white/10 flex flex-col items-center shadow-[0_0_40px_rgba(188,19,254,0.3)]">
                 <div className="w-4 h-4 bg-white rounded-full mb-8 shadow-[0_0_20px_rgba(255,255,255,1)] animate-bounce" />
                 <h2 className="text-xl md:text-3xl text-[#bc13fe] font-bold uppercase tracking-[0.3em] mb-4 text-center">{mainText}</h2>
                 <p className="text-[8px] md:text-[10px] text-white/60 tracking-[0.5em] uppercase max-w-[250px] text-center leading-relaxed">{progress}</p>
              </div>
            </div>
          )}

          {procStyle === 'neural_signal' && (
            <div className="flex flex-col items-center justify-center w-full max-w-2xl bg-[#bc13fe]/5 border border-[#bc13fe]/20 rounded-3xl p-10 md:p-16 backdrop-blur-xl shadow-[inset_0_0_30px_rgba(188,19,254,0.1)]">
              <div className="flex items-center justify-center gap-6 mb-10 w-full">
                <div className="h-0.5 flex-1 bg-gradient-to-l from-[#bc13fe] to-transparent opacity-50" />
                <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl bg-black/80 border border-[#bc13fe] flex items-center justify-center animate-spin shadow-[0_0_20px_rgba(188,19,254,0.5)]" style={{ animationDuration: '6s' }}>
                  <div className="w-3 h-3 md:w-5 md:h-5 bg-white rounded-sm shadow-[0_0_15px_rgba(255,255,255,1)] animate-pulse" />
                </div>
                <div className="h-0.5 flex-1 bg-gradient-to-r from-[#bc13fe] to-transparent opacity-50" />
              </div>
              <h2 className="text-xl md:text-4xl text-white font-heading italic uppercase tracking-[0.2em] mb-6 drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] text-center">{mainText}</h2>
              <div className="flex items-center justify-center gap-4 text-[#bc13fe] text-[10px] md:text-xs tracking-[0.4em] font-mono uppercase bg-black/60 px-6 py-3 rounded-full border border-white/5">
                <span className="w-2 h-2 rounded-full bg-[#bc13fe] animate-ping" />
                <span>{progress}</span>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  if (isVideoRequested) {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-black/90 p-8 text-center animate-[fadeIn_0.5s] backdrop-blur-xl">
          <div className="w-24 h-24 mb-6 rounded-full border-4 border-glow/50 flex items-center justify-center bg-glow/20 shadow-[0_0_50px_rgba(var(--glow-color-rgb),0.3)]">
             <svg className="w-12 h-12 text-glow animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <h1 className="text-3xl md:text-5xl font-heading text-white italic uppercase tracking-tighter mb-4">VIDEO IS IN PROCESS ON THE GALLERY</h1>
          <p className="text-white/60 font-mono text-sm tracking-widest uppercase mb-8 max-w-lg leading-relaxed">
             PLEASE VIEW THE PROCESS ON THE GALLERY PAGE
          </p>
          {videoRedirectTimer !== null && (
             <div className="text-glow font-bold tracking-[0.2em] text-xs">REDIRECTING IN {videoRedirectTimer}...</div>
          )}
      </div>
    );
  }

  if (error) {
     return (
       <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-transparent text-center p-10">
         <h2 className="text-red-500 text-2xl font-heading mb-4 italic">SYSTEM ERROR</h2>
         <p className="text-gray-500 mb-8 font-mono text-xs">{error}</p>
         <button onClick={handleProcessFlow} className="px-8 py-3 bg-white text-black font-heading uppercase italic tracking-widest">RETRY PROCESS</button>
       </div>
     )
  }

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-transparent overflow-hidden relative font-sans">
      <div className="relative z-10 w-full h-full flex flex-col items-center p-4 md:p-6 gap-6">
         <div className="flex-1 w-full min-h-0 flex items-center justify-center">
            <div className="relative border-4 border-white/5 shadow-2xl bg-black/50 backdrop-blur-sm rounded-xl overflow-hidden" style={{ aspectRatio: displayAspectRatio, maxHeight: '100%', maxWidth: '100%' }}>
                <img src={viewMode === 'result' ? resultImage! : capturedImage} className="w-full h-full object-contain" />
                <div className="absolute top-4 left-4 z-40">
                    <button onClick={() => setViewMode(prev => prev === 'result' ? 'original' : 'result')} className={`backdrop-blur border px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest transition-all ${viewMode === 'result' ? 'bg-glow/50 border-glow text-glow' : 'bg-green-900/50 border-green-500 text-green-200'}`}>
                      {viewMode === 'result' ? '👁 VIEW ORIGINAL' : '✨ VIEW RESULT'}
                    </button>
                </div>
                
                {(() => {
                  const position = settings.uiSettings?.resultButtonsPosition || 'bottom';
                  let containerClasses = "absolute z-30 flex gap-3 flex-wrap items-center px-4 ";
                  
                  if (position === 'bottom') {
                     containerClasses += "bottom-4 left-0 right-0 justify-center";
                  } else if (position === 'top') {
                     containerClasses += "top-4 right-4 justify-end";
                  } else if (position === 'right') {
                     containerClasses += "right-4 top-1/2 -translate-y-1/2 flex-col justify-center";
                  }

                  return (
                    <div className={containerClasses}>
                       <button onClick={() => setShowQR(true)} disabled={!sessionFolder} className={`backdrop-blur-md border px-5 py-4 rounded-full font-heading text-[10px] tracking-[0.2em] uppercase italic flex items-center gap-2 transition-all ${!sessionFolder ? 'bg-gray-800/50 border-gray-600 text-gray-400 cursor-wait' : 'bg-glow/30 border-glow/50 text-glow hover:bg-glow/40'}`}>
                          {!sessionFolder ? "SAVING..." : "SESSION QR"}
                       </button>
                       {settings.enablePrint && (
                           <button onClick={handlePrint} className="backdrop-blur-md bg-cyan-900/30 border border-cyan-500/50 text-cyan-100 px-5 py-4 rounded-full font-heading text-[10px] tracking-[0.2em] uppercase italic flex items-center gap-2 hover:bg-cyan-600/40 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all">
                              PRINT
                           </button>
                       )}
                       <button onClick={handleRegenerateClick} className="backdrop-blur-md bg-orange-900/30 border border-orange-500/50 text-orange-100 px-5 py-4 rounded-full font-heading text-[10px] tracking-[0.2em] uppercase italic flex items-center gap-2 hover:bg-orange-600/40 transition-all">
                          REGENERATE
                       </button>
                       {settings.boothMode === 'video' && (
                          <button onClick={handleGenerateVideo} disabled={!photoId} className={`backdrop-blur-md border px-5 py-4 rounded-full font-heading text-[10px] tracking-[0.2em] uppercase italic flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] ${!photoId ? 'bg-gray-800/50 border-gray-600 text-gray-400 cursor-wait' : 'bg-blue-900/30 border-blue-500/50 text-blue-100 hover:bg-blue-600/40 animate-pulse'}`}>
                             {!photoId ? "SYNCING..." : "GENERATE VIDEO"}
                          </button>
                       )}
                    </div>
                  );
                })()}
            </div>
         </div>
         <div className="relative z-10 flex flex-col items-center gap-2 pb-6">
             {isInteractiveFlow ? (
                 (hasNextPage && onNext) ? (
                     <button onClick={onNext} className="px-12 py-5 bg-white text-black hover:bg-gray-200 transition-all rounded-full font-bold uppercase tracking-widest text-sm shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center gap-3 animate-bounce">
                         Next <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                     </button>
                 ) : (
                     <button onClick={onDone} className="px-12 py-5 bg-white text-black hover:bg-gray-200 transition-all rounded-full font-bold uppercase tracking-widest text-sm shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3 animate-bounce">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg> Start Over 
                     </button>
                 )
             ) : (
                 <button onClick={onDone} className="text-gray-500 hover:text-white uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                     Start Over
                 </button>
             )}
         </div>
      </div>

      {showConceptSelector && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-[fadeIn_0.2s]">
             <div className="bg-[#0a0a0a] border border-white/10 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl relative">
                 <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/50">
                    <h2 className="text-xl font-heading text-white neon-text uppercase italic">Select New Concept</h2>
                    <button onClick={() => setShowConceptSelector(false)} className="text-white/50 hover:text-white">✕</button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-6 md:p-8 content-start">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6 h-max">
                        {concepts.map(c => (
                          <div key={c.id} onClick={() => setSelectedRegenConcept(c)} className={`relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all aspect-[2/3] ${selectedRegenConcept?.id === c.id ? 'border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'border-white/10 hover:border-glow opacity-60 hover:opacity-100'}`}>
                             <img src={c.thumbnail} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                             {selectedRegenConcept?.id === c.id && (
                                 <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                                     <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-lg"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>
                                 </div>
                             )}
                             <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80" />
                             <div className="absolute bottom-0 inset-x-0 p-3 text-center z-10"><p className="text-xs md:text-sm text-white font-black uppercase drop-shadow-md truncate">{c.name}</p></div>
                          </div>
                        ))}
                    </div>
                 </div>
                 <div className="p-6 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 bg-black/50">
                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                       <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${pendingQuality ? 'bg-glow border-glow' : 'bg-black/50 border-white/20 group-hover:border-glow'}`}>
                           {pendingQuality && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                       </div>
                       <input type="checkbox" className="hidden" checked={pendingQuality} onChange={e => setPendingQuality(e.target.checked)} />
                       <div className="flex flex-col">
                          <span className={`text-xs font-bold uppercase tracking-widest ${pendingQuality ? 'text-glow' : 'text-gray-400 group-hover:text-white'}`}>USE ULTRA QUALITY</span>
                          <span className="text-[8px] text-gray-500">Warning: Slower generation time</span>
                       </div>
                    </label>
                    <div className="flex gap-4">
                        <button onClick={() => setShowConceptSelector(false)} className="px-6 py-3 rounded-lg text-white/50 hover:text-white text-xs font-bold uppercase tracking-widest">Cancel</button>
                        <button onClick={executeRegeneration} disabled={!selectedRegenConcept} className="px-8 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-heading text-xs tracking-widest uppercase rounded shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all">Confirm Regenerate</button>
                    </div>
                 </div>
             </div>
         </div>
      )}

      {showQR && sessionFolder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-[fadeIn_0.3s]" onClick={() => setShowQR(false)}>
            <div className="relative bg-[#050505]/95 border border-glow/50 p-6 rounded-2xl flex flex-col items-center gap-4 max-w-[280px] w-full shadow-[0_0_80px_rgba(var(--glow-color-rgb),0.4)] backdrop-blur-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="absolute top-0 left-0 w-full h-1 bg-glow/50 shadow-[0_0_10px_var(--glow-color)] animate-[scan_2s_linear_infinite] z-20 pointer-events-none opacity-70" />
                <div className="flex flex-col items-center z-10 w-full">
                  <h3 className="text-white font-heading text-xs tracking-[0.3em] uppercase neon-text">Neural Link</h3>
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-glow to-transparent mt-2 opacity-50"/>
                </div>
                <div className="relative p-3 bg-white rounded-xl z-10 shadow-inner mt-1">
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-glow" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-glow" />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-glow" />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-glow" />
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/result/${sessionFolder.id}?n=${encodeURIComponent(settings.eventName || '')}&d=${encodeURIComponent(settings.eventDescription || '')}`)}`} className="w-32 h-32 object-contain mix-blend-multiply" />
                </div>
                <div className="text-center z-10 mt-1">
                  <p className="text-glow text-[9px] font-mono tracking-widest uppercase mb-1">SCAN_TO_DOWNLOAD</p>
                  <p className="text-gray-500 text-[7px] uppercase tracking-widest">SECURE_CONNECTION_ESTABLISHED</p>
                </div>
                <button onClick={() => setShowQR(false)} className="mt-2 w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold uppercase text-[9px] tracking-[0.2em] rounded transition-colors z-10">CLOSE</button>
            </div>
          </div>
      )}

      <style>{`
        @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes scan { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
      `}</style>
    </div>
  );
};

export default ResultPage;
