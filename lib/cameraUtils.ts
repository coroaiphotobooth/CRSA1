import { PhotoboothSettings } from '../types';

export const prewarmCamera = async (settings: PhotoboothSettings) => {
    // Skip if already warming or warmed
    if ((window as any).__GLOBAL_MEDIA_STREAM__) return;
    
    try {
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
        (window as any).__GLOBAL_MEDIA_STREAM__ = mediaStream;
        console.log("⚡ Camera Pre-Warmed Successfully (Global Stream Ready)");
    } catch (err) {
        console.warn("⚡ Camera Pre-Warm Failed or Denied:", err);
    }
};

export const getPrewarmedStream = (): MediaStream | null => {
    return (window as any).__GLOBAL_MEDIA_STREAM__ || null;
};

export const releasePrewarmedStream = () => {
    const stream = (window as any).__GLOBAL_MEDIA_STREAM__ as MediaStream;
    if (stream) {
        stream.getTracks().forEach(track => {
            track.stop();
            stream.removeTrack(track);
        });
        (window as any).__GLOBAL_MEDIA_STREAM__ = null;
    }
};
