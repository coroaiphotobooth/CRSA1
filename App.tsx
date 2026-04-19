import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useParams, useLocation, Navigate } from 'react-router-dom';
import { AppState, Concept, PhotoboothSettings, ProcessNotification, AspectRatio, GalleryItem } from './types';
import { DEFAULT_CONCEPTS, DEFAULT_SETTINGS, DEFAULT_GAS_URL } from './constants';
import { fetchSettings, fetchEvents, uploadToDrive, saveSessionToCloud } from './lib/appsScript';
import { generateAIImage } from './lib/gemini';
import { applyOverlay, getGoogleDriveDirectLink } from './lib/imageUtils'; 
import { OverlayCache } from './lib/overlayCache'; 
import { aiQueue } from './lib/aiQueue'; 
import { saveLargeData, getLargeData } from './lib/storage'; 
import { supabase, decrementCredits } from './lib/supabase';
import LandingPage from './pages/booths/photobooth/LandingPage';
import VipLandingPage from './pages/booths/photobooth/VipLandingPage';
import ThemesPage from './pages/booths/photobooth/ThemesPage';
import CameraPage from './pages/booths/photobooth/CameraPage';
import ResultPage from './pages/booths/photobooth/ResultPage';
import GalleryPage from './pages/booths/photobooth/GalleryPage';
import AdminPage from './pages/booths/photobooth/admin/AdminPage';
import MonitorPage from './pages/booths/photobooth/MonitorPage';
import FastThanksPage from './pages/booths/photobooth/FastThanksPage';
import GuestResultPage from './pages/booths/photobooth/GuestResultPage';
import { usePresence } from './hooks/usePresence';
import LoginPage from './pages/auth/LoginPage';
import VendorDashboard from './pages/dashboard/VendorDashboard';
import SuperAdminDashboard from './pages/dashboard/SuperAdminDashboard';
import GuestbookMonitor from './pages/GuestbookAi/GuestbookMonitor';
import GuestbookFlow from './pages/GuestbookAi/GuestbookFlow';
import GuestbookAdmin from './pages/GuestbookAi/GuestbookAdmin';
import PrintServerPage from './pages/booths/photobooth/PrintServerPage';
import { useDialog } from './components/DialogProvider';
import { TourProvider } from './components/TourProvider';

// Helper: Safe LocalStorage Set (Only for small settings, NOT concepts)
const safeLocalStorageSet = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn(`LocalStorage quota exceeded for ${key}.`);
    }
};

const PhotoboothFlow: React.FC = () => {
  const location = useLocation();
  const { eventId } = useParams<{ eventId: string }>();
  const { showDialog } = useDialog();
  
  const queryParams = new URLSearchParams(location.search);
  const initialPage = queryParams.get('page') === 'gallery' 
    ? AppState.GALLERY 
    : location.pathname.startsWith('/admin') ? AppState.ADMIN : AppState.LANDING;

  const [currentPage, setCurrentPage] = useState<AppState>(initialPage);
  const [adminTab, setAdminTab] = useState<'settings' | 'concepts' | 'vip'>('settings');
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [settings, setSettings] = useState<PhotoboothSettings>(DEFAULT_SETTINGS);
  const [concepts, setConcepts] = useState<Concept[]>(DEFAULT_CONCEPTS);
  const [eventLoadStatus, setEventLoadStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const autoResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Regeneration Quality State
  const [regenUltraQuality, setRegenUltraQuality] = useState(false);
  
  // Session State for Regeneration (To keep same folder)
  const [currentSession, setCurrentSession] = useState<{id: string, url: string, originalId?: string} | null>(null);

  // Background Processing State
  const [notifications, setNotifications] = useState<ProcessNotification[]>([]);

  // Gallery Cache State (New)
  const [galleryCache, setGalleryCache] = useState<GalleryItem[]>([]);

  usePresence(settings.vendor_id, 'event_photobooth');

  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email || null);
    });
  }, []);

  const isVIPAdmin = ['demo@coroai.app', 'coroaiphotobooth@gmail.com'].includes(userEmail || '');

  // --- OVERLAY PRELOADER ---
  useEffect(() => {
     if (settings.overlayImage) {
         OverlayCache.preloadOverlay(settings.overlayImage)
            .catch(err => console.warn("Background Overlay Preload Failed:", err));
     }
  }, [settings.overlayImage]);

  // --- GLOBAL ADAPTIVE TICKER FOR VIDEO PROCESSING ---
  useEffect(() => {
     if (settings.boothMode !== 'video') return;

     let timerId: ReturnType<typeof setTimeout>;
     let isRunning = true;

     const runTick = async () => {
         if (!isRunning) return;
         if (document.hidden) {
             timerId = setTimeout(runTick, 10000); 
             return;
         }

         let nextInterval = 60000; // Default idle interval: 60s

         try {
             const res = await fetch('/api/video/tick');
             const contentType = res.headers.get("content-type");
             
             if (res.ok && contentType && contentType.includes("application/json")) {
                 const data = await res.json();
                 
                 if (data.activeCount > 0 || (data.report && (data.report.processed > 0 || data.report.started > 0))) {
                     nextInterval = 5000; // Active interval: 5s
                     console.log(`[POLL] Tick Active. Next: 5s. Pending: ${data.activeCount}`);
                 }
             }
         } catch (err) {
             nextInterval = 60000; 
         }

         if (isRunning) {
             timerId = setTimeout(runTick, nextInterval);
         }
     };

     runTick();

     return () => {
         isRunning = false;
         if (timerId) clearTimeout(timerId);
     };
  }, [settings.boothMode]);

  // --- INITIALIZATION & SYNC ---
  useEffect(() => {
    // 1. Load Settings (Small Data -> LocalStorage)
    const currentStoredUrl = localStorage.getItem('APPS_SCRIPT_BASE_URL');
    if (currentStoredUrl !== DEFAULT_GAS_URL) {
       localStorage.setItem('APPS_SCRIPT_BASE_URL', DEFAULT_GAS_URL);
    }

    const savedSettings = localStorage.getItem('pb_settings');
    if (savedSettings) setSettings(JSON.parse(savedSettings));

    // 2. Load Concepts (Heavy Data -> IndexedDB)
    const loadConcepts = async () => {
        try {
            // Try Loading from IndexedDB
            const savedConcepts = await getLargeData('pb_concepts');
            if (savedConcepts && Array.isArray(savedConcepts) && savedConcepts.length > 0) {
                console.log("Loaded concepts from IndexedDB");
                setConcepts(savedConcepts);
            } else {
                // Fallback: Check LocalStorage for legacy data once, then migrate
                const legacy = localStorage.getItem('pb_concepts');
                if (legacy) {
                    try {
                        const parsed = JSON.parse(legacy);
                        setConcepts(parsed);
                        await saveLargeData('pb_concepts', parsed); // Migrate to DB
                        localStorage.removeItem('pb_concepts'); // Clean up LocalStorage to free space
                        console.log("Migrated concepts from LocalStorage to IndexedDB");
                    } catch(e) {}
                }
            }
        } catch (err) {
            console.error("Failed to load concepts from storage", err);
        }
    };
    loadConcepts();
    
    // 3. Sync Cloud
    const syncCloud = async () => {
      try {
        if (eventId) {
          // Fetch from Supabase
          const { data: eventData, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();
            
          if (error) throw error;
          if (eventData) {
            const loadedSettings = eventData.settings || {};
            if (loadedSettings.videoPrompt === 'Cinematic slow motion, subtle movement, 4k high quality, looping background' ||
                loadedSettings.videoPrompt === 'Animate the image with very subtle and natural motion. Keep the subject stable and realistic. Add minimal camera movement and gentle breathing or blinking. Avoid any distortion, fast motion, or unrealistic effects. Preserve the original look and details.') {
              loadedSettings.videoPrompt = 'Apply slow camera movement (push-in, push-out, pan, or parallax depth effect). Add subtle natural motion to the subject such as blinking, breathing, and micro expressions. Keep the face sharp, realistic, and undistorted.';
            }
            setSettings(prev => ({ 
              ...prev, 
              ...loadedSettings, 
              eventName: eventData.name,
              eventDescription: eventData.description,
              activeEventId: eventData.id,
              storage_folder: eventData.storage_folder,
              vendor_id: eventData.vendor_id
            }));
            
            // Also fetch concepts from Supabase if we have a concepts table
            const { data: conceptsData, error: conceptsError } = await supabase
              .from('concepts')
              .select('*')
              .eq('event_id', eventId);
              
            if (!conceptsError && conceptsData) {
              const mappedConcepts = conceptsData.map(c => ({
                id: c.id,
                concept_id: c.concept_id,
                name: c.name,
                prompt: c.prompt,
                thumbnail: c.thumbnail,
                refImage: c.ref_image || undefined,
                reference_image_split: c.reference_image_split || undefined,
                reference_image_bg: c.reference_image_bg || undefined,
                style_preset: c.style_preset || undefined
              }));
              setConcepts(mappedConcepts);
              saveLargeData('pb_concepts', mappedConcepts).catch(err => 
                  console.error("Failed to cache concepts to DB", err)
              );
            }
            setEventLoadStatus('success');
          } else {
            setEventLoadStatus('error');
          }
        } else {
          // Legacy GAS Sync
          const res = await fetchSettings();
          if (res.ok) {
            setSettings(prev => ({ ...prev, ...res.settings }));
            if (res.concepts && Array.isArray(res.concepts)) {
              setConcepts(res.concepts);
              // Save to IndexedDB (Async) - DO NOT use localStorage for concepts
              saveLargeData('pb_concepts', res.concepts).catch(err => 
                  console.error("Failed to cache concepts to DB", err)
              );
            }
          }
          
          const events = await fetchEvents();
          const active = events.find(e => e.isActive);
          if (active) {
            setSettings(prev => ({
              ...prev,
              eventName: active.name,
              eventDescription: active.description,
              folderId: active.folderId,
              activeEventId: active.id,
              storage_folder: active.storage_folder
            }));
          }
          setEventLoadStatus('success');
        }
      } catch (e) {
        console.warn("Cloud sync error:", e);
        setEventLoadStatus('error');
      }
    };
    syncCloud();
  }, [eventId]);

  useEffect(() => {
    if (autoResetTimer.current) clearTimeout(autoResetTimer.current);
    if (currentPage === AppState.RESULT) {
      autoResetTimer.current = setTimeout(() => { handleReset(); }, settings.autoResetTime * 1000);
    }
    return () => { if (autoResetTimer.current) clearTimeout(autoResetTimer.current); };
  }, [currentPage, settings.autoResetTime]);

  const handleReset = () => {
    setCurrentPage(AppState.LANDING);
    setSelectedConcept(null);
    setCapturedImage(null);
    setRegenUltraQuality(false);
    setCurrentSession(null); 
  };

  const handleRegenerate = (image: string, concept: Concept, useUltra: boolean = false, sessionData?: {id: string, url: string, originalId?: string}) => {
    setCapturedImage(image);
    setSelectedConcept(concept);
    setRegenUltraQuality(useUltra);
    if (sessionData) {
        setCurrentSession(sessionData);
    }
    setCurrentPage(AppState.GENERATING);
  };

  const handleUpdateSettings = (newSettings: PhotoboothSettings) => {
      setSettings(newSettings);
      safeLocalStorageSet('pb_settings', JSON.stringify(newSettings));
  };

  // Helper for concepts saving from Admin (Updates State + IndexedDB)
  const handleUpdateConcepts = (newConcepts: Concept[]) => {
      setConcepts(newConcepts);
      // Use saveLargeData (IndexedDB) instead of localStorage
      saveLargeData('pb_concepts', newConcepts).then(() => {
          console.log("Concepts cached to IndexedDB");
      }).catch(async err => {
          console.error("Failed to save concepts to IndexedDB", err);
          await showDialog('alert', 'Warning', "Warning: Failed to cache concepts locally. Data is saved to Cloud only.");
      });
  };

  const handleCapture = (image: string) => {
    setCapturedImage(image);
    setRegenUltraQuality(false); 
    setCurrentSession(null); 
    
    if (settings.processingMode === 'fast') {
      processInBackground(image, selectedConcept!);
      setCurrentPage(AppState.FAST_THANKS);
    } else {
      setCurrentPage(AppState.GENERATING);
    }
  };

  // --- FAST MODE QUEUE IMPLEMENTATION ---
  const processInBackground = (base64Image: string, concept: Concept) => {
      const jobId = Date.now().toString();
      
      const newNotif: ProcessNotification = {
          id: jobId,
          thumbnail: concept.thumbnail,
          conceptName: concept.name,
          status: 'processing', 
          timestamp: Date.now()
      };
      setNotifications(prev => [newNotif, ...prev].slice(0, 5)); 

      aiQueue.add(async () => {
          console.log(`[Queue] Starting Job ${jobId} | Concept: ${concept.name}`);
          
          try {
            let originalId: string | null = null;
            if (settings.originalFolderId || settings.activeEventId) {
                try {
                    const origRes = await uploadToDrive(base64Image, {
                      conceptName: "ORIGINAL_CAPTURE",
                      eventName: settings.eventName,
                      eventId: settings.activeEventId,
                      folderId: settings.originalFolderId,
                      storage_folder: settings.storage_folder,
                      skipGallery: true 
                    });
                    if (origRes.ok) originalId = origRes.id;
                } catch(e) { console.warn("Background: Original upload failed"); }
            }

            if (settings.activeEventId) {
                const hasCredits = await decrementCredits(settings.activeEventId);
                if (!hasCredits) {
                    throw new Error("INSUFFICIENT CREDITS");
                }
            }

            const aiOutput = await generateAIImage(base64Image, concept, settings.outputRatio);

            if (settings.overlayImage) {
                 await OverlayCache.preloadOverlay(settings.overlayImage);
            }

            let targetWidth = 1080;
            let targetHeight = 1920;
            if (settings.outputRatio === '16:9') { targetWidth = 1920; targetHeight = 1080; }
            else if (settings.outputRatio === '3:2') { targetWidth = 1800; targetHeight = 1200; }
            else if (settings.outputRatio === '2:3') { targetWidth = 1200; targetHeight = 1800; }

            const finalImage = await applyOverlay(aiOutput, settings.overlayImage, targetWidth, targetHeight);

            const res = await uploadToDrive(finalImage, {
                conceptName: concept.name,
                eventName: settings.eventName,
                eventId: settings.activeEventId,
                folderId: settings.folderId,
                storage_folder: settings.storage_folder,
                originalId: originalId || undefined,
            });

            if (res.ok) {
                console.log(`[Queue] Job ${jobId} Completed`);
                setNotifications(prev => prev.map(n => n.id === jobId ? { ...n, status: 'completed' } : n));
                
                // Save session for Fast Mode too
                const directLink = getGoogleDriveDirectLink(res.id);
                await saveSessionToCloud({
                  sessionId: jobId,
                  eventId: settings.activeEventId,
                  resultImageUrl: directLink,
                  originalImageUrl: originalId ? getGoogleDriveDirectLink(originalId) : undefined
                });

                setTimeout(() => {
                    setNotifications(prev => prev.filter(n => n.id !== jobId));
                }, 10000);
            } else {
                throw new Error("Upload Failed");
            }

          } catch (e: any) {
            console.error(`[Queue] Job ${jobId} Failed:`, e);
            setNotifications(prev => prev.map(n => n.id === jobId ? { ...n, status: 'failed' } : n));
            setTimeout(() => {
                setNotifications(prev => prev.filter(n => n.id !== jobId));
            }, 10000);
          }
      }).catch((err) => {
          console.error("Queue Addition Error:", err);
      });
  };

  const renderPage = () => {
    switch (currentPage) {
      case AppState.LANDING:
        if (settings.enableVipMode) {
          return (
            <VipLandingPage 
               onStart={() => setCurrentPage(AppState.THEMES)} 
               onAdmin={(tab) => { if(tab) setAdminTab(tab); setCurrentPage(AppState.ADMIN); }} 
               settings={settings} 
               isVIPAdmin={isVIPAdmin} 
            />
          );
        }
        return <LandingPage onStart={() => setCurrentPage(AppState.THEMES)} onGallery={() => setCurrentPage(AppState.GALLERY)} onAdmin={(tab) => { if(tab) setAdminTab(tab); setCurrentPage(AppState.ADMIN); }} settings={settings} notifications={notifications} isVIPAdmin={isVIPAdmin} />;
      case AppState.THEMES:
        return (
          <ThemesPage 
            concepts={concepts} 
            onSelect={(c) => { setSelectedConcept(c); setCurrentPage(AppState.CAMERA); }} 
            onBack={() => setCurrentPage(AppState.LANDING)}
            onAdmin={(tab) => { if(tab) setAdminTab(tab); setCurrentPage(AppState.ADMIN); }}
          />
        );
      case AppState.CAMERA:
        return <CameraPage 
            onCapture={handleCapture} 
            onGenerate={() => {/* Handled in onCapture */}} 
            onBack={() => setCurrentPage(AppState.THEMES)} 
            capturedImage={capturedImage} 
            orientation={settings.orientation} 
            cameraRotation={settings.cameraRotation}
            aspectRatio={settings.outputRatio}
            settings={settings} 
            onUpdateSettings={handleUpdateSettings} 
        />;
      case AppState.GENERATING:
        return <ResultPage 
            capturedImage={capturedImage!} 
            concept={selectedConcept!} 
            settings={settings} 
            concepts={concepts} 
            onDone={handleReset} 
            onGallery={() => setCurrentPage(AppState.GALLERY)} 
            isUltraQuality={regenUltraQuality}
            existingSession={currentSession} 
        />;
      case AppState.FAST_THANKS:
        return <FastThanksPage onDone={handleReset} />;
      case AppState.GALLERY:
        return (
            <GalleryPage 
                onBack={() => setCurrentPage(AppState.LANDING)} 
                activeEventId={settings.activeEventId} 
                onRegenerate={handleRegenerate} 
                concepts={concepts} 
                settings={settings} 
                notifications={notifications}
                cachedItems={galleryCache} 
                onUpdateCache={setGalleryCache} 
            />
        );
      case AppState.ADMIN:
        return <AdminPage settings={settings} concepts={concepts} onSaveSettings={handleUpdateSettings} onSaveConcepts={handleUpdateConcepts} onBack={() => setCurrentPage(AppState.LANDING)} onLaunchMonitor={() => setCurrentPage(AppState.MONITOR)} initialTab={adminTab} isVIPAdmin={isVIPAdmin} />;
      case AppState.MONITOR:
        return <MonitorPage onBack={() => setCurrentPage(AppState.ADMIN)} activeEventId={settings.activeEventId} eventName={settings.eventName} monitorSize={settings.monitorImageSize} theme={settings.monitorTheme} />;
      default:
        return <LandingPage onStart={() => setCurrentPage(AppState.THEMES)} onGallery={() => setCurrentPage(AppState.GALLERY)} onAdmin={(tab) => { if(tab) setAdminTab(tab); setCurrentPage(AppState.ADMIN); }} settings={settings} notifications={notifications} isVIPAdmin={isVIPAdmin} />;
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-[#050505] flex flex-col items-center justify-start font-sans">
      
      {/* --- GLOBAL BACKGROUND VIDEO --- */}
      {settings.backgroundVideoUrl && settings.backgroundVideoUrl.trim() !== '' && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <video 
            src={settings.backgroundVideoUrl}
            autoPlay 
            loop 
            muted 
            playsInline
            className="w-full h-full object-cover" 
          />
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        </div>
      )}

      {/* --- GLOBAL BACKGROUND IMAGE (Fallback if no video) --- */}
      {(!settings.backgroundVideoUrl || settings.backgroundVideoUrl.trim() === '') && settings.backgroundImage && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img 
            src={getGoogleDriveDirectLink(settings.backgroundImage)} 
            className="w-full h-full object-cover" 
            alt="Global Background" 
          />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        </div>
      )}

      {/* Default Decorative Background */}
      {(!settings.backgroundVideoUrl || settings.backgroundVideoUrl.trim() === '') && !settings.backgroundImage && (
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20 z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-purple-600 blur-[150px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-blue-600 blur-[150px] rounded-full" />
        </div>
      )}

      <div className="relative z-10 w-full flex flex-col items-center flex-grow justify-center">
        {eventLoadStatus === 'loading' ? (
          <div className="flex flex-col items-center justify-center text-white h-full min-h-[50vh]">
            <div className="w-12 h-12 border-4 border-white/20 border-t-[#bc13fe] rounded-full animate-spin mb-4"></div>
            <p className="text-sm uppercase tracking-widest text-white/60">Loading Event...</p>
          </div>
        ) : eventLoadStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center text-white bg-black/60 p-10 rounded-2xl backdrop-blur-md border border-white/10 max-w-md text-center mt-20">
            <h2 className="text-2xl font-bold mb-4 text-red-400">Access Denied</h2>
            <p className="text-white/70 mb-8">Event not found or you don't have permission to access it. Please log in as the event owner.</p>
            <button 
              onClick={() => window.location.href = '/login'}
              className="px-8 py-3 bg-[#bc13fe] text-white rounded-full font-bold uppercase tracking-widest hover:bg-[#bc13fe]/80 transition-colors"
            >
              Go to Login
            </button>
          </div>
        ) : (
          renderPage()
        )}
      </div>
    </div>
  );
};

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isChecking, setIsChecking] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsChecking(false);
    };
    checkSession();
  }, []);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-[#bc13fe] rounded-full animate-spin mb-4"></div>
        <p className="text-white/50 text-sm font-mono tracking-widest uppercase">Verifying Session...</p>
      </div>
    );
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <TourProvider />
      <AuthGuard>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/superadmin" element={<SuperAdminDashboard />} />
          <Route path="/dashboard" element={<VendorDashboard />} />
          <Route path="/result/:sessionId" element={<GuestResultPage />} />
          <Route path="/app/:eventId/*" element={<PhotoboothFlow />} />
          <Route path="/admin/:eventId/*" element={<PhotoboothFlow />} />
          <Route path="/print-server/:eventId" element={<PrintServerPage />} />
          <Route path="/guestbook/:eventId/monitor" element={<GuestbookMonitor />} />
          <Route path="/guestbook/:eventId/guest" element={<GuestbookFlow />} />
          <Route path="/admin/:eventId/guestbook" element={<GuestbookAdmin />} />
        </Routes>
      </AuthGuard>
    </BrowserRouter>
  );
};

export default App;
