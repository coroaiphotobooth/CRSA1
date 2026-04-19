import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { PhotoboothSettings, BartenderMenuItem } from '../../../types';
import { DEFAULT_SETTINGS } from '../../../constants';
import { ArrowLeft, Save, Plus, Trash2, Settings, List, Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';

const BartenderAdmin: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PhotoboothSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings'|'menu'>('settings');

  useEffect(() => {
    const loadSettings = async () => {
      if (!eventId) return;
      try {
        const { data, error } = await supabase.from('events').select('settings').eq('id', eventId).single();
        if (error) throw error;
        if (data && data.settings) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
        }
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [eventId]);

  const handleSave = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('events').update({ settings }).eq('id', eventId);
      if (error) throw error;
      alert('Tersimpan! / Saved!');
    } catch (err) {
      console.error(err);
      alert('Error saving settings. Default alert used.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMenu = () => {
    const newMenu = [...(settings.bartenderMenu || [])];
    newMenu.push({
      id: crypto.randomUUID(),
      name: 'New Drink',
      description: 'Description here',
      imageUrl: ''
    });
    setSettings({ ...settings, bartenderMenu: newMenu });
  };

  const handleUpdateMenu = (index: number, key: keyof BartenderMenuItem, value: string) => {
    const newMenu = [...(settings.bartenderMenu || [])];
    newMenu[index] = { ...newMenu[index], [key]: value };
    setSettings({ ...settings, bartenderMenu: newMenu });
  };

  const handleRemoveMenu = (index: number) => {
    const newMenu = [...(settings.bartenderMenu || [])];
    newMenu.splice(index, 1);
    setSettings({ ...settings, bartenderMenu: newMenu });
  };

  if (loading) {
    return <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans p-6 md:p-10 relative">
      <div className="max-w-5xl mx-auto space-y-6 relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between glass-card p-6 rounded-2xl border border-white/10 bg-[#111]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/dashboard')}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold font-heading uppercase tracking-widest text-blue-400">AI Bartender Admin</h1>
              <p className="text-sm font-mono text-gray-400 tracking-wider">Event ID: {eventId}</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-xl font-bold uppercase tracking-widest text-sm flex items-center gap-2 transition-colors`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center gap-2 transition-all ${activeTab === 'settings' ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-[#111] hover:bg-white/5 border border-white/10'}`}
          >
            <Settings className="w-4 h-4" /> Videos
          </button>
          <button 
            onClick={() => setActiveTab('menu')}
            className={`px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center gap-2 transition-all ${activeTab === 'menu' ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-[#111] hover:bg-white/5 border border-white/10'}`}
          >
            <List className="w-4 h-4" /> Menu List
          </button>
        </div>

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 rounded-2xl border border-white/10 bg-[#111] space-y-8">
            <div>
              <h2 className="text-xl font-bold mb-2">Google Apps Script URL</h2>
              <p className="text-sm text-gray-400 mb-4 font-mono tracking-wider">Dipakai untuk record pesanan (Sama seperti URL Photobooth biasa)</p>
              <input 
                type="text" 
                value={settings.vipAppsScriptUrl || ''} 
                onChange={(e) => setSettings({...settings, vipAppsScriptUrl: e.target.value})}
                placeholder="https://script.google.com/macros/s/..."
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            
            <div className="border-t border-white/10 pt-8">
              <h2 className="text-xl font-bold mb-2">Avatar Videos</h2>
              <p className="text-sm text-gray-400 mb-6 font-mono tracking-wider">Video Avatar AI (HeyGen, DID, dll)</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-gray-300">Idle Video URL</label>
                  <input 
                    type="text" 
                    value={settings.vipVideoIdleUrl || ''} 
                    onChange={(e) => setSettings({...settings, vipVideoIdleUrl: e.target.value})}
                    placeholder="https://..."
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {settings.vipVideoIdleUrl && (
                    <video src={settings.vipVideoIdleUrl} className="w-full rounded-xl aspect-video object-cover bg-black/50 border border-white/10" controls loop muted />
                  )}
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-gray-300">Talking Video URL</label>
                  <input 
                    type="text" 
                    value={settings.vipVideoTalkingUrl || ''} 
                    onChange={(e) => setSettings({...settings, vipVideoTalkingUrl: e.target.value})}
                    placeholder="https://..."
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {settings.vipVideoTalkingUrl && (
                    <video src={settings.vipVideoTalkingUrl} className="w-full rounded-xl aspect-video object-cover bg-black/50 border border-white/10" controls loop muted />
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Menu Tab */}
        {activeTab === 'menu' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
             <div className="flex items-center justify-between glass-card p-6 rounded-2xl border border-white/10 bg-[#111]">
               <div>
                  <h2 className="text-xl font-bold">Menu Minuman AI</h2>
                  <p className="text-sm text-gray-400 mt-1 font-mono tracking-wider">Sesuaikan nama minuman dan deskripsi.</p>
               </div>
               <button 
                 onClick={handleAddMenu}
                 className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-colors"
               >
                 <Plus className="w-4 h-4" /> Add Drink
               </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {(settings.bartenderMenu || []).map((item, index) => (
                 <div key={item.id} className="glass-card p-6 rounded-2xl border border-white/10 bg-[#111]/80 hover:border-blue-500/50 transition-colors flex flex-col gap-4 relative group">
                   <button 
                     onClick={() => handleRemoveMenu(index)}
                     className="absolute top-4 right-4 p-2 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                   <div>
                     <label className="block text-xs font-mono text-gray-400 mb-1">Drink Name</label>
                     <input 
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateMenu(index, 'name', e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 font-bold text-lg focus:border-blue-500 focus:outline-none"
                     />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-gray-400 mb-1">Description / Ingredients</label>
                     <textarea 
                        value={item.description}
                        onChange={(e) => handleUpdateMenu(index, 'description', e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:border-blue-500 focus:outline-none resize-none h-20"
                     />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-gray-400 mb-1">Image URL (Optional)</label>
                     <div className="flex gap-2 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <ImageIcon className="h-4 w-4 text-gray-500" />
                        </div>
                        <input 
                            type="text"
                            value={item.imageUrl || ''}
                            onChange={(e) => handleUpdateMenu(index, 'imageUrl', e.target.value)}
                            placeholder="https://..."
                            className="w-full bg-black/50 border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-gray-300 focus:border-blue-500 focus:outline-none"
                        />
                     </div>
                   </div>
                 </div>
               ))}
               {(!settings.bartenderMenu || settings.bartenderMenu.length === 0) && (
                 <div className="col-span-1 md:col-span-2 text-center p-12 border-2 border-dashed border-white/10 rounded-2xl">
                   <p className="text-gray-500 font-mono tracking-wider mb-4">No menu drinks configured.</p>
                   <button 
                     onClick={handleAddMenu}
                     className="px-6 py-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl font-bold uppercase tracking-widest text-sm transition-colors mx-auto inline-flex items-center gap-2"
                   >
                     <Plus className="w-4 h-4" /> Add your first drink
                   </button>
                 </div>
               )}
             </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default BartenderAdmin;
