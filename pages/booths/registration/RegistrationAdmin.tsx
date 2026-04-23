import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { PhotoboothSettings } from '../../../types';
import { DEFAULT_SETTINGS } from '../../../constants';
import { useDialog } from '../../../components/DialogProvider';
import { ArrowLeft, Save, Maximize, FileSpreadsheet } from 'lucide-react';

const RegistrationAdmin: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { showDialog } = useDialog();
  const [settings, setSettings] = useState<PhotoboothSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        if (!eventId) return;
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .single();
        
        if (error) throw error;
        if (data) {
          const loadedSettings = data.settings || {};
          setSettings({
            ...DEFAULT_SETTINGS,
            ...loadedSettings,
            eventName: data.name,
            activeEventId: data.id
          });
        }
      } catch (err) {
        console.error("Failed to load registration settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [eventId]);

  const handleSave = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('events')
        .update({ settings })
        .eq('id', eventId);
      
      if (error) throw error;
      await showDialog('alert', 'Success', 'Registration Settings saved successfully.');
    } catch (err) {
      console.error(err);
      await showDialog('alert', 'Error', 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof PhotoboothSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/20 border-t-green-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 flex justify-between items-center bg-black/90 backdrop-blur-md border-b border-white/10 px-6 py-4 shadow-xl">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-black uppercase tracking-widest text-green-400">Registration Admin</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/registration/${eventId}`)} 
            className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors border border-white/10 flex items-center gap-2"
          >
            <Maximize className="w-4 h-4" /> Go to App
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors shadow-lg shadow-green-600/20 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-8 mt-6">
        
        {/* Core Settings */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <FileSpreadsheet className="w-6 h-6 text-green-400" />
            <h2 className="text-lg font-bold uppercase tracking-widest text-white">Data Sync Configuration</h2>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Google Apps Script URL</label>
              <input 
                type="text" 
                value={settings.vipAppsScriptUrl || ''} 
                onChange={(e) => handleChange('vipAppsScriptUrl', e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-green-400 focus:outline-none font-mono text-sm transition-colors"
               />
               <p className="text-xs text-gray-500">URL Spreadsheet yang menerima & mengirim status registrasi tamu.</p>
            </div>
          </div>
        </div>

        {/* Video Avatar Settings */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <h2 className="text-lg font-bold uppercase tracking-widest text-white">AI Avatar Videos</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex justify-between">
                <span>Idle Video URL</span>
                <span className="text-blue-400">.mp4</span>
              </label>
              <input 
                type="text" 
                value={settings.vipVideoIdleUrl || ''} 
                onChange={(e) => handleChange('vipVideoIdleUrl', e.target.value)}
                placeholder="https://.../idle.mp4"
                className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-green-400 focus:outline-none font-mono text-sm transition-colors"
               />
               {settings.vipVideoIdleUrl && (
                  <video src={settings.vipVideoIdleUrl} className="w-full aspect-video rounded-xl object-cover bg-black mt-2 border border-white/10" controls loop muted />
               )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex justify-between">
                <span>Talking Video URL</span>
                <span className="text-blue-400">.mp4</span>
              </label>
              <input 
                type="text" 
                value={settings.vipVideoTalkingUrl || ''} 
                onChange={(e) => handleChange('vipVideoTalkingUrl', e.target.value)}
                placeholder="https://.../talking.mp4"
                className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-green-400 focus:outline-none font-mono text-sm transition-colors"
               />
               {settings.vipVideoTalkingUrl && (
                  <video src={settings.vipVideoTalkingUrl} className="w-full aspect-[9/16] max-h-48 mx-auto rounded-xl object-cover bg-black mt-2 border border-white/10" controls loop muted />
               )}
            </div>
          </div>
        </div>

        {/* TTS Settings */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <h2 className="text-lg font-bold uppercase tracking-widest text-white">Voice Settings (TTS)</h2>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Voice Style</label>
                <select 
                  value={settings.vipTtsVoice || 'Aoede'} 
                  onChange={(e) => handleChange('vipTtsVoice', e.target.value)}
                  className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-green-400 focus:outline-none font-mono text-sm transition-colors"
                >
                  <option value="Aoede">Aoede</option>
                  <option value="Charon">Charon</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Kore">Kore</option>
                  <option value="Puck">Puck</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Voice Speed</label>
                <div className="flex items-center gap-4 bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3">
                  <input 
                    type="range" 
                    min="0.5" 
                    max="2.0" 
                    step="0.05"
                    value={settings.vipTtsSpeed ?? 1.25} 
                    onChange={(e) => handleChange('vipTtsSpeed', parseFloat(e.target.value))}
                    className="flex-1 accent-green-500"
                  />
                  <span className="text-white font-mono text-sm w-12 font-bold">{settings.vipTtsSpeed ?? 1.25}x</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default RegistrationAdmin;
