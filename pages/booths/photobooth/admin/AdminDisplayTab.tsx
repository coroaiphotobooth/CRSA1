import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { PhotoboothSettings, UIDisplaySettings } from '../../../../types';
import { uploadBackgroundToGas } from '../../../../lib/appsScript';
import { getGoogleDriveDirectLink } from '../../../../lib/imageUtils';
import { supabase } from '../../../../lib/supabase';
import { saveSettingsToGas } from '../../../../lib/appsScript';
import { useDialog } from '../../../../components/DialogProvider';

export interface AdminDisplayTabRef {
  hasUnsavedChanges: () => boolean;
  saveSettings: () => Promise<void>;
}

interface AdminDisplayTabProps {
  settings: PhotoboothSettings;
  onSaveSettings: (settings: PhotoboothSettings) => void;
}

const defaultUI: UIDisplaySettings = {
  eventNameSize: 'text-6xl',
  eventDescSize: 'text-sm',
  fontFamily: 'font-sans',
  buttonColor: '#ea580c',
  conceptLayout: 'grid',
  photoboothFlow: 'launch_concept_photo',
  launchLayout: 'split_left_right',
  showFrameDuringCapture: false,
  captureButtonPosition: 'bottom',
  resultButtonsPosition: 'bottom'
};

const UI_SECTION_TITLE = "font-heading text-xl text-[#bc13fe] border-b border-white/5 pb-4 uppercase italic";
const UI_GRID_BOX = "glass-card p-6 md:p-10 flex flex-col gap-8 h-fit backdrop-blur-md bg-black/60 rounded-xl border border-white/10";
const UI_LABEL = "text-[10px] text-gray-500 uppercase tracking-widest font-bold";
const UI_INPUT = "w-full bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-[#bc13fe] outline-none transition-colors rounded-lg cursor-pointer";
const UI_INPUT_TEXT = "flex-1 bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-[#bc13fe] outline-none transition-colors rounded-lg";
const UI_CONTAINER = "flex flex-col gap-3";

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

export const AdminDisplayTab = forwardRef<AdminDisplayTabRef, AdminDisplayTabProps>(({ settings, onSaveSettings }, ref) => {
  const [localUI, setLocalUI] = useState<UIDisplaySettings>(settings.uiSettings || defaultUI);
  const [localBackgroundImage, setLocalBackgroundImage] = useState<string | null>(settings.backgroundImage || null);
  const [localBackgroundVideoUrl, setLocalBackgroundVideoUrl] = useState<string | null>(settings.backgroundVideoUrl || null);
  
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingBackgroundVideo, setIsUploadingBackgroundVideo] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { eventId } = useParams<{ eventId: string }>();
  const { showDialog } = useDialog();
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const backgroundVideoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const isDirty = JSON.stringify(localUI) !== JSON.stringify(settings.uiSettings || defaultUI) ||
                    localBackgroundImage !== (settings.backgroundImage || null) ||
                    localBackgroundVideoUrl !== (settings.backgroundVideoUrl || null);
    setHasChanges(isDirty);
  }, [localUI, settings.uiSettings, localBackgroundImage, settings.backgroundImage, localBackgroundVideoUrl, settings.backgroundVideoUrl]);

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasChanges,
    saveSettings: async () => {
      const mergedSettings = { 
        ...settings, 
        uiSettings: localUI,
        backgroundImage: localBackgroundImage,
        backgroundVideoUrl: localBackgroundVideoUrl
      };
      
      // Save locally via props
      onSaveSettings(mergedSettings);
      
      // Save to Cloud/DB and Show Notification Popup
      if (eventId) {
        try {
          const { error } = await supabase
            .from('events')
            .update({ settings: mergedSettings })
            .eq('id', eventId);
            
          if (error) throw error;
          await showDialog('alert', 'Success', 'Display Settings saved locally and synced to Database.');
        } catch (err) {
          console.error("Supabase display sync error:", err);
          await showDialog('alert', 'Warning', 'Display Settings saved LOCALLY. Supabase sync failed.');
        }
      } else {
        const ok = await saveSettingsToGas(mergedSettings, settings.adminPin);
        if (ok) {
          await showDialog('alert', 'Success', 'Display Settings saved locally and synced to Cloud.');
        } else {
          await showDialog('alert', 'Warning', 'Display Settings saved LOCALLY. Cloud sync failed.');
        }
      }
      
      setHasChanges(false);
    }
  }));

  const handleChange = (key: keyof UIDisplaySettings, value: any) => {
    setLocalUI(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="text-white space-y-6">
      <div className={UI_GRID_BOX}>
        <h3 className={UI_SECTION_TITLE}>Typography & Branding</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Event Name Size</label>
            <select 
              value={localUI.eventNameSize}
              onChange={(e) => handleChange('eventNameSize', e.target.value)}
              className={UI_INPUT}
            >
              <option value="text-4xl">Small (4xl)</option>
              <option value="text-6xl">Medium (6xl)</option>
              <option value="text-8xl">Large (8xl)</option>
            </select>
          </div>
          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Event Description Size</label>
            <select 
              value={localUI.eventDescSize}
              onChange={(e) => handleChange('eventDescSize', e.target.value)}
              className={UI_INPUT}
            >
              <option value="text-sm">Small</option>
              <option value="text-base">Medium</option>
              <option value="text-lg">Large</option>
            </select>
          </div>
          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Font Family</label>
            <select 
              value={localUI.fontFamily}
              onChange={(e) => handleChange('fontFamily', e.target.value)}
              className={UI_INPUT}
            >
              <option value="font-sans">Modern (Sans)</option>
              <option value="font-serif">Elegant (Serif)</option>
              <option value="font-mono">Technical (Mono)</option>
              <option value="font-heading">Bold (Heading)</option>
            </select>
          </div>
          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Theme Button Color (Hex)</label>
            <div className="flex gap-2">
               <input 
                 type="color"
                 value={localUI.buttonColor}
                 onChange={(e) => handleChange('buttonColor', e.target.value)}
                 className="w-16 h-12 rounded cursor-pointer bg-black/50 border border-white/20"
               />
               <input 
                 type="text"
                 value={localUI.buttonColor}
                 onChange={(e) => handleChange('buttonColor', e.target.value)}
                 className={UI_INPUT_TEXT}
                 placeholder="#ea580c"
               />
            </div>
          </div>
        </div>
      </div>

      <div className={UI_GRID_BOX}>
        <h3 className={UI_SECTION_TITLE}>Page Layouts & Flows</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Column 1: Flows and Sequencing */}
          <div className="flex flex-col gap-6">
            <div className={UI_CONTAINER}>
              <label className={UI_LABEL}>Photobooth Flow</label>
              <div className="flex flex-col gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => handleChange('photoboothFlow', 'launch_concept_photo')}
                  className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all duration-300
                    ${localUI.photoboothFlow === 'launch_concept_photo' || !localUI.photoboothFlow ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}
                  `}
                >
                  <div className="font-bold text-gray-500 uppercase text-[10px] mb-1 tracking-widest">Flow 1 (Default)</div>
                  <div className="text-sm font-bold text-white tracking-wide">Launch &rarr; Concept &rarr; Photo &rarr; Result</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleChange('photoboothFlow', 'launch_photo_concept')}
                  className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all duration-300
                    ${localUI.photoboothFlow === 'launch_photo_concept' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}
                  `}
                >
                  <div className="font-bold text-gray-500 uppercase text-[10px] mb-1 tracking-widest">Flow 2</div>
                  <div className="text-sm font-bold text-white tracking-wide">Launch &rarr; Photo &rarr; Concept &rarr; Result</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleChange('photoboothFlow', 'no_launch_concept_photo')}
                  className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all duration-300
                    ${localUI.photoboothFlow === 'no_launch_concept_photo' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}
                  `}
                >
                  <div className="font-bold text-gray-500 uppercase text-[10px] mb-1 tracking-widest">Flow 3 (Skip Launch)</div>
                  <div className="text-sm font-bold text-white tracking-wide">Concept &rarr; Photo &rarr; Result</div>
                </button>
              </div>
            </div>
            
            {localUI.photoboothFlow === 'no_launch_concept_photo' && (
               <div className={UI_CONTAINER}>
                 <label className={UI_LABEL}>Show Name Event & Description in Themes</label>
                 <div className="flex flex-wrap gap-2 mt-2">
                   <button
                     type="button"
                     onClick={() => handleChange('themeEventInfoPosition', 'none')}
                     className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                       ${localUI.themeEventInfoPosition === 'none' || !localUI.themeEventInfoPosition ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                     `}
                   >
                     Hidden
                   </button>
                   <button
                     type="button"
                     onClick={() => handleChange('themeEventInfoPosition', 'top')}
                     className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                       ${localUI.themeEventInfoPosition === 'top' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                     `}
                   >
                     Top Position
                   </button>
                   <button
                     type="button"
                     onClick={() => handleChange('themeEventInfoPosition', 'bottom')}
                     className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                       ${localUI.themeEventInfoPosition === 'bottom' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                     `}
                   >
                     Bottom Position
                   </button>
                 </div>
               </div>
            )}

            {localUI.photoboothFlow !== 'no_launch_concept_photo' && (
              <div className={UI_CONTAINER}>
                <label className={UI_LABEL}>Launch Page Layout</label>
                <div className="flex flex-col gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => handleChange('launchLayout', 'split_left_right')}
                    className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all duration-300 flex items-center justify-between
                      ${localUI.launchLayout === 'split_left_right' || !localUI.launchLayout ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}
                    `}
                  >
                    <div>
                      <div className="font-bold text-white uppercase text-xs mb-0.5">Split View (Default)</div>
                      <div className="text-[10px] text-gray-400">Launch Left | Gallery Right</div>
                    </div>
                    <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center bg-black/50">
                      <div className="w-3 h-3 flex gap-0.5">
                        <div className="w-1/2 h-full bg-[#bc13fe] rounded-[2px]" />
                        <div className="w-1/2 h-full bg-white/50 rounded-[2px]" />
                      </div>
                    </div>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => handleChange('launchLayout', 'top_bottom')}
                    className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all duration-300 flex items-center justify-between
                      ${localUI.launchLayout === 'top_bottom' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}
                    `}
                  >
                    <div>
                      <div className="font-bold text-white uppercase text-xs mb-0.5">Stacked View</div>
                      <div className="text-[10px] text-gray-400">Launch Top | Gallery Bottom</div>
                    </div>
                    <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center bg-black/50">
                      <div className="w-3 h-3 flex flex-col gap-0.5">
                        <div className="w-full h-1/2 bg-[#bc13fe] rounded-[2px]" />
                        <div className="w-full h-1/2 bg-white/50 rounded-[2px]" />
                      </div>
                    </div>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => handleChange('launchLayout', 'background_only')}
                    className={`text-left py-2.5 px-4 rounded-xl border-2 transition-all duration-300 flex items-center justify-between
                      ${localUI.launchLayout === 'background_only' ? 'border-[#bc13fe] bg-[#bc13fe]/10 shadow-[0_0_15px_rgba(188,19,254,0.3)]' : 'border-white/10 bg-black/40 hover:border-white/30'}
                    `}
                  >
                    <div>
                      <div className="font-bold text-white uppercase text-xs mb-0.5">Only Background</div>
                      <div className="text-[10px] text-gray-400">Hidden UI | Click Anywhere to Start</div>
                    </div>
                    <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center bg-black/50">
                      <div className="w-3 h-3 bg-white/20 rounded-[2px]" />
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Specific Component Styles */}
          <div className="flex flex-col gap-6">
            <div className={UI_CONTAINER}>
              <label className={UI_LABEL}>Concept Selector Style</label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <button
                  type="button"
                  onClick={() => handleChange('conceptLayout', 'grid')}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all duration-300 aspect-square 
                    ${localUI.conceptLayout === 'grid' || !localUI.conceptLayout ? 'border-[#bc13fe] ring-4 ring-[#bc13fe]/30 shadow-[0_0_20px_rgba(188,19,254,0.4)] scale-[1.02]' : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'}
                  `}
                >
                  <img 
                    src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOGO/GRID.jpg" 
                    alt="Grid Layout" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-sm p-2 text-center text-white text-xs font-bold uppercase tracking-widest border-t border-white/10">
                    GRID LAYOUT
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleChange('conceptLayout', 'carousel')}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all duration-300 aspect-square 
                    ${localUI.conceptLayout === 'carousel' ? 'border-[#bc13fe] ring-4 ring-[#bc13fe]/30 shadow-[0_0_20px_rgba(188,19,254,0.4)] scale-[1.02]' : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'}
                  `}
                >
                  <img 
                    src="https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/LOGO/SLIDE.jpg" 
                    alt="Slide Layout" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-sm p-2 text-center text-white text-xs font-bold uppercase tracking-widest border-t border-white/10">
                    SLIDE / CAROUSEL
                  </div>
                </button>
              </div>
            </div>

            <div className={UI_CONTAINER}>
              <label className={UI_LABEL}>Result Buttons Position</label>
              <div className="flex flex-wrap gap-2 mt-2">
                 <button
                   type="button"
                   onClick={() => handleChange('resultButtonsPosition', 'bottom')}
                   className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                     ${localUI.resultButtonsPosition === 'bottom' || !localUI.resultButtonsPosition ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                   `}
                 >
                   Bottom (Default)
                 </button>
                 <button
                   type="button"
                   onClick={() => handleChange('resultButtonsPosition', 'right')}
                   className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                     ${localUI.resultButtonsPosition === 'right' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                   `}
                 >
                   Right Side
                 </button>
                 <button
                   type="button"
                   onClick={() => handleChange('resultButtonsPosition', 'top')}
                   className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                     ${localUI.resultButtonsPosition === 'top' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                   `}
                 >
                   Top
                 </button>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      <div className={UI_GRID_BOX}>
        <h3 className={UI_SECTION_TITLE}>Camera Tweaks</h3>
        <div className="grid grid-cols-1 gap-10">
          <div className="flex flex-col gap-5">
             <label className="flex items-center gap-3 cursor-pointer p-4 bg-black/50 border border-white/10 rounded-lg hover:border-[#bc13fe] transition-colors">
               <input 
                 type="checkbox"
                 checked={localUI.showFrameDuringCapture}
                 onChange={(e) => handleChange('showFrameDuringCapture', e.target.checked)}
                 className="w-5 h-5 accent-[#bc13fe]"
               />
               <span className="text-white text-sm font-bold uppercase tracking-widest">Show PNG Frame Guide during Capture Phase</span>
             </label>
             <label className="flex items-center gap-3 cursor-pointer p-4 bg-black/50 border border-white/10 rounded-lg hover:border-[#bc13fe] transition-colors">
               <input 
                 type="checkbox"
                 checked={localUI.confirmPhotoBeforeGenerate || false}
                 onChange={(e) => handleChange('confirmPhotoBeforeGenerate', e.target.checked)}
                 className="w-5 h-5 accent-[#bc13fe]"
               />
               <span className="text-white text-sm font-bold uppercase tracking-widest">Confirm Photo Before Generate</span>
             </label>
          </div>
          <div className={UI_CONTAINER}>
            <label className={UI_LABEL}>Capture Button Position</label>
            <div className="flex flex-wrap gap-2 mt-2">
               <button
                 type="button"
                 onClick={() => handleChange('captureButtonPosition', 'bottom')}
                 className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                   ${localUI.captureButtonPosition === 'bottom' || !localUI.captureButtonPosition ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                 `}
               >
                 Bottom (Default)
               </button>
               <button
                 type="button"
                 onClick={() => handleChange('captureButtonPosition', 'top_right')}
                 className={`flex-1 py-1.5 px-3 rounded-lg border-2 font-bold uppercase text-[10px] transition-all duration-300
                   ${localUI.captureButtonPosition === 'top_right' ? 'border-[#bc13fe] bg-[#bc13fe]/20 text-white' : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/30 hover:text-white'}
                 `}
               >
                 Top Right
               </button>
            </div>
          </div>
        </div>
      </div>

      <div className={UI_GRID_BOX}>
        <h3 className={UI_SECTION_TITLE}>Background (Applies to Display)</h3>
        
        {/* Video Templates */}
        <div className="flex flex-col gap-2 bg-white/5 p-3 rounded border border-white/10">
          <label className={UI_LABEL}>Video Templates</label>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {PREDEFINED_VIDEOS.map((url, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setLocalBackgroundVideoUrl(url);
                  setLocalBackgroundImage(null);
                }}
                className={`aspect-video rounded overflow-hidden border-2 transition-colors ${localBackgroundVideoUrl === url ? 'border-[#bc13fe]' : 'border-transparent hover:border-white/30'}`}
              >
                <video src={url} className="w-full h-full object-cover" muted playsInline />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="w-full aspect-video bg-white/5 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden mx-auto shadow-2xl relative">
            {localBackgroundVideoUrl ? (
               <video src={localBackgroundVideoUrl} className="w-full h-full object-cover opacity-70" autoPlay loop muted playsInline />
            ) : localBackgroundImage ? (
              <img src={getGoogleDriveDirectLink(localBackgroundImage)} className="w-full h-full object-cover" alt="Background" />
            ) : <span className="text-[10px] text-gray-700 font-mono">DEFAULT_DARK</span>}
            
            {localBackgroundVideoUrl && <div className="absolute top-2 right-2 bg-[#bc13fe] px-2 py-1 rounded text-[8px] font-bold">VIDEO MODE</div>}
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
              const folderName = settings.storage_folder || eventId;
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
                setLocalBackgroundImage(publicUrl);
                setLocalBackgroundVideoUrl(null);
                await showDialog('alert', 'Success', 'Background Image updated');
              }
              setIsUploadingBackground(false);
            } else {
              const reader = new FileReader();
              reader.onload = async () => {
                const res = await uploadBackgroundToGas(reader.result as string, settings.adminPin);
                if (res.ok) {
                  setLocalBackgroundImage(res.url);
                  setLocalBackgroundVideoUrl(null);
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
                const folderName = settings.storage_folder || eventId;
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
                  setLocalBackgroundVideoUrl(publicUrl);
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

          {localBackgroundImage && !localBackgroundVideoUrl && (
            <button onClick={() => {
              setLocalBackgroundImage(null);
            }} className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase bg-transparent rounded-lg transition-colors">
              REMOVE IMAGE BACKGROUND
            </button>
          )}
          {localBackgroundVideoUrl && (
            <button onClick={() => {
              setLocalBackgroundVideoUrl(null);
            }} className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase bg-transparent rounded-lg transition-colors">
              REMOVE VIDEO BACKGROUND
            </button>
          )}
        </div>
      </div>

      {hasChanges && (
        <div className="text-amber-500 text-xs italic mt-4">
          Note: You have unsaved UI Display changes. Don't forget to save.
        </div>
      )}
    </div>
  );
});

AdminDisplayTab.displayName = 'AdminDisplayTab';
