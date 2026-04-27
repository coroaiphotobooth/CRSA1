import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PhotoboothSettings, AspectRatio, MonitorTheme } from '../../../../types';
import { 
  uploadOverlayToGas, 
  uploadBackgroundToGas,
  saveSettingsToGas 
} from '../../../../lib/appsScript';
import { getGoogleDriveDirectLink } from '../../../../lib/imageUtils';
import { supabase } from '../../../../lib/supabase';
import { useDialog } from '../../../../components/DialogProvider';
import { useWebViewCamera } from '../../../../hooks/useWebViewCamera';

export interface AdminSettingsTabRef {
  saveSettings: () => Promise<void>;
  hasUnsavedChanges: () => boolean;
}

interface AdminSettingsTabProps {
  settings: PhotoboothSettings;
  onSaveSettings: (settings: PhotoboothSettings) => void;
  gasUrl: string;
}

const AdminSettingsTab = forwardRef<AdminSettingsTabRef, AdminSettingsTabProps>(({ settings, onSaveSettings, gasUrl }, ref) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [isUploadingOverlay, setIsUploadingOverlay] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [isScanningCameras, setIsScanningCameras] = useState(false);
  const { showDialog } = useDialog();

  const overlayInputRef = useRef<HTMLInputElement>(null);

  const { 
    isWrapper, 
    cameras: dslrCameras, 
    isConnected: isDslrConnected, 
    listCameras: listDslrCameras, 
    connectCamera: connectDslrCamera,
    disconnectCamera: disconnectDslrCamera
  } = useWebViewCamera();

  const [isScanningDslr, setIsScanningDslr] = useState(false);
  const [dslrError, setDslrError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(JSON.stringify(localSettings) !== JSON.stringify(settings));
  }, [localSettings, settings]);

  const handleScanDslr = async () => {
    setIsScanningDslr(true);
    setDslrError(null);
    try {
      await listDslrCameras();
    } catch (err: any) {
      setDslrError(err.message || 'Failed to scan DSLR cameras');
    } finally {
      setIsScanningDslr(false);
    }
  };

  const handleConnectDslr = async () => {
    if (!localSettings.dslrCameraId) return;
    setDslrError(null);
    try {
      await connectDslrCamera('canon', localSettings.dslrCameraId);
    } catch (err: any) {
      setDslrError(err.message || 'Failed to connect DSLR');
    }
  };

  const scanCameras = async () => {
    setIsScanningCameras(true);
    try {
      // Request permission first to get real device labels
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      
      // Stop the stream immediately so camera light turns off
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error("Error scanning cameras:", err);
      showDialog('alert', 'Camera Error', 'Failed to scan cameras. Please ensure camera permissions are granted.');
    } finally {
      setIsScanningCameras(false);
    }
  };

  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      await handleSaveSettings();
    },
    hasUnsavedChanges: () => isDirty
  }));

  useEffect(() => {
    setLocalSettings(prev => {
      const merged = { ...settings };
      if (merged.cameraRotation === undefined) merged.cameraRotation = 0;
      if (!merged.selectedModel) merged.selectedModel = 'gemini-3.1-flash-image-preview';
      if (!merged.outputRatio) merged.outputRatio = '9:16';
      if (merged.folderId === undefined) merged.folderId = '';
      if (merged.originalFolderId === undefined) merged.originalFolderId = '';
      if (merged.spreadsheetId === undefined) merged.spreadsheetId = '';
      if (merged.videoPrompt === undefined || 
          merged.videoPrompt === 'Cinematic slow motion, subtle movement, 4k high quality, looping background' ||
          merged.videoPrompt === 'Animate the image with very subtle and natural motion. Keep the subject stable and realistic. Add minimal camera movement and gentle breathing or blinking. Avoid any distortion, fast motion, or unrealistic effects. Preserve the original look and details.') {
        merged.videoPrompt = 'Apply slow camera movement (push-in, push-out, pan, or parallax depth effect). Add subtle natural motion to the subject such as blinking, breathing, and micro expressions. Keep the face sharp, realistic, and undistorted.';
      }
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
      if (merged.printMethod === undefined) merged.printMethod = 'direct';
      if (merged.enableDoublePrint === undefined) merged.enableDoublePrint = false;
      if (merged.doublePrintMode === undefined) merged.doublePrintMode = merged.enableDoublePrint ? 'duplicate' : 'disabled';
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

            {/* ENABLE VIDEO GENERATION */}
            <div className="flex flex-col gap-4 bg-[#bc13fe]/10 p-5 rounded-lg border border-[#bc13fe]/20 tour-video-settings">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                   <label className="text-[10px] text-[#bc13fe] uppercase tracking-widest font-bold">ENABLE VIDEO GENERATION</label>
                   <span className="text-[8px] text-gray-500">Allow AI to generate short animated videos</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={localSettings.boothMode === 'video'}
                    onChange={(e) => setLocalSettings({...localSettings, boothMode: e.target.checked ? 'video' : 'photo'})}
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#bc13fe]"></div>
                </label>
              </div>
              
              {localSettings.boothMode === 'video' && (
                <div className="flex flex-col gap-3 mt-4 border-t border-[#bc13fe]/20 pt-4">
                  <h3 className="font-heading text-lg text-[#bc13fe] uppercase italic">Video Setting</h3>
                  <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Video Prompt</label>
                  <textarea 
                    className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-[#bc13fe] outline-none transition-colors h-24 rounded-lg custom-scrollbar" 
                    value={localSettings.videoPrompt || ''} 
                    onChange={e => setLocalSettings({...localSettings, videoPrompt: e.target.value})}
                    placeholder="Describe motion (e.g. slow motion, subtle movement...)"
                  />
                </div>
              )}
            </div>
          </div>

          {/* AI Model Config */}
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 h-fit backdrop-blur-md bg-black/60 rounded-xl border border-white/10 tour-ai-model">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">AI Model Configuration</h3>

             {/* Print Feature Toggle (NEW) */}
             <div className="flex flex-col gap-4 bg-white/5 p-4 rounded border border-white/10">
               <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                      <label className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">Enable Printing</label>
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

               {localSettings.enablePrint && (
                 <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-white/5">
                   <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Print Method</label>
                   <div className="grid grid-cols-2 gap-3">
                     <button
                       onClick={() => setLocalSettings({...localSettings, printMethod: 'direct'})}
                       className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.printMethod === 'direct' ? 'bg-cyan-600 text-white shadow-lg border-cyan-500' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                     >
                       <span>Direct Print</span>
                       <span className="text-[8px] opacity-70 normal-case">Print from this device</span>
                     </button>
                     <button
                       onClick={() => setLocalSettings({...localSettings, printMethod: 'server'})}
                       className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.printMethod === 'server' ? 'bg-cyan-600 text-white shadow-lg border-cyan-500' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                     >
                       <span>Print Server</span>
                       <span className="text-[8px] opacity-70 normal-case">Send to another laptop</span>
                     </button>
                   </div>
                   {localSettings.printMethod === 'server' && (
                     <div className="mt-2 text-[10px] text-gray-400 bg-black/30 p-3 rounded border border-white/5">
                       <p>To use Print Server:</p>
                       <ol className="list-decimal pl-4 mt-1 space-y-1 mb-3">
                         <li>Open this app on the laptop connected to the printer.</li>
                         <li>Go to Admin Settings and click "Open Print Server" below.</li>
                         <li>Leave the Print Server page open on that laptop.</li>
                       </ol>
                       <button 
                         onClick={() => navigate(`/print-server/${eventId}`)}
                         className="w-full py-2 bg-cyan-900/50 hover:bg-cyan-800/50 text-cyan-300 border border-cyan-500/30 rounded uppercase tracking-widest font-bold transition-colors flex items-center justify-center gap-2"
                       >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                         Open Print Server
                       </button>
                     </div>
                   )}
                 </div>
               )}
             </div>

             {/* Double Print Layout Mode */}
             <div className="flex flex-col gap-4 bg-white/5 p-4 rounded border border-white/10">
               <div className="flex flex-col gap-3">
                 <div className="flex flex-col">
                     <label className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">4x6 Print Layout Modes</label>
                     <span className="text-[8px] text-gray-500">Configure how photos are arranged on 4x6 paper</span>
                 </div>
                 
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <button
                      onClick={() => setLocalSettings({...localSettings, doublePrintMode: 'disabled', enableDoublePrint: false})}
                      className={`p-3 border border-white/10 rounded font-mono text-[10px] uppercase tracking-wider text-left transition-all flex flex-col gap-1 ${(!localSettings.doublePrintMode || localSettings.doublePrintMode === 'disabled') ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-lg' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">Single (Full)</span>
                      <span className="text-[8px] opacity-70 normal-case font-sans tracking-tight">Print 1 photo per sheet (fills paper).</span>
                    </button>
                    
                    <button
                      onClick={() => setLocalSettings({...localSettings, doublePrintMode: 'single_2r', enableDoublePrint: true})}
                      className={`p-3 border border-white/10 rounded font-mono text-[10px] uppercase tracking-wider text-left transition-all flex flex-col gap-1 ${localSettings.doublePrintMode === 'single_2r' ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-lg' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">Single 2R (Left)</span>
                      <span className="text-[8px] opacity-70 normal-case font-sans tracking-tight">1 photo left aligned (size 2R). Right blank.</span>
                    </button>

                    <button
                      onClick={() => setLocalSettings({...localSettings, doublePrintMode: 'duplicate', enableDoublePrint: true})}
                      className={`p-3 border border-white/10 rounded font-mono text-[10px] uppercase tracking-wider text-left transition-all flex flex-col gap-1 ${localSettings.doublePrintMode === 'duplicate' ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-lg' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">Duplicate</span>
                      <span className="text-[8px] opacity-70 normal-case font-sans tracking-tight">Print same photo 2x on one sheet.</span>
                    </button>
                    
                    <button
                      onClick={() => setLocalSettings({...localSettings, doublePrintMode: 'queue', enableDoublePrint: true})}
                      className={`p-3 border border-white/10 rounded font-mono text-[10px] uppercase tracking-wider text-left transition-all flex flex-col gap-1 ${localSettings.doublePrintMode === 'queue' ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-lg' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold text-amber-400">Queue & Merge</span>
                      <span className="text-[8px] opacity-70 normal-case font-sans tracking-tight">Wait for next guest, merge 2 different photos.</span>
                    </button>
                 </div>
               </div>
               
               <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
                 <div className="flex flex-col">
                     <label className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">Printer Hardware Orientation</label>
                     <span className="text-[8px] text-gray-500">Force canvas rotation to match printer paper feed.</span>
                 </div>
                 
                 <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setLocalSettings({...localSettings, printOrientation: 'auto'})}
                      className={`p-3 border border-white/10 rounded font-mono text-[10px] uppercase tracking-wider text-center transition-all flex flex-col gap-1 ${(!localSettings.printOrientation || localSettings.printOrientation === 'auto') ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-lg' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">Auto</span>
                    </button>
                    
                    <button
                      onClick={() => setLocalSettings({...localSettings, printOrientation: 'portrait'})}
                      className={`p-3 border border-white/10 rounded font-mono text-[10px] uppercase tracking-wider text-center transition-all flex flex-col gap-1 ${localSettings.printOrientation === 'portrait' ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-lg' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">Portrait</span>
                    </button>

                    <button
                      onClick={() => setLocalSettings({...localSettings, printOrientation: 'landscape'})}
                      className={`p-3 border border-white/10 rounded font-mono text-[10px] uppercase tracking-wider text-center transition-all flex flex-col gap-1 ${localSettings.printOrientation === 'landscape' ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-lg' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="font-bold">Landscape</span>
                    </button>
                 </div>
               </div>

               <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
                 <div className="flex flex-col gap-1">
                   <label className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">Print Color & Layout Fine-Tuning</label>
                   <span className="text-[8px] text-gray-500">Adjust raw output to fix printer hardware color variations.</span>
                 </div>
                 
                 <div className="flex items-center justify-between bg-black/40 p-2 rounded">
                   <span className="text-xs text-white">Brightness: {localSettings.printBrightness || 0}</span>
                   <div className="flex gap-2">
                     <button onClick={() => setLocalSettings({...localSettings, printBrightness: (localSettings.printBrightness || 0) - 1})} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded font-mono" disabled={(localSettings.printBrightness || 0) <= -20}>-</button>
                     <button onClick={() => setLocalSettings({...localSettings, printBrightness: (localSettings.printBrightness || 0) + 1})} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded font-mono" disabled={(localSettings.printBrightness || 0) >= 20}>+</button>
                   </div>
                 </div>
                 
                 <div className="flex items-center justify-between bg-black/40 p-2 rounded">
                   <span className="text-xs text-white">Transparency/Fade: {localSettings.printTransparency || 0}</span>
                   <div className="flex gap-2">
                     <button onClick={() => setLocalSettings({...localSettings, printTransparency: (localSettings.printTransparency || 0) - 1})} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded font-mono" disabled={(localSettings.printTransparency || 0) <= -20}>-</button>
                     <button onClick={() => setLocalSettings({...localSettings, printTransparency: (localSettings.printTransparency || 0) + 1})} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded font-mono" disabled={(localSettings.printTransparency || 0) >= 20}>+</button>
                   </div>
                 </div>
                 <p className="text-[8px] text-gray-400 mt-1">
                   <strong>Brightness:</strong> + increases light, - darkens.<br/>
                   <strong>Transparency/Fade:</strong> + gives faded/clearer look to white paper, - increases sharp contrast.
                 </p>
               </div>
               
               {/* Wrapper Bridge Settings (Only shown if running inside Webview2) */}
               {typeof window !== 'undefined' && (window as any).chrome && (window as any).chrome.webview && (
                 <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
                   <div className="flex flex-col gap-1">
                     <label className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Windows App Wrapper Integration</label>
                     <span className="text-[8px] text-gray-500">Overrides print dialog using bridge to C# WebView2.</span>
                   </div>
                   
                   <div className="flex justify-between items-center bg-black/40 p-4 rounded border border-emerald-500/30">
                      <div className="flex flex-col">
                         <span className="text-white font-bold text-xs">Silent Print (No Dialog)</span>
                         <span className="text-[10px] text-gray-400">Print directly from Windows OS without confirming.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={localSettings.enableSilentPrintWrapper || false}
                          onChange={(e) => {
                             const isSilent = e.target.checked;
                             setLocalSettings({...localSettings, enableSilentPrintWrapper: isSilent});
                             
                             // Immediately push the instruction to the C# Wrapper
                             try {
                               (window as any).chrome.webview.postMessage({
                                 action: "SET_PRINT_DIALOG",
                                 disableDialog: isSilent,
                                 requestId: "req_" + Date.now()
                               });
                             } catch(err) {
                               console.error("Failed to send message to wrapper", err);
                             }
                          }}
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                   </div>
                 </div>
               )}

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

          {/* Camera Config */}
          {localSettings.boothType !== 'interactive' && (
          <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit backdrop-blur-md bg-black/60 rounded-xl tour-camera-config">
            <h3 className="font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic">Camera Configuration</h3>
            
            {isWrapper && (
              <div className="flex flex-col gap-4 p-4 border border-[#bc13fe]/30 bg-[#bc13fe]/5 rounded-xl">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white uppercase tracking-widest">Pro DSLR Camera (Windows App)</h4>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={localSettings.useDslr || false}
                      onChange={(e) => setLocalSettings({...localSettings, useDslr: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#bc13fe]"></div>
                  </label>
                </div>
                
                {localSettings.useDslr && (
                  <>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">DSLR Source</label>
                        <button 
                          onClick={handleScanDslr} 
                          disabled={isScanningDslr}
                          className="text-[10px] px-3 py-1 bg-[#bc13fe]/20 text-[#bc13fe] rounded hover:bg-[#bc13fe]/40 transition-colors uppercase font-bold"
                        >
                          {isScanningDslr ? 'Scanning...' : 'Scan DSLR'}
                        </button>
                      </div>
                      <select
                        value={localSettings.dslrCameraId || ''}
                        onChange={(e) => setLocalSettings({...localSettings, dslrCameraId: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] text-sm"
                      >
                        <option value="">Select DSLR Camera</option>
                        {dslrCameras.map(cam => (
                          <option key={cam.id} value={cam.id}>
                            {cam.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={handleConnectDslr}
                        disabled={!localSettings.dslrCameraId || isDslrConnected}
                        className={`flex-1 py-2 rounded font-bold uppercase tracking-widest text-xs transition-colors ${isDslrConnected ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-[#bc13fe] text-white hover:bg-[#bc13fe]/80'}`}
                      >
                        {isDslrConnected ? 'Connected' : 'Connect'}
                      </button>
                      {isDslrConnected && (
                        <button 
                          onClick={disconnectDslrCamera}
                          className="flex-1 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded font-bold uppercase tracking-widest text-xs hover:bg-red-500/30 transition-colors"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                    {dslrError && <p className="text-red-400 text-xs">{dslrError}</p>}
                  </>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Camera Source</label>
                <button 
                  onClick={scanCameras} 
                  disabled={isScanningCameras}
                  className="text-[10px] px-3 py-1 bg-[#bc13fe]/20 text-[#bc13fe] rounded hover:bg-[#bc13fe]/40 transition-colors uppercase font-bold"
                >
                  {isScanningCameras ? 'Scanning...' : 'Scan Cameras'}
                </button>
              </div>
              <select
                value={localSettings.selectedCameraId || ''}
                onChange={(e) => setLocalSettings({...localSettings, selectedCameraId: e.target.value})}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] text-sm"
              >
                <option value="">Default Camera</option>
                {availableCameras.map(cam => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${cam.deviceId.substring(0, 5)}...`}
                  </option>
                ))}
              </select>
              <span className="text-[8px] text-gray-500">Click "Scan Cameras" to detect external mirrorless cameras or webcams.</span>
            </div>

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

            {/* Countdown Duration Setting */}
            <div className="flex items-center justify-between bg-white/5 p-4 rounded border border-white/10">
               <div className="flex flex-col">
                   <label className="text-[10px] text-orange-400 uppercase tracking-widest font-bold">Capture Countdown Timer</label>
                   <span className="text-[8px] text-gray-500">Timer before taking photo</span>
               </div>
               <div className="flex bg-black/50 rounded-lg p-1 border border-white/10">
                   <button 
                     onClick={() => setLocalSettings({...localSettings, countdownDuration: 3})}
                     className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${(!localSettings.countdownDuration || localSettings.countdownDuration === 3) ? 'bg-[#bc13fe] text-white' : 'text-gray-400 hover:text-white'}`}
                   >
                     3 SEC
                   </button>
                   <button 
                     onClick={() => setLocalSettings({...localSettings, countdownDuration: 5})}
                     className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${localSettings.countdownDuration === 5 ? 'bg-[#bc13fe] text-white' : 'text-gray-400 hover:text-white'}`}
                   >
                     5 SEC
                   </button>
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
          )}

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
      </div>
    </div>
  );
});

export default AdminSettingsTab;
