import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useParams } from 'react-router-dom';
import { PhotoboothSettings, AspectRatio, MonitorTheme } from '../../types';
import { supabase } from '../../lib/supabase';
import { useDialog } from '../../components/DialogProvider';
import { ExternalLink, Copy, Monitor, LayoutGrid, Sparkles } from 'lucide-react';

export interface GuestbookSettingsTabRef {
  saveSettings: () => Promise<void>;
}

interface GuestbookSettingsTabProps {
  settings: PhotoboothSettings;
  onSaveSettings: (settings: PhotoboothSettings) => void;
  gasUrl: string;
}

const GuestbookSettingsTab = forwardRef<GuestbookSettingsTabRef, GuestbookSettingsTabProps>(({ settings, onSaveSettings, gasUrl }, ref) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const { eventId } = useParams<{ eventId: string }>();
  const [isUploadingOverlay, setIsUploadingOverlay] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingBackgroundVideo, setIsUploadingBackgroundVideo] = useState(false);
  const [copied, setCopied] = useState(false);
  const { showDialog } = useDialog();

  const overlayInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const backgroundVideoInputRef = useRef<HTMLInputElement>(null);

  const monitorUrl = `${window.location.origin}/guestbook/${eventId}/monitor?theme=${localSettings.monitorTheme || 'physics'}`;
  const guestUrl = `${window.location.origin}/guestbook/${eventId}/guest`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      await handleSaveSettings();
    }
  }));

  useEffect(() => {
    setLocalSettings(prev => {
      const merged = { ...settings };
      if (merged.cameraRotation === undefined) merged.cameraRotation = 0;
      if (!merged.outputRatio) merged.outputRatio = '9:16';
      if (merged.eventType === undefined) merged.eventType = 'guestbook';
      if (merged.boothMode === undefined) merged.boothMode = 'photo';
      if (merged.processingMode === undefined) merged.processingMode = 'normal';
      if (!merged.monitorTheme) merged.monitorTheme = 'physics';
      return merged;
    });
  }, [settings]);

  const handleSaveSettings = async () => {
    onSaveSettings(localSettings);
  };

  const handleOverlayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      await showDialog('alert', 'Error', 'Please upload a PNG file for the overlay.');
      return;
    }

    setIsUploadingOverlay(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `overlays/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photobooth')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photobooth')
        .getPublicUrl(filePath);

      setLocalSettings({ ...localSettings, overlayImage: publicUrl });
      await showDialog('alert', 'Success', 'Overlay uploaded successfully!');
    } catch (error) {
      console.error("Overlay upload failed:", error);
      await showDialog('alert', 'Error', 'Failed to upload overlay.');
    } finally {
      setIsUploadingOverlay(false);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBackground(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `backgrounds/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photobooth')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photobooth')
        .getPublicUrl(filePath);

      setLocalSettings({ ...localSettings, backgroundImage: publicUrl, backgroundVideoUrl: null });
      await showDialog('alert', 'Success', 'Background uploaded successfully!');
    } catch (error) {
      console.error("Background upload failed:", error);
      await showDialog('alert', 'Error', 'Failed to upload background.');
    } finally {
      setIsUploadingBackground(false);
    }
  };

  const handleBackgroundVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      await showDialog('alert', 'Error', 'Video size must be less than 8MB');
      return;
    }

    setIsUploadingBackgroundVideo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `backgrounds/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photobooth')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photobooth')
        .getPublicUrl(filePath);

      setLocalSettings({ ...localSettings, backgroundVideoUrl: publicUrl, backgroundImage: null });
      await showDialog('alert', 'Success', 'Video background uploaded successfully!');
    } catch (error) {
      console.error("Video upload failed:", error);
      await showDialog('alert', 'Error', 'Failed to upload video background.');
    } finally {
      setIsUploadingBackgroundVideo(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Quick Links */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-[#bc13fe]">
          <ExternalLink className="w-5 h-5" />
          Quick Links
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Monitor URL (Open on TV/LED)</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={monitorUrl}
                className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300"
              />
              <button 
                onClick={() => copyToClipboard(monitorUrl)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title="Copy Link"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button 
                onClick={() => window.open(monitorUrl, '_blank')}
                className="p-2 bg-[#bc13fe] hover:bg-[#a010d8] rounded-lg transition-colors"
                title="Open Monitor"
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Guest URL (For QR Code)</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={guestUrl}
                className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300"
              />
              <button 
                onClick={() => copyToClipboard(guestUrl)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {copied && <p className="text-green-400 text-xs mt-2">Copied to clipboard!</p>}
          </div>
        </div>
      </div>

      {/* Display Theme */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-[#bc13fe]">
          <Monitor className="w-5 h-5" />
          Display Theme
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button 
            onClick={() => setLocalSettings({ ...localSettings, monitorTheme: 'slider' })}
            className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${localSettings.monitorTheme === 'slider' ? 'border-[#bc13fe] bg-[#bc13fe]/10' : 'border-white/10 hover:border-white/30 bg-black/30'}`}
          >
            <Monitor className={`w-6 h-6 ${localSettings.monitorTheme === 'slider' ? 'text-[#bc13fe]' : 'text-gray-400'}`} />
            <div className="text-left">
              <h3 className="font-bold">Slider (Focus)</h3>
              <p className="text-xs text-gray-400">Shows one entry at a time</p>
            </div>
          </button>
          
          <button 
            onClick={() => setLocalSettings({ ...localSettings, monitorTheme: 'grid' })}
            className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${localSettings.monitorTheme === 'grid' ? 'border-[#bc13fe] bg-[#bc13fe]/10' : 'border-white/10 hover:border-white/30 bg-black/30'}`}
          >
            <LayoutGrid className={`w-6 h-6 ${localSettings.monitorTheme === 'grid' ? 'text-[#bc13fe]' : 'text-gray-400'}`} />
            <div className="text-left">
              <h3 className="font-bold">Grid Wall</h3>
              <p className="text-xs text-gray-400">Shows multiple entries in a grid</p>
            </div>
          </button>

          <button 
            onClick={() => setLocalSettings({ ...localSettings, monitorTheme: 'physics' })}
            className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${localSettings.monitorTheme === 'physics' ? 'border-[#bc13fe] bg-[#bc13fe]/10' : 'border-white/10 hover:border-white/30 bg-black/30'}`}
          >
            <Sparkles className={`w-6 h-6 ${localSettings.monitorTheme === 'physics' ? 'text-[#bc13fe]' : 'text-gray-400'}`} />
            <div className="text-left">
              <h3 className="font-bold">Floating Physics</h3>
              <p className="text-xs text-gray-400">Interactive floating photos</p>
            </div>
          </button>
        </div>

        {/* Theme Specific Settings */}
        <div className="mt-8 pt-8 border-t border-white/10">
          {localSettings.monitorTheme === 'slider' && (
            <div className="space-y-6">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[#bc13fe]" />
                Slider Theme Settings
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Photo Size on Wall (px)</label>
                  <input
                    type="number"
                    value={localSettings.guestbookPhotoSize || 300}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookPhotoSize: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Message Font Size (px)</label>
                  <input
                    type="number"
                    value={localSettings.guestbookFontSize || 14}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookFontSize: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Card Style</label>
                  <select
                    value={localSettings.guestbookCardStyle || 'glass'}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookCardStyle: e.target.value as any })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
                  >
                    <option value="glass">Glass (Translucent)</option>
                    <option value="solid">Solid (Dark)</option>
                    <option value="minimal">Minimal (No Border)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Text Position</label>
                  <select
                    value={localSettings.guestbookTextPosition || 'bottom'}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookTextPosition: e.target.value as any })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
                  >
                    <option value="bottom">Below Photo</option>
                    <option value="side">Beside Photo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Number of Photos Displayed</label>
                  <input
                    type="number"
                    value={localSettings.guestbookSliderCount || 5}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookSliderCount: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {localSettings.monitorTheme === 'grid' && (
            <div className="space-y-6">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-[#bc13fe]" />
                Grid Wall Settings
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Photo Size on Wall (px)</label>
                  <input
                    type="number"
                    value={localSettings.guestbookPhotoSize || 300}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookPhotoSize: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Message Font Size (px)</label>
                  <input
                    type="number"
                    value={localSettings.guestbookFontSize || 14}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookFontSize: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Card Style</label>
                  <select
                    value={localSettings.guestbookCardStyle || 'glass'}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookCardStyle: e.target.value as any })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
                  >
                    <option value="glass">Glass (Translucent)</option>
                    <option value="solid">Solid (Dark)</option>
                    <option value="minimal">Minimal (No Border)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Text Position</label>
                  <select
                    value={localSettings.guestbookTextPosition || 'bottom'}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookTextPosition: e.target.value as any })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
                  >
                    <option value="bottom">Below Photo</option>
                    <option value="side">Beside Photo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Number of Photos Displayed</label>
                  <input
                    type="number"
                    value={localSettings.guestbookGridCount || 12}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookGridCount: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {localSettings.monitorTheme === 'physics' && (
            <div className="space-y-6">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#bc13fe]" />
                Floating Physics Settings
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Photo Size on Wall (px)</label>
                  <input
                    type="number"
                    value={localSettings.guestbookPhotoSize || 300}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookPhotoSize: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Message Font Size (px)</label>
                  <input
                    type="number"
                    value={localSettings.guestbookFontSize || 14}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookFontSize: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Card Style</label>
                  <select
                    value={localSettings.guestbookCardStyle || 'glass'}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookCardStyle: e.target.value as any })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
                  >
                    <option value="glass">Glass (Translucent)</option>
                    <option value="solid">Solid (Dark)</option>
                    <option value="minimal">Minimal (No Border)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Text Position</label>
                  <select
                    value={localSettings.guestbookTextPosition || 'bottom'}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookTextPosition: e.target.value as any })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
                  >
                    <option value="bottom">Below Photo</option>
                    <option value="side">Beside Photo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Physics Speed (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={localSettings.guestbookPhysicsSpeed || 2}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookPhysicsSpeed: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Max Photos on Wall</label>
                  <input
                    type="number"
                    value={localSettings.guestbookPhysicsCount || 20}
                    onChange={(e) => setLocalSettings({ ...localSettings, guestbookPhysicsCount: Number(e.target.value) })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* General Settings */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10">
        <h3 className="text-xl font-bold mb-6 text-[#bc13fe]">General Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Event Name</label>
            <input
              type="text"
              value={localSettings.eventName}
              onChange={(e) => setLocalSettings({ ...localSettings, eventName: e.target.value })}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Event Description</label>
            <input
              type="text"
              value={localSettings.eventDescription}
              onChange={(e) => setLocalSettings({ ...localSettings, eventDescription: e.target.value })}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Event Title Size (px)</label>
            <input
              type="number"
              value={localSettings.guestbookTitleSize || 48}
              onChange={(e) => setLocalSettings({ ...localSettings, guestbookTitleSize: Number(e.target.value) })}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Event Description Size (px)</label>
            <input
              type="number"
              value={localSettings.guestbookDescSize || 24}
              onChange={(e) => setLocalSettings({ ...localSettings, guestbookDescSize: Number(e.target.value) })}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">QR Code Size (px)</label>
            <input
              type="number"
              value={localSettings.guestbookQrSize || 150}
              onChange={(e) => setLocalSettings({ ...localSettings, guestbookQrSize: Number(e.target.value) })}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
            />
          </div>
          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              id="hideQr"
              checked={localSettings.guestbookHideQr || false}
              onChange={(e) => setLocalSettings({ ...localSettings, guestbookHideQr: e.target.checked })}
              className="w-5 h-5 rounded border-white/10 bg-black/50 text-[#bc13fe] focus:ring-[#bc13fe]"
            />
            <label htmlFor="hideQr" className="text-sm text-gray-300">Hide QR Code on Wall</label>
          </div>
        </div>
      </div>

      {/* Output Configuration */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10">
        <h3 className="text-xl font-bold mb-6 text-[#bc13fe]">Output Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Aspect Ratio</label>
            <select
              value={localSettings.outputRatio || '9:16'}
              onChange={(e) => setLocalSettings({ ...localSettings, outputRatio: e.target.value as AspectRatio })}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
            >
              <option value="16:9">Landscape (16:9)</option>
              <option value="9:16">Portrait (9:16)</option>
              <option value="3:2">Landscape (3:2)</option>
              <option value="2:3">Portrait (2:3)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Camera Rotation (Degrees)</label>
            <select
              value={localSettings.cameraRotation || 0}
              onChange={(e) => setLocalSettings({ ...localSettings, cameraRotation: Number(e.target.value) })}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors appearance-none"
            >
              <option value={0}>0° (Normal)</option>
              <option value={90}>90° (Right)</option>
              <option value={180}>180° (Upside Down)</option>
              <option value={270}>270° (Left)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Background & Overlay */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-white/10">
        <h3 className="text-xl font-bold mb-6 text-[#bc13fe]">Background & Overlay</h3>
        
        {/* Video Templates */}
        <div className="flex flex-col gap-2 bg-white/5 p-4 rounded-xl border border-white/10 mb-8">
          <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Video Templates</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            {[
              'https://cdn.pixabay.com/video/2020/05/25/40131-424933973_large.mp4',
              'https://cdn.pixabay.com/video/2016/09/21/5320-183786499_large.mp4',
              'https://cdn.pixabay.com/video/2023/10/22/186008-876823422_large.mp4',
              'https://cdn.pixabay.com/video/2020/04/09/35716-407425126_large.mp4'
            ].map((url, idx) => (
              <button
                key={idx}
                onClick={() => setLocalSettings({...localSettings, backgroundVideoUrl: url})}
                className={`aspect-video rounded-lg overflow-hidden border-2 transition-colors ${localSettings.backgroundVideoUrl === url ? 'border-[#bc13fe]' : 'border-transparent hover:border-white/30'}`}
              >
                <video src={url} className="w-full h-full object-cover" muted playsInline />
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Background Upload */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Monitor Wall Background (JPG/PNG/MP4)</label>
            <div className="flex flex-col gap-4">
              {localSettings.backgroundVideoUrl ? (
                <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group">
                  <video src={localSettings.backgroundVideoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                  <div className="absolute top-2 right-2 bg-[#bc13fe] px-2 py-1 rounded text-[8px] font-bold">VIDEO MODE</div>
                </div>
              ) : localSettings.backgroundImage ? (
                <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group">
                  <img src={localSettings.backgroundImage} alt="Background" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 flex items-center justify-center bg-black/50">
                  <span className="text-[10px] text-gray-700 font-mono">DEFAULT_DARK</span>
                </div>
              )}
              {localSettings.backgroundVideoUrl && (
                <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group">
                  <video src={localSettings.backgroundVideoUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                </div>
              )}
              
              <input
                type="file"
                ref={backgroundInputRef}
                onChange={handleBackgroundUpload}
                accept="image/*"
                className="hidden"
              />
              <input
                type="file"
                ref={backgroundVideoInputRef}
                onChange={handleBackgroundVideoUpload}
                accept="video/mp4,video/webm"
                className="hidden"
              />

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

          {/* Overlay Upload */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Photo Overlay (PNG only)</label>
            <div className="flex flex-col gap-4">
              <div 
                className="bg-white/5 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden mx-auto shadow-2xl transition-all duration-300"
                style={{
                  width: '180px',
                  aspectRatio: '9/16'
                }}
              >
                {localSettings.overlayImage ? (
                  <img src={localSettings.overlayImage} className="w-full h-full object-contain" alt="Overlay" />
                ) : <span className="text-[10px] text-gray-700 font-mono">NO_OVERLAY</span>}
              </div>
              
              <input
                type="file"
                ref={overlayInputRef}
                onChange={handleOverlayUpload}
                accept="image/png"
                className="hidden"
              />

              <button onClick={() => overlayInputRef.current?.click()} disabled={isUploadingOverlay} className="w-full py-4 border-2 border-white/10 hover:border-[#bc13fe] text-[10px] tracking-widest font-bold uppercase bg-white/5 rounded-lg transition-colors">
                {isUploadingOverlay ? 'UPLOADING...' : 'CHANGE PNG OVERLAY'}
              </button>
              
              {localSettings.overlayImage && (
                <button onClick={() => setLocalSettings({...localSettings, overlayImage: null})} className="w-full py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] tracking-widest font-bold uppercase bg-transparent rounded-lg transition-colors">
                  REMOVE PNG OVERLAY
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default GuestbookSettingsTab;
