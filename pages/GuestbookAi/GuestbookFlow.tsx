import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Concept, PhotoboothSettings } from '../../types';
import { fetchSettings, fetchEvents, uploadToDrive, saveSessionToCloud, createSessionFolder } from '../../lib/appsScript';
import { generateAIImage } from '../../lib/gemini';
import { applyOverlay, getGoogleDriveDirectLink } from '../../lib/imageUtils';
import { supabase } from '../../lib/supabase';
import { Loader2 } from 'lucide-react';
import GuestbookLanding from './GuestbookLanding';
import ThemesPage from '../booths/photobooth/ThemesPage';
import CameraPage from '../booths/photobooth/CameraPage';
import GuestbookResult from './GuestbookResult';
import { DEFAULT_SETTINGS, DEFAULT_CONCEPTS } from '../../constants';

enum GuestbookState {
  LANDING = 'LANDING',
  THEMES = 'THEMES',
  CAMERA = 'CAMERA',
  GENERATING = 'GENERATING',
  RESULT = 'RESULT',
  DONE = 'DONE'
}

const GuestbookFlow: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  
  const [currentState, setCurrentState] = useState<GuestbookState>(GuestbookState.LANDING);
  const [settings, setSettings] = useState<PhotoboothSettings>(DEFAULT_SETTINGS);
  const [concepts, setConcepts] = useState<Concept[]>(DEFAULT_CONCEPTS);
  const [isLoading, setIsLoading] = useState(true);
  
  // Guest Data
  const [guestName, setGuestName] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const loadEventData = async () => {
      if (!eventId) return;
      try {
        const { data: eventData, error } = await supabase
          .from('events')
          .select('*, concepts(*)')
          .eq('id', eventId)
          .single();

        if (error) throw error;

        if (eventData) {
          setSettings({ ...DEFAULT_SETTINGS, ...eventData.settings, activeEventId: eventId });
          if (eventData.concepts && eventData.concepts.length > 0) {
            setConcepts(eventData.concepts);
          }
        }
      } catch (err) {
        console.error("Failed to load event data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadEventData();
  }, [eventId]);

  const handleLandingNext = (name: string, message: string) => {
    setGuestName(name);
    setGuestMessage(message);
    setCurrentState(GuestbookState.THEMES);
  };

  const handleConceptSelect = (concept: Concept) => {
    setSelectedConcept(concept);
    setCurrentState(GuestbookState.CAMERA);
  };

  const handleCapture = async (imageSrc: string) => {
    setCapturedImage(imageSrc);
    setCurrentState(GuestbookState.GENERATING);

    try {
      if (!selectedConcept) throw new Error("No concept selected");
      
      // Generate AI Image
      const aiResultBase64 = await generateAIImage(
        imageSrc,
        selectedConcept,
        settings.outputRatio,
        false
      );

      // Apply Overlay
      const targetWidth = settings.outputRatio === '16:9' ? 1920 : settings.outputRatio === '3:2' ? 1800 : 1080;
      const targetHeight = settings.outputRatio === '16:9' ? 1080 : settings.outputRatio === '3:2' ? 1200 : 1920;
      const finalImageBase64 = await applyOverlay(
        aiResultBase64,
        settings.overlayImage,
        targetWidth,
        targetHeight
      );

      // Save to Cloud
      const sessionRes = await createSessionFolder(eventId);
      const newSessionId = sessionRes.folderId || `gb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setSessionId(newSessionId);

      const originalUploadTask = uploadToDrive(imageSrc, {
        conceptName: "ORIGINAL_CAPTURE",
        eventName: settings.eventName,
        eventId: eventId,
        folderId: newSessionId,
        storage_folder: settings.storage_folder
      });

      const uploadRes = await uploadToDrive(finalImageBase64, {
        conceptName: selectedConcept.name,
        eventName: settings.eventName,
        eventId: eventId,
        folderId: newSessionId,
        storage_folder: settings.storage_folder,
        sessionFolderId: newSessionId
      });

      const originalRes = await originalUploadTask;
      
      if (uploadRes.ok) {
        const resultUrl = getGoogleDriveDirectLink(uploadRes.id);
        const originalUrl = originalRes.id ? getGoogleDriveDirectLink(originalRes.id) : undefined;
        
        await saveSessionToCloud({
          sessionId: newSessionId,
          eventId: eventId,
          resultImageUrl: resultUrl,
          originalImageUrl: originalUrl
        });

        // Update Supabase Sessions with Guestbook data
        await supabase.from('sessions').update({
          guest_name: guestName,
          guest_message: guestMessage,
          is_posted_to_wall: false
        }).eq('id', newSessionId);

        setResultImageUrl(resultUrl);
        setCurrentState(GuestbookState.RESULT);
      } else {
        throw new Error("Failed to upload image");
      }

    } catch (error) {
      console.error("Generation failed:", error);
      alert("Failed to generate image. Please try again.");
      setCurrentState(GuestbookState.CAMERA);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#bc13fe] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      {currentState === GuestbookState.LANDING && (
        <GuestbookLanding 
          settings={settings} 
          onNext={handleLandingNext} 
        />
      )}

      {currentState === GuestbookState.THEMES && (
        <ThemesPage 
          concepts={concepts}
          onSelect={handleConceptSelect}
          onBack={() => setCurrentState(GuestbookState.LANDING)}
        />
      )}

      {currentState === GuestbookState.CAMERA && (
        <CameraPage 
          onCapture={handleCapture}
          onGenerate={() => {}}
          onBack={() => setCurrentState(GuestbookState.THEMES)}
          capturedImage={capturedImage}
          orientation={settings.orientation}
          cameraRotation={settings.cameraRotation}
          aspectRatio={settings.outputRatio}
          settings={settings}
        />
      )}

      {currentState === GuestbookState.GENERATING && (
        <div className="min-h-screen flex flex-col items-center justify-center text-white p-6 text-center">
          <Loader2 className="w-16 h-16 text-[#bc13fe] animate-spin mb-6" />
          <h2 className="text-2xl font-bold mb-2">Creating your memory...</h2>
          <p className="text-gray-400">Our AI is processing your photo</p>
        </div>
      )}

      {currentState === GuestbookState.RESULT && resultImageUrl && sessionId && (
        <GuestbookResult 
          sessionId={sessionId}
          imageUrl={resultImageUrl}
          guestName={guestName}
          guestMessage={guestMessage}
          onPostSuccess={() => setCurrentState(GuestbookState.DONE)}
        />
      )}

      {currentState === GuestbookState.DONE && (
        <div className="min-h-screen flex flex-col items-center justify-center text-white p-6 text-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-4">Thank You!</h2>
          <p className="text-gray-400 mb-8">Your photo and message have been posted to the Social Wall.</p>
          <button
            onClick={() => {
              setGuestName('');
              setGuestMessage('');
              setCapturedImage(null);
              setResultImageUrl(null);
              setSessionId(null);
              setCurrentState(GuestbookState.LANDING);
            }}
            className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-colors"
          >
            Take Another Photo
          </button>
        </div>
      )}
    </div>
  );
};

export default GuestbookFlow;
