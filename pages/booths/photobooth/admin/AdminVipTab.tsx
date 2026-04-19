import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { PhotoboothSettings } from '../../../../types';
import { useDialog } from '../../../../components/DialogProvider';

interface AdminVipTabProps {
  settings: PhotoboothSettings;
  onSaveSettings: (settings: PhotoboothSettings) => void;
}

export interface AdminVipTabRef {
  saveVipSettings: () => Promise<void>;
  hasUnsavedChanges: () => boolean;
}

const AdminVipTab = forwardRef<AdminVipTabRef, AdminVipTabProps>(({ settings, onSaveSettings }, ref) => {
  const [localSettings, setLocalSettings] = useState<PhotoboothSettings>(settings);
  const [isDirty, setIsDirty] = useState(false);
  const { showDialog } = useDialog();

  useImperativeHandle(ref, () => ({
    saveVipSettings: async () => {
      onSaveSettings(localSettings);
      setIsDirty(false);
      showDialog('alert', 'Success', 'VIP Settings saved securely to Supabase settings.');
    },
    hasUnsavedChanges: () => isDirty
  }));

  const handleChange = (field: keyof PhotoboothSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  return (
    <div className="space-y-6">
      <div className="p-6 md:p-8 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden backdrop-blur-sm">
        <h3 className="text-xl font-heading text-white italic mb-2 tracking-wide uppercase flex items-center justify-between">
          <span>VIP Access Mode (Google Sheet Sync)</span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-sans not-italic text-gray-400">Enable VIP ID Login Screen</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={localSettings.enableVipMode || false}
                onChange={(e) => handleChange('enableVipMode', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#bc13fe]"></div>
            </label>
          </div>
        </h3>
        
        <p className="text-sm text-gray-400 mb-8 max-w-2xl">
          Event ini akan menggunakan fitur VIP Avatar Sapaan & otomatis sinkronisasi ke Google Sheet Database CoroAI bawaan.
        </p>

        <div className="space-y-4">
          <div className="space-y-2 pt-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Avatar Background (IDLE) MP4 URL
            </label>
            <input 
              type="text" 
              value={localSettings.vipVideoIdleUrl || ''}
              onChange={(e) => handleChange('vipVideoIdleUrl', e.target.value)}
              placeholder="https://.../idle.mp4"
              className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-[#bc13fe] transition-colors focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Avatar Background (TALKING) MP4 URL
            </label>
            <input 
              type="text" 
              value={localSettings.vipVideoTalkingUrl || ''}
              onChange={(e) => handleChange('vipVideoTalkingUrl', e.target.value)}
              placeholder="https://.../talking.mp4"
              className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-[#bc13fe] transition-colors focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="space-y-2 pt-4 border-t border-white/10 mt-6">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 block">
              OpenAI API Key (For Live Avatar TTS)
            </label>
            <input 
              type="password" 
              value={localSettings.vipOpenAiKey || ''}
              onChange={(e) => handleChange('vipOpenAiKey', e.target.value)}
              placeholder="sk-..."
              className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-[#bc13fe] transition-colors focus:outline-none font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mb-4">Meningkatkan akurasi dan kemiripan suara AI. Jika dikosongkan akan memakai suara Chrome bawaan perangkat.</p>
            
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">
              Voice Style (OpenAI)
            </label>
            <select
              value={localSettings.vipTtsVoice || 'nova'}
              onChange={(e) => handleChange('vipTtsVoice', e.target.value)}
              className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-[#bc13fe] transition-colors focus:outline-none font-mono text-sm"
            >
              <option value="nova">Nova (Female - Recommended)</option>
              <option value="alloy">Alloy (Neutral)</option>
              <option value="echo">Echo (Male)</option>
              <option value="fable">Fable (British Male)</option>
              <option value="onyx">Onyx (Deep Male)</option>
              <option value="shimmer">Shimmer (Soft Female)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AdminVipTab;
