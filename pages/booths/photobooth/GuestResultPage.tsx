import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchSessionFromCloud } from '../../../lib/appsScript';
import { Download, Image as ImageIcon, Video, Loader2 } from 'lucide-react';

export default function GuestResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const eventNameFromUrl = searchParams.get('n');
  const eventDescFromUrl = searchParams.get('d');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<{
    resultImageUrl?: string;
    resultVideoUrl?: string;
    isVideoRequested?: boolean;
    eventName?: string;
    eventDescription?: string;
  } | null>(null);

  const sessionDataRef = React.useRef(sessionData);
  useEffect(() => {
    sessionDataRef.current = sessionData;
  }, [sessionData]);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      if (!sessionId) return;
      try {
        const res = await fetchSessionFromCloud(sessionId);
        if (isMounted) {
          if (res.success && res.data) {
            setSessionData(res.data);
          } else {
            setError("Sesi tidak ditemukan atau masih diproses.");
          }
        }
      } catch (err) {
        if (isMounted) setError("Gagal mengambil data sesi.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadSession();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    // Auto-refresh every 5 seconds if video is requested but not yet available
    const interval = setInterval(async () => {
      const currentData = sessionDataRef.current;
      if (currentData && currentData.isVideoRequested && !currentData.resultVideoUrl) {
        try {
          const res = await fetchSessionFromCloud(sessionId);
          if (res.success && res.data) {
            setSessionData(res.data);
          }
        } catch (err) {
          console.error("Interval fetch error:", err);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const handleDownload = async (url: string, filename: string) => {
    try {
      // For Supabase storage URLs, we can use the built-in download parameter
      // which forces the browser to download instead of opening the file
      let downloadUrl = url;
      if (url.includes('supabase.co/storage/v1/object/public/')) {
        const separator = url.includes('?') ? '&' : '?';
        downloadUrl = `${url}${separator}download=${encodeURIComponent(filename)}`;
        
        // On iOS Safari, direct navigation to a download URL works best
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (isIOS) {
          window.location.href = downloadUrl;
          return;
        }
      }

      // Standard fetch approach for other browsers/URLs
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // Fallback: open in new tab if fetch fails (e.g., CORS)
      // Note: This might be blocked by popup blockers on iOS if not triggered directly by user action
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin text-[#bc13fe] mb-4" />
        <p className="text-xl font-heading tracking-wider">MENCARI DATA SESI...</p>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-white p-6 text-center">
        <div className="glass-card p-8 rounded-2xl border border-red-500/30 max-w-md w-full">
          <p className="text-red-400 text-xl font-heading mb-2">ERROR</p>
          <p className="text-gray-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-5xl font-heading font-bold neon-text mb-2">
            {eventNameFromUrl || sessionData.eventName || 'YOUR DIGITAL ART'}
          </h1>
          <p className="text-gray-400 tracking-widest text-sm md:text-base">
            {eventDescFromUrl || sessionData.eventDescription || 'COROAI PHOTOBOOTH'}
          </p>
        </div>

        <div className={`grid grid-cols-1 ${sessionData.isVideoRequested || sessionData.resultVideoUrl ? 'md:grid-cols-2' : 'max-w-md mx-auto'} gap-8`}>
          {/* Image Section */}
          <div className="glass-card rounded-3xl p-6 flex flex-col items-center border border-[#bc13fe]/30">
            <div className="flex items-center gap-2 mb-4 w-full">
              <ImageIcon className="w-5 h-5 text-[#bc13fe]" />
              <h2 className="text-xl font-heading font-bold">AI PHOTO</h2>
            </div>
            
            {sessionData.resultImageUrl ? (
              <>
                <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-black/50 mb-6">
                  <img 
                    src={sessionData.resultImageUrl} 
                    alt="AI Result" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <button 
                  onClick={() => handleDownload(sessionData.resultImageUrl!, `CoroAI_Photo_${sessionId}.jpg`)}
                  className="w-full py-4 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  DOWNLOAD PHOTO
                </button>
              </>
            ) : (
              <div className="w-full aspect-[3/4] rounded-xl bg-black/50 flex flex-col items-center justify-center text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p>Processing Photo...</p>
              </div>
            )}
          </div>

          {/* Video Section (Only if requested or exists) */}
          {(sessionData.isVideoRequested || sessionData.resultVideoUrl) && (
            <div className="glass-card rounded-3xl p-6 flex flex-col items-center border border-[#bc13fe]/30">
              <div className="flex items-center gap-2 mb-4 w-full">
                <Video className="w-5 h-5 text-[#bc13fe]" />
                <h2 className="text-xl font-heading font-bold">AI VIDEO</h2>
              </div>
              
              {sessionData.resultVideoUrl ? (
                <>
                  <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-black/50 mb-6">
                    <video 
                      src={sessionData.resultVideoUrl} 
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <button 
                    onClick={() => handleDownload(sessionData.resultVideoUrl!, `CoroAI_Video_${sessionId}.mp4`)}
                    className="w-full py-4 bg-transparent border-2 border-[#bc13fe] text-[#bc13fe] hover:bg-[#bc13fe] hover:text-white rounded-xl font-bold tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    DOWNLOAD VIDEO
                  </button>
                </>
              ) : (
                <div className="w-full aspect-[3/4] rounded-xl bg-black/50 flex flex-col items-center justify-center text-gray-500 border border-dashed border-gray-700">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <p className="text-center px-4">Video is being generated...<br/>This page will refresh automatically.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
