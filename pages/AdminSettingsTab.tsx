import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PhotoboothSettings, AspectRatio, MonitorTheme } from '../types';
import { 
  uploadOverlayToGas, 
  uploadBackgroundToGas,
  saveSettingsToGas 
} from '../lib/appsScript';
import { getGoogleDriveDirectLink } from '../lib/imageUtils';
import { supabase } from '../lib/supabase';
import { useDialog } from '../components/DialogProvider';

interface AdminSettingsTabProps {
  settings: PhotoboothSettings;
  onSaveSettings: (settings: PhotoboothSettings) => void;
  gasUrl: string;
}

const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({ settings, onSaveSettings, gasUrl }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const { eventId } = useParams<{ eventId: string }>();
  const [isUploadingOverlay, setIsUploadingOverlay] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingBackgroundVideo, setIsUploadingBackgroundVideo] = useState(false);
  const { showDialog } = useDialog();

  const overlayInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const backgroundVideoInputRef = useRef<HTMLInputElement>(null);

  const PREDEFINED_VIDEOS = [
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%201.mp4",
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%202.mp4",
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%203.mp4",
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%204.mp4",
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%205.mp4",
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%206.mp4",
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%207.mp4",
    "https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO%20BACKGROUND/VIDEO%208.mp4"
  ];

  useEffect(() => {
    setLocalSettings(prev => {
      const merged = { ...settings };
      if (merged.cameraRotation === undefined) merged.cameraRotation = 0;
      if (!merged.selectedModel) merged.selectedModel = 'gemini-3.1-flash-image-preview';
      if (!merged.outputRatio) merged.outputRatio = '9:16';
      if (merged.folderId === undefined) merged.folderId = '';
      if (merged.originalFolderId === undefined) merged.originalFolderId = '';
      if (merged.spreadsheetId === undefined) merged.spreadsheetId = '';
      if (merged.videoPrompt === undefined) merged.videoPrompt = 'Cinematic slow motion, subtle movement, 4k high quality, looping background';
      if (merged.boothMode === undefined) merged.boothMode = 'video';
      if (!merged.monitorImageSize) merged.monitorImageSize = 'medium';
      if (!merged.monitorTheme) merged.monitorTheme = 'physics';
      if (!merged.adminPin) merged.adminPin = '1234';
      if (!merged.gptModelSize) merged.gptModelSize = '1024';
      if (!merged.processingMode) merged.processingMode = 'normal';
      if (!merged.videoResolution) merged.videoResolution = '480p';
      if (!merged.videoModel) merged.videoModel = 'seedance-1-0-pro-fast-251015';
      if (merged.backgroundVideoUrl === undefined) merged.backgroundVideoUrl = null;
      if (merged.promptMode === undefined) merged.promptMode = 'wrapped';
      if (merged.enableModelShortcut === undefined) merged.enableModelShortcut = false;
      if (merged.enablePrint === undefined) merged.enablePrint = false;
      return merged;
    });
  }, [settings]);

  const handleSaveSettings = async () => {
    localStorage.setItem('APPS_SCRIPT_BASE_URL', gasUrl);
    // Jalankan onSaveSettings dulu (Simpan ke LocalStorage aplikasi)
    onSaveSettings(localSettings);
    
    if (eventId) {
      try {
        const { error } = await supabase
          .from('events')
          .update({ 
            settings: localSettings,
            name: localSettings.eventName,
            description: localSettings.eventDescription
          })
          .eq('id', eventId);
          
        if (error) throw error;
        await showDialog('alert', 'Success', 'Settings saved locally and synced to Database.');
      } catch (err) {
        console.error("Supabase save error:", err);
        await showDialog('alert', 'Warning', 'Settings saved LOCALLY. Supabase sync failed.');
      }
    } else {
      const ok = await saveSettingsToGas(localSettings, settings.adminPin);
      if (ok) {
        await showDialog('alert', 'Success', 'Settings saved locally and synced to Cloud.');
      } else {
        await showDialog('alert', 'Warning', 'Settings saved LOCALLY. Cloud sync failed, but data is safe on this machine.');
      }
    }
  };

  const handleRatioChange = (ratio: AspectRatio) => {
    const isPortrait = ratio === '9:16' || ratio === '2:3';
    setLocalSettings(prev => ({
      ...prev,
      outputRatio: ratio,
      orientation: isPortrait ? 'portrait' : 'landscape'
    }));
  };

  const handleMonitorThemeChange = (theme: MonitorTheme) => {
    setLocalSettings(prev => ({ ...prev, monitorTheme: theme }));
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="flex flex-col gap-8">
          {/* Global Identity */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 h-fit backdrop-blur-md bg-black/60 rounded-xl border border-white/10 tour-global-identity">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Global Identity</h3>
            
            {/* Event Identity Inputs */}
            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Event Name</label>
              <input 
                className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-[#bc13fe] outline-none transition-colors rounded-lg" 
                value={localSettings.eventName || ''} 
                onChange={e => setLocalSettings({...localSettings, eventName: e.target.value})}
              />
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Event Description</label>
              <input 
                className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-[#bc13fe] outline-none transition-colors rounded-lg" 
                value={localSettings.eventDescription || ''} 
                onChange={e => setLocalSettings({...localSettings, eventDescription: e.target.value})}
              />
            </div>

            {/* BOOTH MODE & PROCESSING MODE */}
            <div className="flex flex-col gap-4 bg-[#bc13fe]/10 p-5 rounded-lg border border-[#bc13fe]/20">
              
              {/* Booth Mode Selector */}
              <div className="flex flex-col gap-2">
                 <label className="text-[10px] text-[#bc13fe] uppercase tracking-widest font-bold">BOOTH MODE</label>
                 <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setLocalSettings({...localSettings, boothMode: 'photo'})}
                      className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.boothMode === 'photo' ? 'bg-pink-600 text-white shadow-lg border-pink-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">PHOTOBOOTH MODE</span>
                      <span className="text-[8px] opacity-60">Photos Only</span>
                    </button>
                    <button
                      onClick={() => setLocalSettings({...localSettings, boothMode: 'video'})}
                      className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.boothMode === 'video' ? 'bg-blue-600 text-white shadow-lg border-blue-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">VIDEOBOOTH MODE</span>
                      <span className="text-[8px] opacity-60">Photos + Video</span>
                    </button>
                 </div>
              </div>

              <div className="h-px bg-white/10 w-full my-1"></div>

              {/* Processing Mode Toggle */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[#bc13fe] uppercase tracking-widest font-bold">Kiosk Processing Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLocalSettings({...localSettings, processingMode: 'normal'})}
                    className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.processingMode === 'normal' ? 'bg-[#bc13fe] text-white shadow-lg border-[#bc13fe]' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                  >
                     <span className="font-bold">NORMAL MODE</span>
                     <span className="text-[8px] opacity-60">Instant Preview</span>
                  </button>
                  <button
                    onClick={() => setLocalSettings({...localSettings, processingMode: 'fast'})}
                    className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.processingMode === 'fast' ? 'bg-green-600 text-white shadow-lg border-green-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                  >
                     <span className="font-bold">FAST MODE</span>
                     <span className="text-[8px] opacity-60">Background Queue</span>
                  </button>
                </div>
              </div>
              
              <p className="text-[9px] text-gray-400 mt-1 italic leading-relaxed">
                * <strong>Photobooth Mode:</strong> No video generation buttons.<br/>
                * <strong>Videobooth Mode (Fast):</strong> "Generate Video" button moves to Gallery.
              </p>
            </div>
          </div>

          {/* AI Model Config */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 h-fit backdrop-blur-md bg-black/60 rounded-xl border border-white/10 tour-ai-model">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">AI Model Configuration</h3>
            
            {/* Prompt Mode Selector */}
            <div className="flex flex-col gap-2 bg-[#bc13fe]/10 p-4 rounded border border-[#bc13fe]/20">
                 <label className="text-[10px] text-[#bc13fe] uppercase tracking-widest font-bold">Prompt Mode</label>
                 <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setLocalSettings({...localSettings, promptMode: 'wrapped'})}
                      className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.promptMode === 'wrapped' ? 'bg-[#bc13fe] text-white shadow-lg border-[#bc13fe]' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">OPTIMAL</span>
                      <span className="text-[8px] opacity-60 text-center">Face lock<br/>using simple prompt</span>
                    </button>
                    <button
                      onClick={() => setLocalSettings({...localSettings, promptMode: 'booth'})}
                      className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.promptMode === 'booth' ? 'bg-pink-600 text-white shadow-lg border-pink-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">BOOTH</span>
                      <span className="text-[8px] opacity-60">Outfit Swap</span>
                    </button>
                    <button
                      onClick={() => setLocalSettings({...localSettings, promptMode: 'raw'})}
                      className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.promptMode === 'raw' ? 'bg-orange-600 text-white shadow-lg border-orange-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">RAW</span>
                      <span className="text-[8px] opacity-60">Creative</span>
                    </button>
                 </div>
                 <p className="text-[9px] text-gray-500 mt-1 italic">
                    * <strong>Optimal:</strong> Face lock using simple prompt. <br/>
                    * <strong>Booth:</strong> Force outfit swap + face lock (Best for Ref Image). <br/>
                    * <strong>Raw:</strong> Direct prompt (Riskier).
                 </p>
            </div>

            {/* Quick Model Shortcut Toggle (NEW) */}
            <div className="flex items-center justify-between bg-white/5 p-4 rounded border border-white/10">
             </div>

             {/* Print Feature Toggle (NEW) */}
             <div className="flex items-center justify-between bg-white/5 p-4 rounded border border-white/10">
                <div className="flex flex-col">
                    <label className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">Enable Direct Printing</label>
                    <span className="text-[8px] text-gray-500">Show Print button in Result and Gallery screens</span>
                </div>
                <div className="flex items-center">
                 <input 
                   type="checkbox" 
                   className="w-5 h-5 accent-cyan-600 cursor-pointer"
                   checked={localSettings.enablePrint ?? false}
                   onChange={e => setLocalSettings({...localSettings, enablePrint: e.target.checked})}
                 />
               </div>
             </div>
          </div>

          {/* Video Settings */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 h-fit backdrop-blur-md bg-black/60 rounded-xl border border-white/10 tour-video-settings">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Video Setting</h3>
            
            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Video Resolution</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setLocalSettings({...localSettings, videoResolution: '480p'})}
                  className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.videoResolution === '480p' ? 'bg-[#bc13fe] text-white shadow-lg border-[#bc13fe]' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                >
                   <span className="font-bold">480p (FAST)</span>
                </button>
                <button
                  onClick={() => setLocalSettings({...localSettings, videoResolution: '720p'})}
                  className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.videoResolution === '720p' ? 'bg-blue-600 text-white shadow-lg border-blue-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                >
                   <span className="font-bold">720p (STANDARD)</span>
                </button>
              </div>
              <p className="text-[9px] text-gray-500">* 480p is faster. 720p provides better quality but takes longer.</p>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Video Prompt</label>
              <textarea 
                className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-[#bc13fe] outline-none transition-colors h-24 rounded-lg" 
                value={localSettings.videoPrompt || ''} 
                onChange={e => setLocalSettings({...localSettings, videoPrompt: e.target.value})}
                placeholder="Describe motion (e.g. slow motion, subtle movement...)"
                disabled={localSettings.boothMode === 'photo'}
              />
              {localSettings.boothMode === 'photo' && <p className="text-[9px] text-red-500 italic">* Disabled in Photobooth Mode</p>}
            </div>
          </div>

          {/* Output Config */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 h-fit backdrop-blur-md bg-black/60 rounded-xl border border-white/10 tour-output-config">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Output Configuration</h3>
            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Output Aspect Ratio</label>
              <div className="grid grid-cols-2 gap-3">
                {(['9:16', '16:9', '2:3', '3:2'] as AspectRatio[]).map(r => (
                  <button
                    key={r}
                    onClick={() => handleRatioChange(r)}
                    className={`py-4 border border-white/10 rounded font-mono text-xs transition-all flex flex-col items-center gap-1 ${localSettings.outputRatio === r ? 'bg-[#bc13fe] text-white shadow-lg border-[#bc13fe]' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                  >
                    <span className="text-sm font-bold">{r}</span>
                    <span className="text-[8px] opacity-70 uppercase">
                      {r === '9:16' ? 'Portrait' : r === '16:9' ? 'Landscape' : r === '2:3' ? 'Photo Portrait' : 'Photo Landscape'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Assets Column */}
        <div className="flex flex-col gap-8">
          {/* Overlay Asset */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit text-center backdrop-blur-md bg-black/60 rounded-xl tour-overlay">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Overlay (PNG)</h3>
            <div className="flex flex-col gap-6">
              <div 
                className="bg-white/5 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden mx-auto shadow-2xl transition-all duration-300"
                style={{
                  width: '180px',
                  aspectRatio: localSettings.outputRatio === '16:9' ? '16/9' : localSettings.outputRatio === '3:2' ? '3/2' : localSettings.outputRatio === '2:3' ? '2/3' : '9/16'
                }}
              >
                {localSettings.overlayImage ? (
                  <img src={getGoogleDriveDirectLink(localSettings.overlayImage)} className="w-full h-full object-contain" alt="Overlay" />
                ) : <span className="text-[10px] text-gray-700 font-mono">NO_OVERLAY</span>}
              </div>
              <input type="file" accept="image/png" className="hidden" ref={overlayInputRef} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setIsUploadingOverlay(true);
                
                if (eventId) {
                  const fileExt = file.name.split('.').pop();
                  const folderName = localSettings.storage_folder || eventId;
                  const fileName = `${folderName}/assets/overlay-${Date.now()}.${fileExt}`;
                  
                  const { data, error } = await supabase.storage
                    .from('photobooth')
                    .upload(fileName, file, { upsert: true });
                    
                  if (error) {
                    console.error("Error uploading overlay:", error);
                    await showDialog('alert', 'Error', 'Failed to upload overlay to Database.');
                  } else {
                    const { data: { publicUrl } } = supabase.storage
                      .from('photobooth')
                      .getPublicUrl(fileName);
                    setLocalSettings({...localSettings, overlayImage: publicUrl});
                    await showDialog('alert', 'Success', 'Overlay updated');
                  }
                  setIsUploadingOverlay(false);
                } else {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const res = await uploadOverlayToGas(reader.result as string, settings.adminPin);
                    if (res.ok) {
                      setLocalSettings({...localSettings, overlayImage: res.url});
                      await showDialog('alert', 'Success', 'Overlay updated');
                    } else {
                      await showDialog('alert', 'Error', 'Failed to upload overlay to GAS.');
                    }
                    setIsUploadingOverlay(false);
                  };
                  reader.readAsDataURL(file);
                }
              }} />
              <button onClick={() => overlayInputRef.current?.click()} disabled={isUploadingOverlay} className="w-full py-4 border-2 border-white/10 hover:border-[#bc13fe] text-[10px] tracking-widest font-bold uppercase bg-white/5 rounded-lg transition-colors">
                {isUploadingOverlay ? 'UPLOADING...' : 'CHANGE PNG OVERLAY'}
              </button>
              {localSettings.overlayImage && (
                <button onClick={() => setLocalSettings({...localSettings, overlayImage: null})} className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase bg-transparent rounded-lg transition-colors">
                  REMOVE OVERLAY
                </button>
              )}
            </div>
          </div>

          {/* Background Asset (Image/Video) */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit text-center backdrop-blur-md bg-black/60 rounded-xl tour-background">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Background</h3>
            
            {/* Video Templates */}
            <div className="flex flex-col gap-2 bg-white/5 p-3 rounded border border-white/10">
              <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Video Templates</label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {PREDEFINED_VIDEOS.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLocalSettings({...localSettings, backgroundVideoUrl: url})}
                    className={`aspect-video rounded overflow-hidden border-2 transition-colors ${localSettings.backgroundVideoUrl === url ? 'border-[#bc13fe]' : 'border-transparent hover:border-white/30'}`}
                  >
                    <video src={url} className="w-full h-full object-cover" muted playsInline />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="w-full aspect-video bg-white/5 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden mx-auto shadow-2xl relative">
                {localSettings.backgroundVideoUrl ? (
                   <video src={localSettings.backgroundVideoUrl} className="w-full h-full object-cover opacity-70" autoPlay loop muted playsInline />
                ) : localSettings.backgroundImage ? (
                  <img src={getGoogleDriveDirectLink(localSettings.backgroundImage)} className="w-full h-full object-cover" alt="Background" />
                ) : <span className="text-[10px] text-gray-700 font-mono">DEFAULT_DARK</span>}
                
                {localSettings.backgroundVideoUrl && <div className="absolute top-2 right-2 bg-[#bc13fe] px-2 py-1 rounded text-[8px] font-bold">VIDEO MODE</div>}
              </div>
              
              {/* Image Upload */}
              <input type="file" accept="image/jpeg,image/png" className="hidden" ref={backgroundInputRef} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                // Max 2MB for image
                if (file.size > 2 * 1024 * 1024) {
                  await showDialog('alert', 'Error', 'Image file size exceeds 2MB limit.');
                  return;
                }

                setIsUploadingBackground(true);
                
                if (eventId) {
                  const fileExt = file.name.split('.').pop();
                  const folderName = localSettings.storage_folder || eventId;
                  const fileName = `${folderName}/assets/background-${Date.now()}.${fileExt}`;
                  
                  const { data, error } = await supabase.storage
                    .from('photobooth')
                    .upload(fileName, file, { upsert: true });
                    
                  if (error) {
                    console.error("Error uploading background:", error);
                    await showDialog('alert', 'Error', 'Failed to upload background to Database.');
                  } else {
                    const { data: { publicUrl } } = supabase.storage
                      .from('photobooth')
                      .getPublicUrl(fileName);
                    setLocalSettings({...localSettings, backgroundImage: publicUrl, backgroundVideoUrl: null});
                    await showDialog('alert', 'Success', 'Background Image updated');
                  }
                  setIsUploadingBackground(false);
                } else {
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const res = await uploadBackgroundToGas(reader.result as string, settings.adminPin);
                    if (res.ok) {
                      setLocalSettings({...localSettings, backgroundImage: res.url, backgroundVideoUrl: null});
                      await showDialog('alert', 'Success', 'Background Image updated');
                    } else {
                      await showDialog('alert', 'Error', 'Failed to upload background to GAS.');
                    }
                    setIsUploadingBackground(false);
                  };
                  reader.readAsDataURL(file);
                }
              }} />

              {/* Video Upload */}
              <input type="file" accept="video/mp4,video/webm" className="hidden" ref={backgroundVideoInputRef} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                // Max 8MB for video
                if (file.size > 8 * 1024 * 1024) {
                  await showDialog('alert', 'Error', 'Video file size exceeds 8MB limit.');
                  return;
                }

                // Check duration
                const videoElement = document.createElement('video');
                videoElement.preload = 'metadata';
                videoElement.onloadedmetadata = async () => {
                  window.URL.revokeObjectURL(videoElement.src);
                  if (videoElement.duration > 15) {
                    await showDialog('alert', 'Error', 'Video duration exceeds 15 seconds limit.');
                    return;
                  }

                  setIsUploadingBackgroundVideo(true);
                  
                  if (eventId) {
                    const fileExt = file.name.split('.').pop();
                    const folderName = localSettings.storage_folder || eventId;
                    const fileName = `${folderName}/assets/background-video-${Date.now()}.${fileExt}`;
                    
                    const { data, error } = await supabase.storage
                      .from('photobooth')
                      .upload(fileName, file, { upsert: true });
                      
                    if (error) {
                      console.error("Error uploading background video:", error);
                      await showDialog('alert', 'Error', 'Failed to upload background video to Database.');
                    } else {
                      const { data: { publicUrl } } = supabase.storage
                        .from('photobooth')
                        .getPublicUrl(fileName);
                      setLocalSettings({...localSettings, backgroundVideoUrl: publicUrl});
                      await showDialog('alert', 'Success', 'Background Video updated');
                    }
                    setIsUploadingBackgroundVideo(false);
                  } else {
                    await showDialog('alert', 'Error', 'Video upload requires an active event.');
                    setIsUploadingBackgroundVideo(false);
                  }
                };
                videoElement.src = URL.createObjectURL(file);
              }} />

              <div className="flex flex-col gap-2">
                <button onClick={() => backgroundInputRef.current?.click()} disabled={isUploadingBackground || isUploadingBackgroundVideo} className="w-full py-4 border-2 border-white/10 hover:border-[#bc13fe] text-[10px] tracking-widest font-bold uppercase bg-white/5 rounded-lg transition-colors">
                  {isUploadingBackground ? 'UPLOADING IMAGE...' : 'UPLOAD IMAGE BACKGROUND (MAX 2MB)'}
                </button>
                <button onClick={() => backgroundVideoInputRef.current?.click()} disabled={isUploadingBackground || isUploadingBackgroundVideo} className="w-full py-4 border-2 border-white/10 hover:border-[#bc13fe] text-[10px] tracking-widest font-bold uppercase bg-white/5 rounded-lg transition-colors">
                  {isUploadingBackgroundVideo ? 'UPLOADING VIDEO...' : 'UPLOAD VIDEO BACKGROUND (MAX 8MB, 15s)'}
                </button>
              </div>

              {localSettings.backgroundImage && !localSettings.backgroundVideoUrl && (
                <button onClick={() => setLocalSettings({...localSettings, backgroundImage: null})} className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase bg-transparent rounded-lg transition-colors">
                  REMOVE IMAGE BACKGROUND
                </button>
              )}
              {localSettings.backgroundVideoUrl && (
                <button onClick={() => setLocalSettings({...localSettings, backgroundVideoUrl: null})} className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase bg-transparent rounded-lg transition-colors">
                  REMOVE VIDEO BACKGROUND
                </button>
              )}
            </div>
          </div>

          {/* Camera Config */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit backdrop-blur-md bg-black/60 rounded-xl tour-camera-config">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Camera Configuration</h3>
            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Webcam Rotation</label>
              <div className="grid grid-cols-4 gap-3">
                {[0, 90, 180, 270].map(deg => (
                  <button
                    key={deg}
                    onClick={() => setLocalSettings({...localSettings, cameraRotation: deg})}
                    className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase ${localSettings.cameraRotation === deg ? 'bg-[#bc13fe] text-white shadow-lg border-[#bc13fe]' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between bg-white/5 p-4 rounded border border-white/10">
               <div className="flex flex-col">
                   <label className="text-[10px] text-orange-400 uppercase tracking-widest font-bold">Mirror Preview Camera</label>
                   <span className="text-[8px] text-gray-500">Flips the camera preview horizontally</span>
               </div>
               <div className="flex items-center">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-orange-600 cursor-pointer"
                  checked={localSettings.mirrorCamera ?? true}
                  onChange={e => setLocalSettings({...localSettings, mirrorCamera: e.target.checked})}
                />
              </div>
            </div>
          </div>

          {/* Monitor Config */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit backdrop-blur-md bg-black/60 rounded-xl tour-output-monitor">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Monitor Config</h3>
            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Monitor Theme Layout</label>
              <div className="grid grid-cols-4 gap-2">
                {(['physics', 'grid', 'hero', 'slider'] as MonitorTheme[]).map(t => (
                  <button
                    key={t}
                    onClick={() => handleMonitorThemeChange(t)}
                    className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase ${localSettings.monitorTheme === t ? 'bg-[#bc13fe] text-white shadow-lg border-[#bc13fe]' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Physics Card Size (Only for Physics Mode)</label>
              <div className="grid grid-cols-3 gap-3">
                {(['small', 'medium', 'large'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setLocalSettings({...localSettings, monitorImageSize: s})}
                    className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase ${localSettings.monitorImageSize === s ? 'bg-[#bc13fe] text-white shadow-lg border-[#bc13fe]' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="flex justify-center mt-8">
        <button onClick={handleSaveSettings} className="px-20 py-6 bg-green-800 hover:bg-green-700 text-white font-heading tracking-widest uppercase italic transition-all rounded-lg shadow-xl tour-save-settings">SAVE SETTINGS</button>
      </div>
    </div>
  );
};

export default AdminSettingsTab;
