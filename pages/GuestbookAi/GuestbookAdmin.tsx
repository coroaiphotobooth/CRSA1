import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Monitor, LayoutGrid, Sparkles, Copy, ExternalLink, Trash2, Settings, Palette } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Concept, PhotoboothSettings } from '../../types';
import { DEFAULT_SETTINGS, DEFAULT_CONCEPTS, DEFAULT_GAS_URL } from '../../constants';
import GuestbookSettingsTab, { GuestbookSettingsTabRef } from './GuestbookSettingsTab';
import AdminConceptsTab, { AdminConceptsTabRef } from '../booths/photobooth/admin/AdminConceptsTab';

interface GuestbookEntry {
  id: string;
  guest_name: string;
  guest_message: string;
  result_image_url: string;
  created_at: string;
}

const GuestbookAdmin: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [theme, setTheme] = useState<'slider' | 'grid' | 'physics'>('slider');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'concepts'>('settings');
  
  const [settings, setSettings] = useState<PhotoboothSettings>(DEFAULT_SETTINGS);
  const [concepts, setConcepts] = useState<Concept[]>(DEFAULT_CONCEPTS);
  const [gasUrl, setGasUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const adminSettingsRef = useRef<GuestbookSettingsTabRef>(null);
  const adminConceptsRef = useRef<AdminConceptsTabRef>(null);

  useEffect(() => {
    const savedUrl = localStorage.getItem('APPS_SCRIPT_BASE_URL') || DEFAULT_GAS_URL;
    setGasUrl(savedUrl);
  }, []);

  useEffect(() => {
    if (!eventId) return;

    const loadData = async () => {
      // Load Entries
      const { data: entriesData } = await supabase
        .from('sessions')
        .select('id, guest_name, guest_message, result_image_url, created_at')
        .eq('event_id', eventId)
        .eq('is_posted_to_wall', true)
        .order('created_at', { ascending: false });

      if (entriesData) setEntries(entriesData);

      // Load Settings & Concepts
      const { data: eventData } = await supabase
        .from('events')
        .select('settings, concepts(*)')
        .eq('id', eventId)
        .single();
        
      if (eventData) {
        if (eventData.settings) setSettings({ ...DEFAULT_SETTINGS, ...eventData.settings });
        if (eventData.concepts) {
          const mappedConcepts = eventData.concepts.map((c: any) => ({
            id: c.id,
            concept_id: c.concept_id || c.id,
            name: c.name,
            prompt: c.prompt,
            thumbnail: c.thumbnail,
            refImage: c.ref_image || undefined,
            reference_image_split: c.reference_image_split || undefined,
            reference_image_bg: c.reference_image_bg || undefined,
            style_preset: c.style_preset || undefined
          }));
          setConcepts(mappedConcepts);
        }
      }
    };

    loadData();
  }, [eventId]);

  const handleSaveSettings = async (newSettings: PhotoboothSettings) => {
    if (!eventId) return;
    setIsSaving(true);
    try {
      await supabase
        .from('events')
        .update({ settings: newSettings })
        .eq('id', eventId);
      setSettings(newSettings);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveConcepts = (newConcepts: Concept[]) => {
    setConcepts(newConcepts);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this entry from the wall?')) return;

    try {
      await supabase
        .from('sessions')
        .update({ is_posted_to_wall: false })
        .eq('id', id);

      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error('Error removing entry:', error);
    }
  };

  const monitorUrl = `${window.location.origin}/guestbook/${eventId}/monitor?theme=${theme}`;
  const guestUrl = `${window.location.origin}/guestbook/${eventId}/guest`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(`/guestbook/${eventId}/monitor`)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-heading font-bold neon-text">Guestbook AI Admin</h1>
              <p className="text-gray-400">Manage your Live Social Wall</p>
            </div>
          </div>
          
          <div className="flex bg-white/5 p-1 rounded-xl">
            {(['settings', 'concepts'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all ${activeTab === tab ? 'bg-[#bc13fe] text-white shadow-xl shadow-[#bc13fe]/40' : 'text-gray-500 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-heading tracking-widest uppercase italic transition-all rounded-lg shadow-xl text-xs"
            >
              DASHBOARD
            </button>
            {activeTab === 'settings' && (
              <button 
                onClick={() => adminSettingsRef.current?.saveSettings()} 
                disabled={isSaving}
                className="px-6 py-3 bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white font-heading tracking-widest uppercase italic transition-all rounded-lg shadow-xl text-xs"
              >
                {isSaving ? 'SAVING...' : 'SAVE SETTINGS'}
              </button>
            )}
            {activeTab === 'concepts' && (
              <button 
                onClick={() => adminConceptsRef.current?.saveConcepts()} 
                disabled={isSaving}
                className="px-6 py-3 bg-[#bc13fe] hover:bg-[#a010d8] disabled:opacity-50 text-white font-heading tracking-widest uppercase italic transition-all rounded-lg shadow-xl text-xs"
              >
                {isSaving ? 'SAVING...' : 'SAVE CONCEPT'}
              </button>
            )}
          </div>
        </div>

        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <GuestbookSettingsTab 
                ref={adminSettingsRef}
                settings={settings} 
                onSaveSettings={handleSaveSettings} 
                gasUrl={gasUrl}
              />
            </div>
            
            {/* Right Column: Moderation */}
            <div className="lg:col-span-1 glass-card p-6 rounded-2xl border border-white/10 h-fit max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-6">Moderation ({entries.length} Entries)</h2>
              
              {entries.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No entries posted to the wall yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {entries.map(entry => (
                    <div key={entry.id} className="bg-black/40 border border-white/5 rounded-xl p-4 flex gap-4">
                      <img 
                        src={entry.result_image_url} 
                        alt={entry.guest_name} 
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <h3 className="font-bold text-[#bc13fe] text-sm">{entry.guest_name}</h3>
                        <p className="text-xs text-gray-300 line-clamp-2 mt-1">{entry.guest_message}</p>
                        <div className="mt-2 flex justify-end">
                          <button 
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'concepts' && (
          <AdminConceptsTab 
            ref={adminConceptsRef}
            concepts={concepts} 
            onSaveConcepts={handleSaveConcepts} 
            adminPin={settings.adminPin} 
            settings={settings}
          />
        )}
      </div>
    </div>
  );
};

export default GuestbookAdmin;
