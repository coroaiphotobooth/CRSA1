import React, { useState, useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { PhotoboothSettings, UIDisplaySettings } from '../../../../types';
import { Settings, Save, Plus, Trash2, GripVertical, FileText, CheckCircle, Smartphone, Camera, Image as ImageIcon, Wand2, Video, MonitorPlay } from 'lucide-react';
import { useDialog } from '../../../../components/DialogProvider';
import { useParams } from 'react-router-dom';
import { supabase } from '../../../../lib/supabase';
import { getGoogleDriveDirectLink } from '../../../../lib/imageUtils';
import { saveSettingsToGas, uploadBackgroundToGas } from '../../../../lib/appsScript';
import { useWebViewCamera } from '../../../../hooks/useWebViewCamera';

export interface AdminInteractiveTabRef {
  hasUnsavedChanges: () => boolean;
  saveSettings: () => Promise<void>;
}

interface AdminInteractiveTabProps {
  settings: PhotoboothSettings;
  onSaveSettings: (settings: PhotoboothSettings) => void;
}

const AVAILABLE_STEPS = [
  { id: 'launch', label: 'Launch Screen', icon: <Smartphone className="w-4 h-4" />, deletable: true },
  { id: 'concept_select', label: 'Concept Selection', icon: <ImageIcon className="w-4 h-4" />, deletable: true },
  { id: 'capture', label: 'Camera / Capture', icon: <Camera className="w-4 h-4" />, deletable: true },
  { id: 'processing', label: 'AI Processing', icon: <Wand2 className="w-4 h-4" />, fixed: true, deletable: true },
  { id: 'result', label: 'Result Screen', icon: <CheckCircle className="w-4 h-4" />, fixed: true, deletable: false },
];

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

const UI_CONTAINER = "flex flex-col gap-3";
const UI_LABEL = "text-[10px] text-gray-500 uppercase tracking-widest font-bold";
const UI_INPUT = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50";

export const AdminInteractiveTab = forwardRef<AdminInteractiveTabRef, AdminInteractiveTabProps>(({ settings, onSaveSettings }, ref) => {
  const { showDialog } = useDialog();
  const { eventId } = useParams<{ eventId: string }>();
  const [localSettings, setLocalSettings] = useState<PhotoboothSettings>(settings);
  const [isDirty, setIsDirty] = useState(false);
  const [activeConfigPage, setActiveConfigPage] = useState<any>(null); // string or object

  // Cameras
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [isScanningCameras, setIsScanningCameras] = useState(false);
  const { 
    isWrapper, cameras: dslrCameras, isConnected: isDslrConnected, 
    listCameras: listDslrCameras, connectCamera: connectDslrCamera, disconnectCamera: disconnectDslrCamera 
  } = useWebViewCamera();
  const [isScanningDslr, setIsScanningDslr] = useState(false);
  const [dslrError, setDslrError] = useState<string | null>(null);

  // Background
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingBackgroundVideo, setIsUploadingBackgroundVideo] = useState(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const backgroundVideoInputRef = useRef<HTMLInputElement>(null);

  const [showAddPageMenu, setShowAddPageMenu] = useState(false);
  const addPageMenuRef = useRef<HTMLDivElement>(null);

  const [previewRatio, setPreviewRatio] = useState<'9:16' | '16:9'>('9:16');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addPageMenuRef.current && !addPageMenuRef.current.contains(e.target as Node)) {
        setShowAddPageMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
    setIsDirty(false);
  }, [settings]);

  useEffect(() => {
    // Send live localSettings to iframe if it exists
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'preview_settings', settings: localSettings },
        '*'
      );
    }
  }, [localSettings]);

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => isDirty,
    saveSettings: async () => {
      onSaveSettings(localSettings);
      
      // Save locally via props
      if (eventId) {
        try {
          const { error } = await supabase.from('events').update({ settings: localSettings }).eq('id', eventId);
          if (error) throw error;
        } catch(err) {}
      } else {
        await saveSettingsToGas(localSettings, localSettings.adminPin);
      }

      setIsDirty(false);
      await showDialog('alert', 'Saved', 'Interactive & Display settings saved successfully.');
    }
  }));

  const DEFAULT_FLOW = ['launch', 'concept_select', 'capture', 'processing', 'result'];
  const currentFlow = localSettings.interactiveFlow || DEFAULT_FLOW;
  const isFlowDefault = JSON.stringify(currentFlow) === JSON.stringify(DEFAULT_FLOW);
  const customPages = localSettings.interactivePages || [];
  const localUI: UIDisplaySettings = localSettings.uiSettings || ({} as UIDisplaySettings);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    if (result.source.droppableId === 'flow-list') {
      const items = Array.from(currentFlow);
      const [reorderedItem] = items.splice(result.source.index, 1);
      
      items.splice(result.destination.index, 0, reorderedItem);
      
      const resultIndex = items.indexOf('result');
      const isCore = ['launch', 'concept_select', 'capture', 'processing'].includes(reorderedItem);
      
      if (isCore && resultIndex !== -1 && items.indexOf(reorderedItem) > resultIndex) {
        showDialog('alert', 'Error', 'You cannot place this page after the result page.');
        return;
      }
      
      // Enforce processing is always immediately before result (if both exist)
      const hasProcessing = items.includes('processing');
      const hasResult = items.includes('result');
      
      const itemsWithoutProcessing = items.filter(id => id !== 'processing');
      let finalItems = [...itemsWithoutProcessing];
      
      if (hasProcessing && hasResult) {
        const ri = finalItems.indexOf('result');
        finalItems.splice(ri, 0, 'processing');
      } else if (hasProcessing) {
        finalItems.push('processing');
      }

      setLocalSettings(prev => ({ ...prev, interactiveFlow: finalItems }));
      setIsDirty(true);
    }
  };

  const addCustomForm = (title: string) => {
    const newId = `form_${Date.now()}`;
    const newPage = { id: newId, type: 'form', title: title, description: 'Please fill out the form below', fields: [] };
    setLocalSettings(prev => ({
      ...prev,
      interactivePages: [...(prev.interactivePages || []), newPage],
      interactiveFlow: [...(prev.interactiveFlow || []), newId]
    }));
    setIsDirty(true);
    setShowAddPageMenu(false);
  };

  const addCameraFxPage = () => {
    const newId = `camera_fx_${Date.now()}`;
    const newPage = { id: newId, type: 'camera_fx', title: 'Camera FX', deepArLicenseKey: '', effects: [], instructionText: 'Look at the camera', allowCapture: true };
    setLocalSettings(prev => ({
      ...prev,
      interactivePages: [...(prev.interactivePages || []), newPage],
      interactiveFlow: [...(prev.interactiveFlow || []), newId]
    }));
    setActiveConfigPage(newPage);
    setIsDirty(true);
    setShowAddPageMenu(false);
  };

  const addVideoPage = () => {
    const newId = `video_${Date.now()}`;
    const newPage = { id: newId, type: 'video', title: 'Video Screen', videoUrl: '', videoSize: 'full', interaction: 'click_anywhere', showBackButton: true };
    setLocalSettings(prev => ({
      ...prev,
      interactivePages: [...(prev.interactivePages || []), newPage],
      interactiveFlow: [...(prev.interactiveFlow || []), newId]
    }));
    setActiveConfigPage(newPage);
    setIsDirty(true);
    setShowAddPageMenu(false);
  };

  const addLaunchScreen = () => {
    if (!currentFlow.includes('launch')) {
      setLocalSettings(prev => ({
        ...prev,
        interactiveFlow: ['launch', ...(prev.interactiveFlow || [])]
      }));
      setIsDirty(true);
    }
    setShowAddPageMenu(false);
  };

  const addProcessingScreen = () => {
    if (!currentFlow.includes('processing')) {
      const newFlow = [...(localSettings.interactiveFlow || ['launch', 'concept_select', 'capture', 'result'])];
      const resultIndex = newFlow.indexOf('result');
      if (resultIndex !== -1) {
        newFlow.splice(resultIndex, 0, 'processing');
      } else {
        newFlow.push('processing');
      }
      setLocalSettings(prev => ({
        ...prev,
        interactiveFlow: newFlow
      }));
      setIsDirty(true);
    }
    setShowAddPageMenu(false);
  };

  const addConceptSelectScreen = () => {
    if (!currentFlow.includes('concept_select')) {
      const newFlow = [...(localSettings.interactiveFlow || [])];
      const captureIndex = newFlow.indexOf('capture');
      if (captureIndex !== -1) {
        newFlow.splice(captureIndex, 0, 'concept_select');
      } else {
        newFlow.push('concept_select');
      }
      setLocalSettings(prev => ({ ...prev, interactiveFlow: newFlow }));
      setIsDirty(true);
    }
    setShowAddPageMenu(false);
  };

  const addCaptureScreen = () => {
    if (!currentFlow.includes('capture')) {
      const newFlow = [...(localSettings.interactiveFlow || [])];
      const resultIndex = newFlow.indexOf('result');
      if (resultIndex !== -1) {
        newFlow.splice(resultIndex, 0, 'capture');
      } else {
        newFlow.push('capture');
      }
      setLocalSettings(prev => ({ ...prev, interactiveFlow: newFlow }));
      setIsDirty(true);
    }
    setShowAddPageMenu(false);
  };

  const addResultScreen = () => {
    if (!currentFlow.includes('result')) {
      const newFlow = [...(localSettings.interactiveFlow || [])];
      newFlow.push('result');
      setLocalSettings(prev => ({ ...prev, interactiveFlow: newFlow }));
      setIsDirty(true);
    }
    setShowAddPageMenu(false);
  };

  const removeStep = async (stepId: string) => {
    if (stepId === 'processing') {
      const confirmed = await showDialog('confirm', 'Remove AI Processing', "This will make it a standard photobooth without AI generation. Are you sure?");
      if (!confirmed) return;
    } else if (stepId === 'concept_select') {
      const confirmed = await showDialog('confirm', 'Remove Concept Selection', "Removing the Concept Selection page will make the concept selection random. Are you sure?");
      if (!confirmed) return;
    }
    setLocalSettings(prev => ({ ...prev, interactiveFlow: (prev.interactiveFlow || []).filter(id => id !== stepId) }));
    if (activeConfigPage === stepId) setActiveConfigPage(null);
    setIsDirty(true);
  };

  const deleteCustomPage = (pageId: string) => {
    setLocalSettings(prev => ({
      ...prev,
      interactiveFlow: (prev.interactiveFlow || []).filter(id => id !== pageId),
      interactivePages: (prev.interactivePages || []).filter(p => p.id !== pageId)
    }));
    if (activeConfigPage?.id === pageId) setActiveConfigPage(null);
    setIsDirty(true);
  };

  const updateUIChange = (key: keyof UIDisplaySettings, value: any) => {
    setLocalSettings(prev => ({ 
      ...prev, 
      uiSettings: { 
        ...(prev.uiSettings || ({} as UIDisplaySettings)), 
        [key]: value 
      } as UIDisplaySettings 
    }));
    setIsDirty(true);
  };

  const updateSetting = (key: keyof PhotoboothSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const updateActivePage = (updatedPage: any) => {
    setActiveConfigPage(updatedPage);
    setLocalSettings(prev => ({
      ...prev,
      interactivePages: (prev.interactivePages || []).map(p => p.id === updatedPage.id ? updatedPage : p)
    }));
    setIsDirty(true);
  };

  const scanCameras = async () => {
    setIsScanningCameras(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableCameras(devices.filter(device => device.kind === 'videoinput'));
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      showDialog('alert', 'Camera Error', 'Failed to scan cameras.');
    } finally {
      setIsScanningCameras(false);
    }
  };

  const renderStepIcon = (stepId: string) => {
    const available = AVAILABLE_STEPS.find(s => s.id === stepId);
    if (available) return available.icon;
    if (stepId.startsWith('form')) return <FileText className="w-4 h-4 text-[#bc13fe]" />;
    if (stepId.startsWith('video_start')) return <Video className="w-4 h-4 text-[#bc13fe]" />;
    if (stepId.startsWith('video')) return <Video className="w-4 h-4 text-orange-400" />;
    return <Settings className="w-4 h-4" />;
  };

  const renderStepName = (stepId: string) => {
    const available = AVAILABLE_STEPS.find(s => s.id === stepId);
    if (available) return available.label;
    const customPage = customPages.find(p => p.id === stepId);
    if (customPage) return customPage.title || 'Custom Page';
    return stepId;
  };

  let rightPanelContent = null;

  if (activeConfigPage === 'launch') {
    rightPanelContent = (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300 h-full overflow-y-auto custom-scrollbar pr-2">
         <h2 className="text-xl font-heading font-bold text-white uppercase flex items-center gap-3">
           <Smartphone className="w-5 h-5 text-[#bc13fe]" /> Launch Screen Settings
         </h2>
         <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Launch Type</label>
             <div className="flex gap-2 mt-2">
               <button onClick={() => updateUIChange('launchType', 'standard')} className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all font-bold uppercase text-xs ${localUI.launchType === 'standard' || !localUI.launchType ? 'border-[#bc13fe] bg-[#bc13fe]/10 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30'}`}>
                 Standard Launch
               </button>
               <button onClick={() => updateUIChange('launchType', 'video')} className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all font-bold uppercase text-xs ${localUI.launchType === 'video' ? 'border-[#bc13fe] bg-[#bc13fe]/10 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30'}`}>
                 Video Start
               </button>
             </div>
         </div>

         {(!localUI.launchType || localUI.launchType === 'standard') && (
           <div className={UI_CONTAINER}>
               <label className={UI_LABEL}>Standard Launch Layout</label>
               <div className="flex flex-col gap-3 mt-2">
                 <button onClick={() => updateUIChange('launchLayout', 'button_with_gallery')} className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all flex items-center justify-between ${localUI.launchLayout === 'button_with_gallery' || !localUI.launchLayout ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                   <div><div className="font-bold text-white uppercase text-xs mb-0.5">Use Launch & Gallery Button</div></div>
                 </button>
                 <button onClick={() => updateUIChange('launchLayout', 'button_only')} className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all flex items-center justify-between ${localUI.launchLayout === 'button_only' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                   <div><div className="font-bold text-white uppercase text-xs mb-0.5">Use Launch Button Only</div></div>
                 </button>
                 <button onClick={() => updateUIChange('launchLayout', 'custom_text')} className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all flex items-center justify-between ${localUI.launchLayout === 'custom_text' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                   <div><div className="font-bold text-white uppercase text-xs mb-0.5">Use Custom Text to Start</div></div>
                 </button>
                 <button onClick={() => updateUIChange('launchLayout', 'vip_checkin')} className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all flex items-center justify-between ${localUI.launchLayout === 'vip_checkin' ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                   <div><div className="font-bold text-amber-500 uppercase text-xs mb-0.5">VIP Check-In (Scanner Mode)</div></div>
                 </button>
               </div>
               
               {(localUI.launchLayout === 'button_with_gallery' || localUI.launchLayout === 'button_only' || !localUI.launchLayout) && (
                 <div className="mt-4">
                   <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Launch Button Label</label>
                   <input type="text" value={localUI.launchButtonLabel || 'LAUNCH'} onChange={(e) => updateUIChange('launchButtonLabel', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" />
                 </div>
               )}

               {localUI.launchLayout === 'custom_text' && (
                 <div className="mt-4 flex flex-col gap-3">
                   <div>
                     <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Text Label</label>
                     <input type="text" value={localUI.launchTextLabel || 'START NOW'} onChange={(e) => updateUIChange('launchTextLabel', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" />
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="text-[10px] font-bold tracking-widest text-white/50 uppercase block mb-1">Text Size</label>
                       <select value={localUI.launchTextSize || 'text-3xl md:text-5xl'} onChange={(e) => updateUIChange('launchTextSize', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#bc13fe]/50">
                         <option value="text-xl md:text-3xl">Small</option>
                         <option value="text-3xl md:text-5xl">Medium</option>
                         <option value="text-5xl md:text-7xl">Large</option>
                         <option value="text-7xl md:text-9xl">Extra Large</option>
                       </select>
                     </div>
                     <div>
                       <label className="text-[10px] font-bold tracking-widest text-white/50 uppercase block mb-1">Text Color</label>
                       <div className="flex gap-2 items-center">
                         <input type="color" value={localUI.launchTextColor || '#ffffff'} onChange={(e) => updateUIChange('launchTextColor', e.target.value)} className="w-8 h-8 rounded shrink-0 cursor-pointer bg-transparent border-0 p-0" />
                         <input type="text" value={localUI.launchTextColor || '#ffffff'} onChange={(e) => updateUIChange('launchTextColor', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#bc13fe]/50" placeholder="#ffffff" />
                       </div>
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] font-bold tracking-widest text-white/50 uppercase block mb-1">Font Family</label>
                     <select value={localUI.launchTextFont || ''} onChange={(e) => updateUIChange('launchTextFont', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#bc13fe]/50">
                        <option value="">Default Font (Match Theme)</option>
                        <option value="'Space Grotesk', sans-serif">Space Grotesk</option>
                        <option value="'Inter', sans-serif">Inter</option>
                        <option value="'Playfair Display', serif">Playfair Display (Serif)</option>
                        <option value="'Courier New', monospace">Courier New (Monospace)</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Times New Roman', serif">Times New Roman</option>
                        <option value="'Comic Sans MS', cursive">Comic Sans (Playful)</option>
                     </select>
                   </div>
                   <div>
                     <label className="text-[10px] font-bold tracking-widest text-white/50 uppercase block mb-1">Text Shadow</label>
                     <div className="flex gap-2 items-center">
                       <input type="color" value={localUI.launchTextShadowColor || '#ffffff'} onChange={(e) => {
                           updateUIChange('launchTextShadowColor', e.target.value);
                           const current = localUI.launchTextShadow || '0px 0px 15px rgba(255,255,255,0.8)';
                           const updatedShadow = current.replace(/(#[0-9a-fA-F]{3,8}|rgba?\(.*?\)|[a-zA-Z]+)$/i, e.target.value);
                           updateUIChange('launchTextShadow', updatedShadow);
                       }} className="w-8 h-8 rounded shrink-0 cursor-pointer bg-transparent border-0 p-0" />
                       <input type="text" value={localUI.launchTextShadow || '0px 0px 15px rgba(255,255,255,0.8)'} onChange={(e) => updateUIChange('launchTextShadow', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#bc13fe]/50" />
                     </div>
                   </div>
                 </div>
               )}

               <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
                 <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={localUI.launchEnableNameEvent !== false} onChange={(e) => updateUIChange('launchEnableNameEvent', e.target.checked)} className="w-4 h-4 accent-[#bc13fe]" />
                   <span className="text-white text-xs font-bold">Enable Event Name</span>
                 </label>
                 <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={localUI.launchEnableDescEvent !== false} onChange={(e) => updateUIChange('launchEnableDescEvent', e.target.checked)} className="w-4 h-4 accent-[#bc13fe]" />
                   <span className="text-white text-xs font-bold">Enable Event Description</span>
                 </label>
               </div>
           </div>
         )}

         {localUI.launchType === 'video' && (
           <>
              <div className="bg-[#bc13fe]/10 border border-[#bc13fe]/30 rounded-xl p-4 mb-4">
                 <h3 className="text-[#bc13fe] text-[10px] font-bold uppercase tracking-widest mb-2">How do I use it?</h3>
                 <p className="text-gray-300 text-[10px] mb-1">Create two 5- to 10-second videos:</p>
                 <ul className="list-disc list-inside text-gray-400 text-[10px] mb-2 leading-relaxed">
                    <li>1 idle video</li>
                    <li>1 video 5- to 10-second greeting</li>
                 </ul>
                 <p className="text-gray-300 text-[10px]">Upload each idle video. When you click it, the greeting video will appear.</p>
              </div>

              <div className={UI_CONTAINER}>
                 <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Video Idle URL (MP4 / WebM)</label>
                 <span className="text-[8px] text-gray-400 mb-3 block">Max 15 seconds, max 13MB. Upload or paste link. Plays in loop until start.</span>
                 
                 {(localUI.videoIdleUrl || 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/talking%20video/iddle%20v1%20.mp4') && (
                    <video 
                       src={localUI.videoIdleUrl || 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/talking%20video/iddle%20v1%20.mp4'} 
                       className="w-[120px] h-[160px] md:w-[150px] md:h-[200px] rounded-lg mb-3 border border-white/20 object-cover bg-black/50" 
                       controls 
                       muted 
                       loop
                       playsInline
                    />
                 )}

                 <div className="flex gap-4 items-center">
                    <input type="file" accept="video/mp4,video/webm" className="hidden" id="upload-idle-video-launch" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 13 * 1024 * 1024) { await showDialog('alert', 'Error', 'Video > 13MB limit.'); return; }
                      try {
                        if (eventId) {
                          const fileName = `${settings.storage_folder || eventId}/assets/vididle-${Date.now()}.${file.name.split('.').pop()}`;
                          const { data, error } = await supabase.storage.from('photobooth').upload(fileName, file, {upsert: true});
                          if (!error) {
                            const { data: { publicUrl } } = supabase.storage.from('photobooth').getPublicUrl(fileName);
                            updateUIChange('videoIdleUrl', publicUrl);
                          } else {
                            await showDialog('alert', 'Error', error.message);
                          }
                        }
                      } catch (err:any) {
                        await showDialog('alert', 'Error', err.message);
                      }
                    }} />
                    <label htmlFor="upload-idle-video-launch" className="w-full text-center px-4 py-3 bg-[#bc13fe]/20 text-[#bc13fe] hover:bg-[#bc13fe]/40 border border-[#bc13fe]/30 rounded-xl font-bold uppercase text-xs cursor-pointer transition-colors">
                      Upload Idle Video
                    </label>
                 </div>
              </div>

              <div className={UI_CONTAINER}>
                 <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Video Greeting URL (MP4 / WebM)</label>
                 <span className="text-[8px] text-gray-400 mb-3 block">Max 15 seconds, max 13MB. Played when START is triggered.</span>

                 {(localUI.videoGreetingUrl || 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/talking%20video/TALKING%20V1.mp4') && (
                    <video 
                       src={localUI.videoGreetingUrl || 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/talking%20video/TALKING%20V1.mp4'} 
                       className="w-[120px] h-[160px] md:w-[150px] md:h-[200px] rounded-lg mb-3 border border-white/20 object-cover bg-black/50" 
                       controls 
                       muted 
                       loop
                       playsInline
                    />
                 )}

                 <div className="flex gap-4 items-center">
                    <input type="file" accept="video/mp4,video/webm" className="hidden" id="upload-greet-video-launch" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 13 * 1024 * 1024) { await showDialog('alert', 'Error', 'Video > 13MB limit.'); return; }
                      try {
                        if (eventId) {
                          const fileName = `${settings.storage_folder || eventId}/assets/vidgreet-${Date.now()}.${file.name.split('.').pop()}`;
                          const { data, error } = await supabase.storage.from('photobooth').upload(fileName, file, {upsert: true});
                          if (!error) {
                            const { data: { publicUrl } } = supabase.storage.from('photobooth').getPublicUrl(fileName);
                            updateUIChange('videoGreetingUrl', publicUrl);
                          } else {
                            await showDialog('alert', 'Error', error.message);
                          }
                        }
                      } catch (err:any) {
                        await showDialog('alert', 'Error', err.message);
                      }
                    }} />
                    <label htmlFor="upload-greet-video-launch" className="w-full text-center px-4 py-3 bg-[#bc13fe]/20 text-[#bc13fe] hover:bg-[#bc13fe]/40 border border-[#bc13fe]/30 rounded-xl font-bold uppercase text-xs cursor-pointer transition-colors">
                      Upload Greeting Video
                    </label>
                 </div>
              </div>

              <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Start Option</label>
                 <div className="flex flex-col gap-2 mt-1">
                   <label className="flex items-center gap-3 p-3 bg-black/40 border border-white/10 rounded-lg cursor-pointer hover:border-white/30 transition-colors">
                     <input type="radio" checked={localUI.videoStartOption === 'button'} onChange={() => updateUIChange('videoStartOption', 'button')} className="accent-[#bc13fe]" />
                     <div className="flex flex-col">
                       <span className="text-white text-xs font-bold">Use Button to Start</span>
                     </div>
                   </label>
                   <label className="flex items-center gap-3 p-3 bg-black/40 border border-white/10 rounded-lg cursor-pointer hover:border-white/30 transition-colors">
                     <input type="radio" checked={localUI.videoStartOption === 'text'} onChange={() => updateUIChange('videoStartOption', 'text')} className="accent-[#bc13fe]" />
                     <div className="flex flex-col">
                       <span className="text-white text-xs font-bold">Use Text to Start</span>
                     </div>
                   </label>
                   <label className="flex items-center gap-3 p-3 bg-black/40 border border-white/10 rounded-lg cursor-pointer hover:border-white/30 transition-colors">
                     <input type="radio" checked={localUI.videoStartOption === 'click_anywhere' || !localUI.videoStartOption} onChange={() => updateUIChange('videoStartOption', 'click_anywhere')} className="accent-[#bc13fe]" />
                     <div className="flex flex-col">
                       <span className="text-white text-xs font-bold">Click Anywhere to Start</span>
                     </div>
                   </label>
                 </div>
                 {(localUI.videoStartOption === 'button' || localUI.videoStartOption === 'text') && (
                   <div className="mt-2">
                     <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Text / Button Label</label>
                     <input type="text" value={localUI.videoStartLabel || 'START'} onChange={(e) => updateUIChange('videoStartLabel', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" />
                   </div>
                 )}
              </div>

               <div className={UI_CONTAINER}>
                  <label className={UI_LABEL}>Button / Text Position</label>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => updateUIChange('videoStartButtonPosition', 'center')} className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all font-bold uppercase text-xs ${localUI.videoStartButtonPosition === 'center' || !localUI.videoStartButtonPosition ? 'border-[#bc13fe] bg-[#bc13fe]/10 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30'}`}>
                      Center
                    </button>
                    <button onClick={() => updateUIChange('videoStartButtonPosition', 'bottom')} className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all font-bold uppercase text-xs ${localUI.videoStartButtonPosition === 'bottom' ? 'border-[#bc13fe] bg-[#bc13fe]/10 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30'}`}>
                      Bottom
                    </button>
                  </div>
               </div>

              <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Display Overlays (Idle Mode)</label>
                 <div className="flex flex-col gap-2 mt-2">
                   <label className="flex items-center gap-3 cursor-pointer">
                     <input type="checkbox" checked={localUI.videoEnableNameEvent !== false} onChange={(e) => updateUIChange('videoEnableNameEvent', e.target.checked)} className="w-4 h-4 accent-[#bc13fe]" />
                     <span className="text-white text-xs font-bold">Show Event Name</span>
                   </label>
                   <label className="flex items-center gap-3 cursor-pointer">
                     <input type="checkbox" checked={localUI.videoEnableDescription !== false} onChange={(e) => updateUIChange('videoEnableDescription', e.target.checked)} className="w-4 h-4 accent-[#bc13fe]" />
                     <span className="text-white text-xs font-bold">Show Event Description</span>
                   </label>
                   <label className="flex items-center gap-3 cursor-pointer">
                     <input type="checkbox" checked={localUI.videoEnableGalleryButton !== false} onChange={(e) => updateUIChange('videoEnableGalleryButton', e.target.checked)} className="w-4 h-4 accent-[#bc13fe]" />
                     <span className="text-white text-xs font-bold">Show Gallery Button</span>
                   </label>
                 </div>
              </div>
           </>
         )}

         {/* Typography */}
         <div className="bg-black/40 border border-white/10 p-6 rounded-xl">
            <h3 className="font-heading text-lg text-white uppercase mb-4">Typography & Styling</h3>
            <div className="grid grid-cols-2 gap-4">
               <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Event Name Size</label>
                 <select value={localUI.eventNameSize || 'text-6xl'} onChange={(e) => updateUIChange('eventNameSize', e.target.value)} className="w-full bg-black/50 py-2 px-3 rounded font-mono text-xs text-white">
                   <option value="text-4xl">Small (4xl)</option><option value="text-6xl">Medium (6xl)</option><option value="text-8xl">Large (8xl)</option>
                 </select>
               </div>
               <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Event Desc Size</label>
                 <select value={localUI.eventDescSize || 'text-xl'} onChange={(e) => updateUIChange('eventDescSize', e.target.value)} className="w-full bg-black/50 py-2 px-3 rounded font-mono text-xs text-white">
                   <option value="text-sm">Small (sm)</option><option value="text-xl">Medium (xl)</option><option value="text-2xl">Large (2xl)</option>
                 </select>
               </div>
               <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Font Family</label>
                 <select value={localUI.fontFamily || 'font-sans'} onChange={(e) => updateUIChange('fontFamily', e.target.value)} className="w-full bg-black/50 py-2 px-3 rounded font-mono text-xs text-white">
                   <option value="font-sans">Modern (Sans)</option><option value="font-serif">Elegant (Serif)</option><option value="font-heading">Bold (Heading)</option>
                 </select>
               </div>
               <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Font Color</label>
                 <input type="color" value={localUI.fontColor || '#ffffff'} onChange={(e) => updateUIChange('fontColor', e.target.value)} className="w-full h-10 rounded bg-black/50" />
               </div>
               <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Button Color</label>
                 <input type="color" value={localUI.buttonColor || '#ea580c'} onChange={(e) => updateUIChange('buttonColor', e.target.value)} className="w-full h-10 rounded bg-black/50" />
               </div>
               <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Glow Color</label>
                 <input type="color" value={localUI.glowColor || '#bc13fe'} onChange={(e) => updateUIChange('glowColor', e.target.value)} className="w-full h-10 rounded bg-black/50" />
               </div>
            </div>
         </div>
      </div>
    );
  } else if (activeConfigPage === 'concept_select') {
    rightPanelContent = (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300 h-full">
         <h2 className="text-xl font-heading font-bold text-white uppercase flex items-center gap-3">
           <ImageIcon className="w-5 h-5 text-[#bc13fe]" /> Concept Selection Settings
         </h2>
         <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Concept Selector Style</label>
             <div className="grid grid-cols-2 gap-4 mt-2">
               <button onClick={() => updateUIChange('conceptLayout', 'grid')} className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square ${localUI.conceptLayout === 'grid' || !localUI.conceptLayout ? 'border-[#bc13fe] ring-4 ring-[#bc13fe]/30 scale-[1.02]' : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOGO/GRID.jpg" className="absolute inset-0 w-full h-full object-cover" alt="Grid Layout Preview" referrerPolicy="no-referrer" />
                 <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-center text-white text-xs font-bold uppercase">GRID LAYOUT</div>
               </button>
               <button onClick={() => updateUIChange('conceptLayout', 'carousel')} className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square ${localUI.conceptLayout === 'carousel' ? 'border-[#bc13fe] ring-4 ring-[#bc13fe]/30 scale-[1.02]' : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOGO/SLIDE.jpg" className="absolute inset-0 w-full h-full object-cover" alt="Slide Layout Preview" referrerPolicy="no-referrer" />
                 <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-center text-white text-xs font-bold uppercase">SLIDE / CAROUSEL</div>
               </button>
             </div>
         </div>
         <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Show Name Event & Description in Themes</label>
             <div className="flex flex-wrap gap-2 mt-2">
               <button onClick={() => updateUIChange('themeEventInfoPosition', 'none')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] ${localUI.themeEventInfoPosition === 'none' || !localUI.themeEventInfoPosition ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Hidden</button>
               <button onClick={() => updateUIChange('themeEventInfoPosition', 'top')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] ${localUI.themeEventInfoPosition === 'top' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Top</button>
               <button onClick={() => updateUIChange('themeEventInfoPosition', 'bottom')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] ${localUI.themeEventInfoPosition === 'bottom' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Bottom</button>
              </div>
          </div>
          <div className={UI_CONTAINER}>
              <label className={UI_LABEL}>Theme Selection Title Text</label>
              <div className="flex flex-col gap-3 mt-2">
                 <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={localUI.themeEnableTitle !== false} onChange={(e) => updateUIChange('themeEnableTitle', e.target.checked)} className="w-4 h-4 accent-[#bc13fe]" />
                   <span className="text-white text-xs font-bold uppercase">Enable Concept Title</span>
                 </label>
                 {localUI.themeEnableTitle !== false && (
                   <div className="flex flex-col gap-3 mt-2">
                     <div>
                       <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Title Text</label>
                       <input type="text" value={localUI.themeTitleText || ''} onChange={(e) => updateUIChange('themeTitleText', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" placeholder="CHOOSE CONCEPT" />
                     </div>
                     <div>
                       <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Subtitle Text</label>
                       <input type="text" value={localUI.themeSubtitleText || ''} onChange={(e) => updateUIChange('themeSubtitleText', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" placeholder="Select your transformation" />
                     </div>
                   </div>
                 )}
              </div>
         </div>
      </div>
    );
  } else if (activeConfigPage === 'capture') {
    rightPanelContent = (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300 h-full overflow-y-auto custom-scrollbar pr-2">
         <h2 className="text-xl font-heading font-bold text-white uppercase flex items-center gap-3">
           <Camera className="w-5 h-5 text-[#bc13fe]" /> Camera / Capture Settings
         </h2>
         <div className="flex flex-col gap-4">
             <label className="flex items-center gap-3 cursor-pointer p-4 bg-black/50 border border-white/10 rounded-lg">
               <input type="checkbox" checked={localUI.showFrameDuringCapture} onChange={(e) => updateUIChange('showFrameDuringCapture', e.target.checked)} className="w-5 h-5 accent-[#bc13fe]" />
               <span className="text-white text-xs font-bold uppercase">Show PNG Frame Guide during Capture Phase</span>
             </label>
             <label className="flex items-center gap-3 cursor-pointer p-4 bg-black/50 border border-white/10 rounded-lg">
               <input type="checkbox" checked={localUI.confirmPhotoBeforeGenerate || false} onChange={(e) => updateUIChange('confirmPhotoBeforeGenerate', e.target.checked)} className="w-5 h-5 accent-[#bc13fe]" />
               <span className="text-white text-xs font-bold uppercase">Confirm Photo Before Generate</span>
             </label>
         </div>
         <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Capture Button Position</label>
             <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => updateUIChange('captureButtonPosition', 'bottom')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all ${localUI.captureButtonPosition === 'bottom' || !localUI.captureButtonPosition ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Bottom (Default)</button>
                <button onClick={() => updateUIChange('captureButtonPosition', 'top_right')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all ${localUI.captureButtonPosition === 'top_right' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Top Right</button>
             </div>
         </div>
         
         {/* Camera Configuration */}
         <div className="mt-4 pt-4 border-t border-white/10">
            <h3 className="text-sm font-bold text-[#bc13fe] uppercase mb-4">Camera Configuration</h3>
            {isWrapper && (
              <div className="flex flex-col gap-4 mb-4 p-4 border border-[#bc13fe]/30 bg-[#bc13fe]/5 rounded-xl">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white uppercase tracking-widest">Pro DSLR Camera (Windows App)</h4>
                  <input type="checkbox" checked={localSettings.useDslr || false} onChange={e => updateSetting('useDslr', e.target.checked)} className="w-5 h-5 accent-[#bc13fe]" />
                </div>
                {localSettings.useDslr && (
                   <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                         <button onClick={async () => { setIsScanningDslr(true); await listDslrCameras(); setIsScanningDslr(false); }} className="px-4 py-2 bg-white/10 rounded font-bold uppercase text-[10px]">{isScanningDslr ? 'Scanning...' : 'Scan DSLR'}</button>
                         <select value={localSettings.dslrCameraId || ''} onChange={(e) => updateSetting('dslrCameraId', e.target.value)} className="flex-1 bg-black/50 border border-white/10 rounded px-2 text-xs text-white">
                           <option value="">Select DSLR Camera</option>
                           {dslrCameras.map(cam => <option key={cam.id} value={cam.id}>{cam.name}</option>)}
                         </select>
                      </div>
                   </div>
                )}
              </div>
            )}
            
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-center justify-between">
                <label className={UI_LABEL}>Camera Source (Webcam)</label>
                <button onClick={scanCameras} disabled={isScanningCameras} className="text-[10px] px-3 py-1 bg-[#bc13fe]/20 text-[#bc13fe] rounded">
                  {isScanningCameras ? 'Scanning...' : 'Scan Cameras'}
                </button>
              </div>
              <select value={localSettings.selectedCameraId || ''} onChange={(e) => updateSetting('selectedCameraId', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white text-sm">
                <option value="">Default Camera</option>
                {availableCameras.map(cam => <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId.substring(0,5)}`}</option>)}
              </select>
            </div>
            
            <div className="flex flex-col gap-3 mb-4">
              <label className={UI_LABEL}>Webcam Rotation</label>
              <div className="grid grid-cols-4 gap-3">
                 {[0, 90, 180, 270].map(deg => (
                   <button key={deg} onClick={() => updateSetting('cameraRotation', deg)} className={`py-2 rounded font-bold text-xs border ${localSettings.cameraRotation === deg ? 'bg-[#bc13fe]/20 border-[#bc13fe]' : 'bg-transparent border-white/20'}`}>{deg}°</button>
                 ))}
              </div>
            </div>

            <div className="flex items-center justify-between bg-white/5 p-4 rounded border border-white/10">
               <label className="text-[10px] text-orange-400 uppercase tracking-widest font-bold">Mirror Preview Camera</label>
               <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={localSettings.mirrorCamera ?? true} onChange={e => updateSetting('mirrorCamera', e.target.checked)} />
            </div>
         </div>
      </div>
    );
  } else if (activeConfigPage === 'result') {
    rightPanelContent = (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300 h-full">
         <h2 className="text-xl font-heading font-bold text-white uppercase flex items-center gap-3">
           <CheckCircle className="w-5 h-5 text-[#bc13fe]" /> Result Screen Settings
         </h2>
         <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Result Buttons Position</label>
             <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => updateUIChange('resultButtonsPosition', 'bottom')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all ${localUI.resultButtonsPosition === 'bottom' || !localUI.resultButtonsPosition ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Bottom</button>
                <button onClick={() => updateUIChange('resultButtonsPosition', 'right')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all ${localUI.resultButtonsPosition === 'right' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Right Side</button>
                <button onClick={() => updateUIChange('resultButtonsPosition', 'top')} className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all ${localUI.resultButtonsPosition === 'top' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400'}`}>Top</button>
             </div>
         </div>
      </div>
    );
  } else if (activeConfigPage === 'processing') {
    rightPanelContent = (
      <div className="flex flex-col gap-6 animate-in fade-in duration-300 h-full">
         <h2 className="text-xl font-heading font-bold text-white uppercase flex items-center gap-3">
           <Wand2 className="w-5 h-5 text-[#bc13fe]" /> AI Processing Settings
         </h2>

         <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Processing Visual Style</label>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
               <button onClick={() => updateUIChange('processingStyle', 'progress_bar')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${localUI.processingStyle === 'progress_bar' || !localUI.processingStyle ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOADING%20BAR/PROGRES%20BAR.jpg" alt="Progress Bar & Text (Default)" className="w-full h-auto rounded-lg mb-2 object-cover aspect-video" />
                 <span className="font-bold text-white uppercase text-[9px] text-center">Progress Bar & Text</span>
               </button>
               <button onClick={() => updateUIChange('processingStyle', 'futuristic_progress')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${localUI.processingStyle === 'futuristic_progress' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOADING%20BAR/FUTURISTIC%20PROGGRES%20BAR.jpg" alt="Futuristic Progress Bar" className="w-full h-auto rounded-lg mb-2 object-cover aspect-video" />
                 <span className="font-bold text-white uppercase text-[9px] text-center">Futuristic Progress Bar</span>
               </button>
               <button onClick={() => updateUIChange('processingStyle', 'ai_neural')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${localUI.processingStyle === 'ai_neural' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOADING%20BAR/AI%20NEURAL%20LOADING.jpg" alt="AI Neural Loading" className="w-full h-auto rounded-lg mb-2 object-cover aspect-video" />
                 <span className="font-bold text-white uppercase text-[9px] text-center">AI Neural Loading</span>
               </button>
               <button onClick={() => updateUIChange('processingStyle', 'heartbeat')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${localUI.processingStyle === 'heartbeat' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOADING%20BAR/HEARBEAT%20LOADED.jpg" alt="Heartbeat Loader" className="w-full h-auto rounded-lg mb-2 object-cover aspect-video" />
                 <span className="font-bold text-white uppercase text-[9px] text-center">Heartbeat Loader</span>
               </button>
               <button onClick={() => updateUIChange('processingStyle', 'sound_wave')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${localUI.processingStyle === 'sound_wave' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOADING%20BAR/SOUNDWAVE.jpg" alt="Sound Wave Loader" className="w-full h-auto rounded-lg mb-2 object-cover aspect-video" />
                 <span className="font-bold text-white uppercase text-[9px] text-center">Sound Wave Loader</span>
               </button>
               <button onClick={() => updateUIChange('processingStyle', 'pulse_wave')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${localUI.processingStyle === 'pulse_wave' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOADING%20BAR/PULSE%20WAVE%20LOADER.jpg" alt="Pulse Wave Loader" className="w-full h-auto rounded-lg mb-2 object-cover aspect-video" />
                 <span className="font-bold text-white uppercase text-[9px] text-center">Pulse Wave Loader</span>
               </button>
               <button onClick={() => updateUIChange('processingStyle', 'neural_signal')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${localUI.processingStyle === 'neural_signal' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}`}>
                 <img src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOADING%20BAR/NEURAL%20SIGNAL%20LOADER.jpg" alt="Neural Signal Loader" className="w-full h-auto rounded-lg mb-2 object-cover aspect-video" />
                 <span className="font-bold text-white uppercase text-[9px] text-center">Neural Signal Loader</span>
               </button>
             </div>
         </div>

         <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Main Processing Text</label>
            <input type="text" value={localUI.processingText || 'GENERATING AI VISUALS...'} onChange={(e) => updateUIChange('processingText', e.target.value)} className={UI_INPUT} placeholder="e.g. PROCESSING YOUR IMAGE..." />
         </div>
      </div>
    );
  } else if (typeof activeConfigPage === 'object' && activeConfigPage !== null && activeConfigPage.type === 'form') {
    rightPanelContent = (
      <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6 pb-6 border-b border-white/10">
          <h2 className="text-xl font-heading tracking-widest font-bold text-white uppercase flex items-center gap-3">
            <FileText className="w-5 h-5 text-[#bc13fe]" /> EDIT FORM
            <span className="bg-[#bc13fe]/20 text-[#bc13fe] px-2 py-0.5 rounded text-[10px]">{activeConfigPage.id}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-2">Page Title</label>
            <input type="text" value={activeConfigPage.title || ''} onChange={(e) => updateActivePage({ ...activeConfigPage, title: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" />
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-2">Description / Sub-Title</label>
            <input type="text" value={activeConfigPage.description || ''} onChange={(e) => updateActivePage({ ...activeConfigPage, description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold tracking-widest text-white uppercase">Form Fields</h3>
            <button onClick={() => {
              updateActivePage({ ...activeConfigPage, fields: [...(activeConfigPage.fields || []), { id: `field_${Date.now()}`, type: 'text', label: 'New Field', required: false }] });
            }} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-2 border border-white/10">
              <Plus className="w-3 h-3" /> Add Field
            </button>
          </div>

          {(activeConfigPage.fields || []).length === 0 ? (
            <div className="w-full py-12 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center text-gray-500">
              <FileText className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-xs uppercase tracking-widest font-bold">No field data yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(activeConfigPage.fields || []).map((field: any) => (
                <div key={field.id} className="p-4 bg-black/40 border border-white/10 rounded-xl flex flex-col md:flex-row gap-4 items-start md:items-center relative group">
                  <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[9px] text-gray-400 uppercase tracking-wider mb-1 block">Input Type</label>
                      <select value={field.type} onChange={(e) => {
                        updateActivePage({ ...activeConfigPage, fields: activeConfigPage.fields.map((f:any) => f.id === field.id ? { ...f, type: e.target.value } : f) });
                      }} className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white text-xs">
                        <option value="text">Short Text</option>
                        <option value="email">Email</option>
                        <option value="number">WhatsApp / Number</option>
                        <option value="date">Date</option>
                        <option value="textarea">Long Text</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[9px] text-gray-400 uppercase tracking-wider mb-1 block">Question Label</label>
                      <input type="text" value={field.label} onChange={(e) => {
                        updateActivePage({ ...activeConfigPage, fields: activeConfigPage.fields.map((f:any) => f.id === field.id ? { ...f, label: e.target.value } : f) });
                      }} placeholder="Example: What is your name?" className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#bc13fe]/50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-white/10 w-full md:w-auto">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div className={`w-10 h-5 rounded-full p-1 transition-colors ${field.required ? 'bg-[#bc13fe]' : 'bg-gray-700'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full transition-transform ${field.required ? 'translate-x-5' : 'translate-x-0'}`}></div>
                      </div>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Required</span>
                      <input type="checkbox" className="hidden" checked={field.required} onChange={(e) => {
                        updateActivePage({ ...activeConfigPage, fields: activeConfigPage.fields.map((f:any) => f.id === field.id ? { ...f, required: e.target.checked } : f) });
                      }} />
                    </label>
                    <button onClick={() => {
                      updateActivePage({ ...activeConfigPage, fields: activeConfigPage.fields.filter((f:any) => f.id !== field.id) });
                    }} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-auto md:ml-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } else if (typeof activeConfigPage === 'object' && activeConfigPage !== null && activeConfigPage.type === 'video') {
    rightPanelContent = (
      <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6 pb-6 border-b border-white/10">
          <h2 className="text-xl font-heading tracking-widest font-bold text-white uppercase flex items-center gap-3">
            <Video className="w-5 h-5 text-[#bc13fe]" /> EDIT VIDEO PAGE
            <span className="bg-[#bc13fe]/20 text-[#bc13fe] px-2 py-0.5 rounded text-[10px]">{activeConfigPage.id}</span>
          </h2>
        </div>

        <div className="flex flex-col gap-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className={UI_CONTAINER}>
            <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-1">Video Source URL (MP4 / WebM)</label>
            <span className="text-[8px] text-gray-400 mb-2">Max 15 seconds, max 13MB. Upload or paste link.</span>
            
            <div className="flex gap-4 items-center">
               <div className="flex-1">
                 <input type="text" value={activeConfigPage.videoUrl || ''} onChange={(e) => updateActivePage({ ...activeConfigPage, videoUrl: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bc13fe]/50" placeholder="https://..." />
               </div>
               
               <input type="file" accept="video/mp4,video/webm" className="hidden" id="upload-video-page" onChange={async (e) => {
                 const file = e.target.files?.[0];
                 if (!file) return;
                 if (file.size > 13 * 1024 * 1024) { await showDialog('alert', 'Error', 'Video > 13MB limit.'); return; }
                 
                 // Show uploading alert or toast if possible
                 try {
                   if (eventId) {
                     const fileName = `${settings.storage_folder || eventId}/assets/vidpage-${Date.now()}.${file.name.split('.').pop()}`;
                     const { data, error } = await supabase.storage.from('photobooth').upload(fileName, file, {upsert: true});
                     if (!error) {
                       const { data: { publicUrl } } = supabase.storage.from('photobooth').getPublicUrl(fileName);
                       updateActivePage({ ...activeConfigPage, videoUrl: publicUrl });
                     } else {
                       await showDialog('alert', 'Error', error.message);
                     }
                   }
                 } catch (err:any) {
                   await showDialog('alert', 'Error', err.message);
                 }
               }} />
               <label htmlFor="upload-video-page" className="px-4 py-3 bg-[#bc13fe]/20 text-[#bc13fe] hover:bg-[#bc13fe]/40 border border-[#bc13fe]/30 rounded-xl font-bold uppercase text-xs cursor-pointer transition-colors whitespace-nowrap">
                 Upload Video
               </label>
            </div>
            {activeConfigPage.videoUrl && (
              <div className="mt-4 w-full max-w-sm aspect-video bg-black rounded-lg overflow-hidden border border-white/10 mx-auto">
                <video src={activeConfigPage.videoUrl} className="w-full h-full object-cover" controls playsInline />
              </div>
            )}
          </div>

          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Video Display Size</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <button onClick={() => updateActivePage({ ...activeConfigPage, videoSize: 'full'})} className={`py-2 rounded font-bold uppercase text-[10px] border ${activeConfigPage.videoSize === 'full' || !activeConfigPage.videoSize ? 'bg-[#bc13fe]/20 border-[#bc13fe]' : 'bg-transparent border-white/20'}`}>Full Screen</button>
              <button onClick={() => updateActivePage({ ...activeConfigPage, videoSize: 'medium'})} className={`py-2 rounded font-bold uppercase text-[10px] border ${activeConfigPage.videoSize === 'medium' ? 'bg-[#bc13fe]/20 border-[#bc13fe]' : 'bg-transparent border-white/20'}`}>Medium box</button>
              <button onClick={() => updateActivePage({ ...activeConfigPage, videoSize: 'small'})} className={`py-2 rounded font-bold uppercase text-[10px] border ${activeConfigPage.videoSize === 'small' ? 'bg-[#bc13fe]/20 border-[#bc13fe]' : 'bg-transparent border-white/20'}`}>Small box</button>
            </div>
          </div>

          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Interaction / Next Page</label>
            <div className="flex flex-col gap-2 mt-1">
              <label className="flex items-center gap-3 p-3 bg-black/40 border border-white/10 rounded-lg cursor-pointer hover:border-white/30 transition-colors">
                <input type="radio" name="video_int" checked={activeConfigPage.interaction === 'click_anywhere' || !activeConfigPage.interaction} onChange={() => updateActivePage({ ...activeConfigPage, interaction: 'click_anywhere'})} className="accent-[#bc13fe]" />
                <div className="flex flex-col">
                  <span className="text-white text-xs font-bold">Click anywhere to skip/next</span>
                  <span className="text-[10px] text-gray-500">Touching any part of the screen advances</span>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 bg-black/40 border border-white/10 rounded-lg cursor-pointer hover:border-white/30 transition-colors">
                <input type="radio" name="video_int" checked={activeConfigPage.interaction === 'button_next'} onChange={() => updateActivePage({ ...activeConfigPage, interaction: 'button_next'})} className="accent-[#bc13fe]" />
                <div className="flex flex-col">
                  <span className="text-white text-xs font-bold">Add "Launch / Next" button</span>
                  <span className="text-[10px] text-gray-500">Shows an explicit button to advance</span>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 bg-black/40 border border-white/10 rounded-lg cursor-pointer hover:border-white/30 transition-colors">
                <input type="radio" name="video_int" checked={activeConfigPage.interaction === 'watch_until_end'} onChange={() => updateActivePage({ ...activeConfigPage, interaction: 'watch_until_end'})} className="accent-[#bc13fe]" />
                <div className="flex flex-col">
                  <span className="text-white text-xs font-bold">Watch until end</span>
                  <span className="text-[10px] text-gray-500">Automatically advances when video finishes</span>
                </div>
              </label>
            </div>
          </div>

          <div className={UI_CONTAINER}>
             <label className="flex items-center gap-3 cursor-pointer p-4 bg-white/5 border border-white/10 rounded-lg">
                <input type="checkbox" checked={activeConfigPage.showBackButton ?? true} onChange={(e) => updateActivePage({ ...activeConfigPage, showBackButton: e.target.checked})} className="w-5 h-5 accent-[#bc13fe]" />
                <span className="text-white text-xs font-bold uppercase tracking-widest">Show Back Button</span>
             </label>
          </div>
        </div>
      </div>
    );
  } else if (typeof activeConfigPage === 'object' && activeConfigPage !== null && activeConfigPage.type === 'camera_fx') {
    rightPanelContent = (
      <div className="w-full h-full flex flex-col animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6 pb-6 border-b border-white/10">
          <h2 className="text-xl font-heading tracking-widest font-bold text-white uppercase flex items-center gap-3">
            <Wand2 className="w-5 h-5 text-green-400" /> EDIT CAMERA FX
            <span className="bg-green-400/20 text-green-400 px-2 py-0.5 rounded text-[10px]">{activeConfigPage.id}</span>
          </h2>
        </div>

        <div className="flex flex-col gap-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>DeepAR License Key</label>
             <input type="text" value={activeConfigPage.deepArLicenseKey || ''} onChange={(e) => updateActivePage({ ...activeConfigPage, deepArLicenseKey: e.target.value })} className={UI_INPUT} placeholder="Enter your DeepAR License Key" />
          </div>

          <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Instruction Text</label>
             <input type="text" value={activeConfigPage.instructionText || ''} onChange={(e) => updateActivePage({ ...activeConfigPage, instructionText: e.target.value })} className={UI_INPUT} />
          </div>

          <div className={UI_CONTAINER}>
             <label className={UI_LABEL}>Allow Camera Capture</label>
             <label className="flex items-center gap-3 cursor-pointer p-4 bg-white/5 border border-white/10 rounded-lg">
                <input type="checkbox" checked={activeConfigPage.allowCapture ?? true} onChange={(e) => updateActivePage({ ...activeConfigPage, allowCapture: e.target.checked})} className="w-5 h-5 accent-green-400" />
                <span className="text-white text-xs font-bold uppercase tracking-widest">Enable Photo Capture</span>
             </label>
          </div>

          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>DeepAR Effects (.deepar files)</label>
            <div className="flex flex-col gap-2">
              <button onClick={() => {
                const newEffects = [...(activeConfigPage.effects || []), { name: 'New Effect', url: '' }];
                updateActivePage({ ...activeConfigPage, effects: newEffects });
              }} className="self-start px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-colors">
                + Add Effect URL
              </button>
              
              {(activeConfigPage.effects || []).map((effect: any, index: number) => (
                <div key={index} className="flex flex-col gap-2 p-3 bg-black/40 border border-white/10 rounded-lg">
                  <div className="flex gap-2">
                    <input type="text" placeholder="Effect Name" value={effect.name} onChange={(e) => {
                      const newFx = [...activeConfigPage.effects];
                      newFx[index].name = e.target.value;
                      updateActivePage({ ...activeConfigPage, effects: newFx });
                    }} className="flex-1 bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white" />
                    <button onClick={() => {
                      const newFx = [...activeConfigPage.effects];
                      newFx.splice(index, 1);
                      updateActivePage({ ...activeConfigPage, effects: newFx });
                    }} className="p-1 text-red-400 hover:bg-red-400/20 rounded">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <input type="text" placeholder="https://.../effect.deepar" value={effect.url} onChange={(e) => {
                    const newFx = [...activeConfigPage.effects];
                    newFx[index].url = e.target.value;
                    updateActivePage({ ...activeConfigPage, effects: newFx });
                  }} className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    // Global Display Settings
    rightPanelContent = (
      <div className="w-full h-full flex flex-col animate-in fade-in duration-300 overflow-y-auto custom-scrollbar pr-2">
         <div className="text-center mb-6">
            <h2 className="text-xl font-heading tracking-widest font-bold text-[#bc13fe] uppercase mb-1">GLOBAL DISPLAY SETTINGS</h2>
            <p className="text-xs text-gray-400">Click a specific step in the left panel to configure its UI here.</p>
         </div>

         <div className="flex flex-col gap-6">
            {/* Background Settings */}
            <div className="bg-black/40 border border-white/10 p-6 rounded-xl">
               <h3 className="font-heading text-lg text-white uppercase mb-4">Background (Applies to Display)</h3>
               <div className="flex flex-col gap-2 bg-white/5 p-3 rounded border border-white/10 mb-4">
                 <label className={UI_LABEL}>Video Templates</label>
                 <div className="grid grid-cols-4 gap-2 mt-2">
                   {PREDEFINED_VIDEOS.map((url, idx) => (
                     <button key={idx} onClick={() => { updateSetting('backgroundVideoUrl', url); updateSetting('backgroundImage', null); }} className={`aspect-video rounded overflow-hidden border-2 transition-colors ${localSettings.backgroundVideoUrl === url ? 'border-[#bc13fe]' : 'border-transparent hover:border-white/30'}`}>
                       <video src={url} className="w-full h-full object-cover" muted playsInline />
                     </button>
                   ))}
                 </div>
               </div>
               <div className="w-full aspect-video bg-white/5 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden shadow-2xl relative mb-4">
                  {localSettings.backgroundVideoUrl ? (
                     <video src={localSettings.backgroundVideoUrl} className="w-full h-full object-cover opacity-70" autoPlay loop muted playsInline />
                  ) : localSettings.backgroundImage ? (
                    <img src={getGoogleDriveDirectLink(localSettings.backgroundImage)} className="w-full h-full object-cover" alt="Background" />
                  ) : <span className="text-[10px] text-gray-700 font-mono">DEFAULT_DARK</span>}
               </div>

               <input type="file" accept="image/jpeg,image/png" className="hidden" ref={backgroundInputRef} onChange={async (e) => {
                 const file = e.target.files?.[0];
                 if (!file) return;
                 if (file.size > 2 * 1024 * 1024) { await showDialog('alert', 'Error', 'Image > 2MB limit.'); return; }
                 setIsUploadingBackground(true);
                 if (eventId) {
                   const fileName = `${settings.storage_folder || eventId}/assets/bg-${Date.now()}.${file.name.split('.').pop()}`;
                   const { data, error } = await supabase.storage.from('photobooth').upload(fileName, file, {upsert: true});
                   if (!error) {
                     const { data: { publicUrl } } = supabase.storage.from('photobooth').getPublicUrl(fileName);
                     updateSetting('backgroundImage', publicUrl);
                     updateSetting('backgroundVideoUrl', null);
                   }
                   setIsUploadingBackground(false);
                 }
               }} />

               <input type="file" accept="video/mp4,video/webm" className="hidden" ref={backgroundVideoInputRef} onChange={async (e) => {
                 const file = e.target.files?.[0];
                 if (!file) return;
                 if (file.size > 8 * 1024 * 1024) { await showDialog('alert', 'Error', 'Video > 8MB limit.'); return; }
                 setIsUploadingBackgroundVideo(true);
                 if (eventId) {
                   const fileName = `${settings.storage_folder || eventId}/assets/bg-vid-${Date.now()}.${file.name.split('.').pop()}`;
                   const { data, error } = await supabase.storage.from('photobooth').upload(fileName, file, {upsert: true});
                   if (!error) {
                     const { data: { publicUrl } } = supabase.storage.from('photobooth').getPublicUrl(fileName);
                     updateSetting('backgroundVideoUrl', publicUrl);
                     updateSetting('backgroundImage', null);
                   }
                   setIsUploadingBackgroundVideo(false);
                 }
               }} />

               <div className="flex gap-2">
                 <button onClick={() => backgroundInputRef.current?.click()} disabled={isUploadingBackground} className="flex-1 py-3 border border-white/10 hover:border-[#bc13fe] text-[10px] font-bold uppercase bg-white/5 rounded transition-colors text-white">
                   {isUploadingBackground ? 'UPLOADING...' : 'UPLOAD IMAGE (2MB)'}
                 </button>
                 <button onClick={() => backgroundVideoInputRef.current?.click()} disabled={isUploadingBackgroundVideo} className="flex-1 py-3 border border-white/10 hover:border-[#bc13fe] text-[10px] font-bold uppercase bg-white/5 rounded transition-colors text-white">
                   {isUploadingBackgroundVideo ? 'UPLOADING...' : 'UPLOAD VIDEO (8MB)'}
                 </button>
               </div>
               
               {localSettings.backgroundImage && !localSettings.backgroundVideoUrl && (
                  <button onClick={() => updateSetting('backgroundImage', null)} className="w-full mt-2 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase rounded-lg transition-colors">
                    REMOVE IMAGE BACKGROUND
                  </button>
               )}
               {localSettings.backgroundVideoUrl && (
                  <button onClick={() => updateSetting('backgroundVideoUrl', null)} className="w-full mt-2 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase rounded-lg transition-colors">
                    REMOVE VIDEO BACKGROUND
                  </button>
               )}
            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-full pb-32">
      {/* Left Panel: Flow Editor */}
      <div className="w-full lg:w-1/3 bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col h-[700px] lg:sticky top-0">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-heading tracking-widest font-bold text-white uppercase flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#bc13fe]" /> INTERACTIVE FLOW
          </h2>
          {!isFlowDefault && (
            <button 
              onClick={() => {
                setLocalSettings(prev => ({ ...prev, interactiveFlow: DEFAULT_FLOW }));
                setIsDirty(true);
              }}
              className="px-2 py-1 bg-white/5 border border-white/10 hover:border-[#bc13fe]/50 hover:bg-[#bc13fe]/20 rounded text-[10px] font-bold tracking-wider text-green-400 uppercase transition-colors whitespace-nowrap"
            >
              SET TO DEFAULT
            </button>
          )}
        </div>
        
        <p className="text-gray-400 text-xs mb-6">
          Click a step to configure UI & Display. Drag and drop to reorder.
        </p>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="flow-list">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                  {currentFlow.map((stepId, index) => {
                    const isFixed = AVAILABLE_STEPS.find(s => s.id === stepId)?.fixed;
                    const isForm = stepId.startsWith('form');
                    const isVideo = stepId.startsWith('video');
                    const isCustom = isForm || isVideo || stepId.startsWith('camera_fx');
                    const isActive = typeof activeConfigPage === 'string' ? activeConfigPage === stepId : activeConfigPage?.id === stepId;
                    
                    return (
                      <Draggable key={stepId} draggableId={stepId} index={index} isDragDisabled={AVAILABLE_STEPS.find(s => s.id === stepId)?.fixed}>
                        {(provided: any, snapshot: any) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 rounded-xl border bg-black/40 backdrop-blur-sm transition-all shadow-lg group
                              ${snapshot.isDragging ? 'border-[#bc13fe] border-b-4' : ''}
                              ${isActive ? 'border-[#bc13fe] shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                          >
                            <div {...provided.dragHandleProps} className="text-gray-500 hover:text-white cursor-grab active:cursor-grabbing p-1">
                              <GripVertical className="w-4 h-4" />
                            </div>
                            
                            <div 
                              className="flex-1 flex gap-3 text-sm font-bold text-white uppercase tracking-wider items-center cursor-pointer"
                              onClick={() => {
                                if (isCustom) setActiveConfigPage(customPages.find(p => p.id === stepId));
                                else setActiveConfigPage(stepId);
                              }}
                            >
                              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                {renderStepIcon(stepId)}
                              </div>
                              <div className="flex flex-col">
                                <span>{renderStepName(stepId)}</span>
                                {isForm && <span className="text-[9px] text-[#bc13fe] font-normal lowercase tracking-normal">custom form / q&a</span>}
                                {isVideo && <span className="text-[9px] text-[#bc13fe] font-normal lowercase tracking-normal">custom video page</span>}
                                {stepId.startsWith('camera_fx') && <span className="text-[9px] text-green-400 font-normal lowercase tracking-normal">camera fx page</span>}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {((AVAILABLE_STEPS.find(s => s.id === stepId) as any)?.deletable !== false) && !isCustom && (
                                <button onClick={(e) => { e.stopPropagation(); removeStep(stepId); }} className="p-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors border border-transparent opacity-0 group-hover:opacity-100">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              {isCustom && (
                                <button onClick={(e) => { e.stopPropagation(); deleteCustomPage(stepId); }} className="p-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors border border-transparent">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {(() => {
          const cameraCount = currentFlow.filter(id => id === 'capture' || customPages.find(p => p.id === id && p.type === 'camera_fx')).length;
          if (cameraCount > 1) {
            return (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest text-center">
                  ⚠️ You have 2 camera captures, are you sure? Or delete one of them.
                </p>
              </div>
            );
          }
          return null;
        })()}

        <div className="mt-4 pt-6 border-t border-white/10 flex flex-col gap-3">
          <div className="relative" ref={addPageMenuRef}>
            <button onClick={() => setShowAddPageMenu(!showAddPageMenu)} className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-xl text-white text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> ADD PAGE
            </button>
            {showAddPageMenu && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 z-50">
                {!currentFlow.includes('launch') && (
                  <button onClick={addLaunchScreen} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                    <Smartphone className="w-4 h-4 text-[#bc13fe]" /> Add Launch Screen
                  </button>
                )}
                {!currentFlow.includes('concept_select') && (
                  <button onClick={addConceptSelectScreen} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                    <ImageIcon className="w-4 h-4 text-[#bc13fe]" /> Add Concept Selection
                  </button>
                )}
                {!currentFlow.includes('capture') && (
                  <button onClick={addCaptureScreen} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                    <Camera className="w-4 h-4 text-[#bc13fe]" /> Add Capture Screen
                  </button>
                )}
                {!currentFlow.includes('processing') && (
                  <button onClick={addProcessingScreen} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                    <Wand2 className="w-4 h-4 text-[#bc13fe]" /> Add AI Processing
                  </button>
                )}
                {!currentFlow.includes('result') && (
                  <button onClick={addResultScreen} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-[#bc13fe]" /> Add Result Screen
                  </button>
                )}
                <button onClick={() => addCustomForm('New Form')} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-[#bc13fe]" /> Add Form
                </button>
                <button onClick={() => addCustomForm('Question & Answer')} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-[#bc13fe]" /> Add Question & Answer
                </button>
                <button onClick={addVideoPage} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest border-b border-white/5 flex items-center gap-3">
                  <Video className="w-4 h-4 text-orange-400" /> Add Video Page
                </button>
                <button onClick={addCameraFxPage} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-3">
                  <Wand2 className="w-4 h-4 text-green-400" /> Add Camera FX
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {AVAILABLE_STEPS.filter(s => !s.fixed && !currentFlow.includes(s.id) && s.id !== 'launch' && s.id !== 'processing').map(step => (
              <button key={step.id} onClick={() => { setLocalSettings(prev => ({ ...prev, interactiveFlow: [...(prev.interactiveFlow || []), step.id] })); setIsDirty(true); }} className="px-3 py-1.5 bg-white/5 hover:bg-[#bc13fe]/20 hover:text-white border border-white/10 hover:border-[#bc13fe]/50 rounded-lg text-gray-400 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1">
                <Plus className="w-3 h-3" /> {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel: Page Editor & Sub-Settings */}
      <div className="w-full lg:w-2/3 flex flex-col xl:flex-row gap-6">
        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl min-h-[700px] flex flex-col relative overflow-hidden">
           {activeConfigPage && (
              <button onClick={() => setActiveConfigPage(null)} className="absolute top-6 right-6 z-10 p-2 bg-white/5 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1">
                BACK TO GLOBAL
              </button>
           )}
           
           {rightPanelContent}
        </div>
        
        {/* Preview Panel */}
        <div className="w-full xl:w-[320px] bg-white/5 flex flex-col items-center p-4 border border-white/10 rounded-2xl shadow-xl h-fit sticky top-0">
            <h3 className="text-white font-bold tracking-widest text-[#bc13fe] uppercase text-sm mb-4 flex items-center gap-2">
              <MonitorPlay className="w-4 h-4" /> LIVE PREVIEW
            </h3>
            
            <div className="flex gap-2 mb-6 w-full">
               <button onClick={() => setPreviewRatio('9:16')} className={`flex-1 py-2 border rounded-lg text-[10px] font-bold uppercase transition-colors ${previewRatio === '9:16' ? 'bg-[#bc13fe]/20 border-[#bc13fe] text-[#bc13fe]' : 'bg-transparent border-white/20 text-gray-400 hover:text-white'}`}>Portrait</button>
               <button onClick={() => setPreviewRatio('16:9')} className={`flex-1 py-2 border rounded-lg text-[10px] font-bold uppercase transition-colors ${previewRatio === '16:9' ? 'bg-[#bc13fe]/20 border-[#bc13fe] text-[#bc13fe]' : 'bg-transparent border-white/20 text-gray-400 hover:text-white'}`}>Landscape</button>
            </div>
            
            <div className={`bg-black border-[4px] border-[#bc13fe]/50 rounded-2xl relative shadow-[0_0_30px_rgba(188,19,254,0.15)] transition-all duration-300 overflow-hidden ${previewRatio === '9:16' ? 'w-[270px] h-[480px]' : 'w-[280px] h-[157px]'}`}>
                <iframe 
                   ref={iframeRef}
                   src={`/app/${eventId}?preview_step=${typeof activeConfigPage === 'string' ? activeConfigPage : activeConfigPage?.id || 'launch'}&preview_mode=true`} 
                   className="absolute border-0" 
                   style={{
                       width: previewRatio === '9:16' ? '1080px' : '1920px',
                       height: previewRatio === '9:16' ? '1920px' : '1080px',
                       transform: previewRatio === '9:16' ? 'scale(0.25)' : 'scale(0.1458)', // 280 / 1920
                       transformOrigin: 'top left',
                       pointerEvents: 'auto'
                   }} 
                />
            </div>
            <p className="text-gray-500 text-[10px] mt-6 text-center leading-relaxed">
              Preview updates live as you edit.<br/>Shows UI layout only, not actual AI or camera.
            </p>
        </div>
      </div>
    </div>
  );
});

AdminInteractiveTab.displayName = 'AdminInteractiveTab';
export default AdminInteractiveTab;
