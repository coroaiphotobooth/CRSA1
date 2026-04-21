import React, { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { PhotoboothSettings, UIDisplaySettings } from '../../../../types';

export interface AdminDisplayTabRef {
  hasUnsavedChanges: () => boolean;
  saveSettings: () => void;
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

const UI_SECTION_TITLE = "uppercase tracking-widest text-xs font-bold text-gray-500 mb-4";
const UI_GRID_BOX = "bg-white/5 p-6 rounded-lg mb-6 border border-white/10";
const UI_LABEL = "block text-xs font-bold text-white mb-2 uppercase tracking-wider";

export const AdminDisplayTab = forwardRef<AdminDisplayTabRef, AdminDisplayTabProps>(({ settings, onSaveSettings }, ref) => {
  const [localUI, setLocalUI] = useState<UIDisplaySettings>(settings.uiSettings || defaultUI);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const isDirty = JSON.stringify(localUI) !== JSON.stringify(settings.uiSettings || defaultUI);
    setHasChanges(isDirty);
  }, [localUI, settings.uiSettings]);

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasChanges,
    saveSettings: () => {
      onSaveSettings({ ...settings, uiSettings: localUI });
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={UI_LABEL}>Event Name Size</label>
            <select 
              value={localUI.eventNameSize}
              onChange={(e) => handleChange('eventNameSize', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="text-4xl">Small (4xl)</option>
              <option value="text-6xl">Medium (6xl)</option>
              <option value="text-8xl">Large (8xl)</option>
            </select>
          </div>
          <div>
            <label className={UI_LABEL}>Event Description Size</label>
            <select 
              value={localUI.eventDescSize}
              onChange={(e) => handleChange('eventDescSize', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="text-sm">Small</option>
              <option value="text-base">Medium</option>
              <option value="text-lg">Large</option>
            </select>
          </div>
          <div>
            <label className={UI_LABEL}>Font Family</label>
            <select 
              value={localUI.fontFamily}
              onChange={(e) => handleChange('fontFamily', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="font-sans">Modern (Sans)</option>
              <option value="font-serif">Elegant (Serif)</option>
              <option value="font-mono">Technical (Mono)</option>
              <option value="font-heading">Bold (Heading)</option>
            </select>
          </div>
          <div>
            <label className={UI_LABEL}>Theme Button Color (Hex)</label>
            <div className="flex gap-2">
               <input 
                 type="color"
                 value={localUI.buttonColor}
                 onChange={(e) => handleChange('buttonColor', e.target.value)}
                 className="w-12 h-10 rounded cursor-pointer bg-black/50 border border-white/20"
               />
               <input 
                 type="text"
                 value={localUI.buttonColor}
                 onChange={(e) => handleChange('buttonColor', e.target.value)}
                 className="flex-1 bg-black/50 border border-white/20 rounded p-2 text-white"
                 placeholder="#ea580c"
               />
            </div>
          </div>
        </div>
      </div>

      <div className={UI_GRID_BOX}>
        <h3 className={UI_SECTION_TITLE}>Page Layouts & Flows</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={UI_LABEL}>Photobooth Flow</label>
            <select 
              value={localUI.photoboothFlow}
              onChange={(e) => handleChange('photoboothFlow', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="launch_concept_photo">1. Launch &rarr; Concept &rarr; Photo &rarr; Result (Default)</option>
              <option value="launch_photo_concept">2. Launch &rarr; Photo &rarr; Concept &rarr; Result</option>
              <option value="no_launch_concept_photo">3. Skip Launch &rarr; Concept &rarr; Photo &rarr; Result</option>
            </select>
          </div>
          {localUI.photoboothFlow === 'no_launch_concept_photo' && (
             <div className="md:col-span-1">
               <label className={UI_LABEL}>Show Name Event & Description in Themes</label>
               <select 
                 value={localUI.themeEventInfoPosition || 'none'}
                 onChange={(e) => handleChange('themeEventInfoPosition', e.target.value)}
                 className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
               >
                 <option value="none">Hidden (Default)</option>
                 <option value="top">Top</option>
                 <option value="bottom">Bottom</option>
               </select>
             </div>
          )}
          <div>
            <label className={UI_LABEL}>Concept Selector Style</label>
            <select 
              value={localUI.conceptLayout}
              onChange={(e) => handleChange('conceptLayout', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="grid">Grid Layout (Default)</option>
              <option value="carousel">Slide / Carousel (Big Center)</option>
            </select>
          </div>
          <div>
            <label className={UI_LABEL}>Launch Page Layout</label>
            <select 
              value={localUI.launchLayout}
              onChange={(e) => handleChange('launchLayout', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="split_left_right">Split: Launch Left, Gallery Right (Default)</option>
              <option value="top_bottom">Stacked: Launch Top, Gallery Bottom</option>
            </select>
          </div>
          <div>
            <label className={UI_LABEL}>Result Buttons Position</label>
            <select 
              value={localUI.resultButtonsPosition}
              onChange={(e) => handleChange('resultButtonsPosition', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="bottom">Bottom (Default)</option>
              <option value="right">Right Side</option>
              <option value="top">Top</option>
            </select>
          </div>
        </div>
      </div>

      <div className={UI_GRID_BOX}>
        <h3 className={UI_SECTION_TITLE}>Camera Tweaks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
             <label className="flex items-center gap-3">
               <input 
                 type="checkbox"
                 checked={localUI.showFrameDuringCapture}
                 onChange={(e) => handleChange('showFrameDuringCapture', e.target.checked)}
                 className="w-5 h-5 accent-orange-500 rounded border-white/20"
               />
               <span className="text-white text-sm">Show PNG Frame Guide during Capture Phase</span>
             </label>
             <label className="flex items-center gap-3">
               <input 
                 type="checkbox"
                 checked={localUI.confirmPhotoBeforeGenerate || false}
                 onChange={(e) => handleChange('confirmPhotoBeforeGenerate', e.target.checked)}
                 className="w-5 h-5 accent-orange-500 rounded border-white/20"
               />
               <span className="text-white text-sm">Confirm Photo Before Generate</span>
             </label>
          </div>
          <div>
            <label className={UI_LABEL}>Capture Button Position</label>
            <select 
              value={localUI.captureButtonPosition}
              onChange={(e) => handleChange('captureButtonPosition', e.target.value)}
              className="w-full bg-black/50 border border-white/20 rounded p-2 text-white"
            >
              <option value="bottom">Bottom (Default)</option>
              <option value="top_right">Top Right</option>
            </select>
          </div>
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
