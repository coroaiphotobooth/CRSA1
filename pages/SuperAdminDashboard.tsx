import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, LogOut, Trash2, Edit, Save, Settings, ShieldAlert, Lock, Unlock, ExternalLink, Search, MessageSquare } from 'lucide-react';
import { Vendor, TemplateConcept } from '../types';
import { useDialog } from '../components/DialogProvider';

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vendors'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [templateConcepts, setTemplateConcepts] = useState<TemplateConcept[]>([]);
  const [globalSettings, setGlobalSettings] = useState({ default_free_credits: 100, system_status: 'active', template_event_id: '' });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editForm, setEditForm] = useState({ name: '', company_name: '', country: '', phone: '', plan: 'free', credits: 0 });
  
  // Template Concept Form State
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [editingConcept, setEditingConcept] = useState<TemplateConcept | null>(null);
  const [conceptForm, setConceptForm] = useState({ name: '', prompt: '', thumbnail: '', ref_image: '' });
  const [savingConcept, setSavingConcept] = useState(false);

  // Message Form State
  const [messageForm, setMessageForm] = useState({ vendorId: 'all', message: '' });
  const [sendingMessage, setSendingMessage] = useState(false);

  // Template Event State
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const [showSqlModal, setShowSqlModal] = useState(false);
  const navigate = useNavigate();
  const { showDialog } = useDialog();

  const SUPER_ADMIN_EMAIL = 'coroaiphotobooth@gmail.com';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || user.email !== SUPER_ADMIN_EMAIL) {
        navigate('/dashboard');
        return;
      }

      // Fetch Vendors
      const { data: vendorsData, error: vendorsError } = await supabase
        .from('vendors')
        .select('*')
        .order('created_at', { ascending: false });

      if (vendorsError) throw vendorsError;
      
      if (vendorsData && vendorsData.length <= 1) {
          setShowSqlModal(true);
      } else if (vendorsData && vendorsData.length > 0 && !('company_name' in vendorsData[0])) {
          setShowSqlModal(true);
      }
      
      setVendors(vendorsData || []);

      // Fetch Global Settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('global_settings')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (!settingsError && settingsData) {
        setGlobalSettings({
          default_free_credits: settingsData.default_free_credits,
          system_status: settingsData.system_status,
          template_event_id: settingsData.template_event_id || ''
        });
      }

      // Fetch all events for the template dropdown
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, name, vendor_id')
        .order('created_at', { ascending: false });
      
      if (eventsData) {
        const superAdminVendor = vendorsData?.find(v => v.email === 'coroaiphotobooth@gmail.com');
        if (superAdminVendor) {
          setEvents(eventsData.filter(e => e.vendor_id === superAdminVendor.id));
        } else {
          setEvents(eventsData);
        }
      }

      // Fetch template concepts
      const { data: conceptsData, error: conceptsError } = await supabase
        .from('template_concepts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (conceptsError) {
        // If table doesn't exist, show SQL modal
        if (conceptsError.code === '42P01' || conceptsError.code === 'PGRST205') {
          setShowSqlModal(true);
        } else {
          console.error("Error fetching template concepts:", conceptsError);
        }
      } else if (conceptsData) {
        setTemplateConcepts(conceptsData);
      }

    } catch (err: any) {
      console.error('Error fetching data:', err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      const { error } = await supabase
        .from('global_settings')
        .upsert({
          id: 1,
          default_free_credits: globalSettings.default_free_credits,
          system_status: globalSettings.system_status,
          template_event_id: globalSettings.template_event_id || null,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      await showDialog('alert', 'Success', 'Global settings saved successfully!');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to save settings: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleDeleteVendor = async (id: string) => {
    const confirmed = await showDialog('confirm', 'Confirm Deletion', 'Are you sure you want to delete this vendor? This will delete all their events and data.');
    if (!confirmed) return;
    
    try {
      // Call the secure RPC function to delete the user from auth.users and public.vendors
      const { error } = await supabase.rpc('delete_user', { user_id: id });
      
      if (error) {
        // Fallback to just deleting from vendors if the RPC function doesn't exist yet
        console.warn("RPC delete_user failed, falling back to vendors table deletion", error);
        const { error: fallbackError } = await supabase.from('vendors').delete().eq('id', id);
        if (fallbackError) throw fallbackError;
      }
      
      setVendors(vendors.filter(v => v.id !== id));
      await showDialog('alert', 'Success', 'Vendor deleted successfully.');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to delete vendor: ${err.message}\n\nNote: To completely delete users, please run the SQL command shown in the yellow warning box at the top of the page.`);
    }
  };

  const handleToggleBlock = async (vendor: Vendor) => {
    const action = vendor.is_blocked ? 'unblock' : 'block';
    const confirmed = await showDialog('confirm', `Confirm ${action}`, `Are you sure you want to ${action} this vendor?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('vendors')
        .update({ is_blocked: !vendor.is_blocked })
        .eq('id', vendor.id);

      if (error) throw error;

      setVendors(vendors.map(v => 
        v.id === vendor.id ? { ...v, is_blocked: !vendor.is_blocked } : v
      ));
      await showDialog('alert', 'Success', `Vendor ${action}ed successfully.`);
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to ${action} vendor: ${err.message}`);
    }
  };

  const startEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setEditForm({
      name: vendor.name || '',
      company_name: vendor.company_name || '',
      country: vendor.country || '',
      phone: vendor.phone || '',
      plan: vendor.plan || 'free',
      credits: vendor.credits || 0
    });
  };

  const saveEdit = async () => {
    if (!editingVendor) return;
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          name: editForm.name,
          company_name: editForm.company_name,
          country: editForm.country,
          phone: editForm.phone,
          plan: editForm.plan,
          credits: editForm.credits
        })
        .eq('id', editingVendor.id);

      if (error) throw error;
      
      setVendors(vendors.map(v => v.id === editingVendor.id ? { ...v, ...editForm } as Vendor : v));
      setEditingVendor(null);
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to update vendor: ${err.message}`);
    }
  };

  const handleSetDefaultTemplate = async (eventId: string) => {
    try {
      setSavingSettings(true);
      const { error } = await supabase
        .from('global_settings')
        .upsert({
          id: 1,
          default_free_credits: globalSettings.default_free_credits,
          system_status: globalSettings.system_status,
          template_event_id: eventId,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      setGlobalSettings({ ...globalSettings, template_event_id: eventId });
      await showDialog('alert', 'Success', 'Default template event updated successfully!');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to set default template: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateTemplateEvent = async () => {
    if (!newTemplateName.trim()) {
      await showDialog('alert', 'Validation Error', 'Template name is required.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if super admin has a vendor record
      let { data: vendor } = await supabase.from('vendors').select('*').eq('id', user.id).single();
      
      if (!vendor) {
        // Create vendor record for super admin
        const { data: newVendor, error: vendorError } = await supabase.from('vendors').insert([{
          id: user.id,
          name: 'Super Admin',
          company_name: 'Coro AI',
          email: user.email,
          plan: 'pro',
          credits: 999999
        }]).select().single();
        
        if (vendorError) throw vendorError;
        vendor = newVendor;
      }

      // Create a new event
      const eventName = newTemplateName.trim();
      const folderName = `template_${Date.now()}`;
      
      // Create folders in Supabase Storage by uploading a dummy .keep file
      const emptyBlob = new Blob([''], { type: 'text/plain' });
      await Promise.all([
        supabase.storage.from('photobooth').upload(`${folderName}/original/.keep`, emptyBlob, { upsert: true }),
        supabase.storage.from('photobooth').upload(`${folderName}/result/.keep`, emptyBlob, { upsert: true })
      ]);

      const { data: newEvent, error: eventError } = await supabase.from('events').insert([{
        vendor_id: vendor.id,
        name: eventName,
        description: 'Template for default event settings',
        storage_folder: folderName,
        settings: {
          eventName: eventName,
          eventDescription: 'Template for default event settings',
          storage_folder: folderName
        }
      }]).select().single();

      if (eventError) throw eventError;

      setShowCreateTemplateModal(false);
      setNewTemplateName('');
      
      // Navigate to the event admin page
      navigate(`/admin/${newEvent.id}`);
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to create template event: ${err.message}`);
    }
  };

  const handleDeleteTemplateEvent = async (eventId: string) => {
    const confirmed = await showDialog('confirm', 'Confirm Deletion', 'Are you sure you want to delete this template event?');
    if (!confirmed) return;

    try {
      // If it's the default template, remove it from global settings first
      if (globalSettings.template_event_id === eventId) {
        await supabase
          .from('global_settings')
          .upsert({
            id: 1,
            default_free_credits: globalSettings.default_free_credits,
            system_status: globalSettings.system_status,
            template_event_id: null,
            updated_at: new Date().toISOString()
          });
        setGlobalSettings({ ...globalSettings, template_event_id: '' });
      }

      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      
      setEvents(events.filter(e => e.id !== eventId));
      await showDialog('alert', 'Success', 'Template event deleted successfully!');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to delete template event: ${err.message}`);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'thumbnail' | 'ref_image') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `templates/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photobooth')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photobooth')
        .getPublicUrl(filePath);

      setConceptForm({ ...conceptForm, [field]: publicUrl });
    } catch (err: any) {
      await showDialog('alert', 'Upload Error', `Failed to upload image: ${err.message}`);
    }
  };

  const handleSaveTemplateConcept = async () => {
    if (!conceptForm.name || !conceptForm.prompt || !conceptForm.thumbnail) {
      await showDialog('alert', 'Validation Error', 'Name, prompt, and thumbnail are required.');
      return;
    }

    try {
      setSavingConcept(true);
      if (editingConcept) {
        const { error } = await supabase
          .from('template_concepts')
          .update({
            name: conceptForm.name,
            prompt: conceptForm.prompt,
            thumbnail: conceptForm.thumbnail,
            ref_image: conceptForm.ref_image || null
          })
          .eq('id', editingConcept.id);

        if (error) throw error;
        setTemplateConcepts(templateConcepts.map(c => c.id === editingConcept.id ? { ...c, ...conceptForm } : c));
      } else {
        const { data, error } = await supabase
          .from('template_concepts')
          .insert([{
            name: conceptForm.name,
            prompt: conceptForm.prompt,
            thumbnail: conceptForm.thumbnail,
            ref_image: conceptForm.ref_image || null
          }])
          .select();

        if (error) throw error;
        if (data && data[0]) {
          setTemplateConcepts([data[0], ...templateConcepts]);
        }
      }
      setShowConceptModal(false);
      setEditingConcept(null);
      setConceptForm({ name: '', prompt: '', thumbnail: '', ref_image: '' });
      await showDialog('alert', 'Success', 'Template concept saved successfully!');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to save template concept: ${err.message}`);
    } finally {
      setSavingConcept(false);
    }
  };

  const handleDeleteTemplateConcept = async (id: string) => {
    const confirmed = await showDialog('confirm', 'Confirm Deletion', 'Are you sure you want to delete this template concept?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('template_concepts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTemplateConcepts(templateConcepts.filter(c => c.id !== id));
      await showDialog('alert', 'Success', 'Template concept deleted successfully.');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to delete template concept: ${err.message}`);
    }
  };

  const handleSendMessage = async () => {
    if (!messageForm.message.trim()) {
      await showDialog('alert', 'Error', 'Message cannot be empty.');
      return;
    }

    setSendingMessage(true);
    try {
      if (messageForm.vendorId === 'all') {
        const { error } = await supabase
          .from('vendors')
          .update({ admin_message: messageForm.message })
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all vendors
        if (error) throw error;
        
        // Update local state
        setVendors(vendors.map(v => ({ ...v, admin_message: messageForm.message })));
      } else {
        const { error } = await supabase
          .from('vendors')
          .update({ admin_message: messageForm.message })
          .eq('id', messageForm.vendorId);
        if (error) throw error;
        
        // Update local state
        setVendors(vendors.map(v => v.id === messageForm.vendorId ? { ...v, admin_message: messageForm.message } : v));
      }
      
      await showDialog('alert', 'Success', 'Message sent successfully!');
      setMessageForm({ vendorId: 'all', message: '' });
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to send message: ${err.message}`);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleMessageVendor = (vendorId: string) => {
    setMessageForm({ ...messageForm, vendorId });
    setActiveTab('dashboard');
  };

  const filteredVendors = vendors.filter(v => 
    (v.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.company_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#bc13fe]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-heading font-bold neon-text mb-2">SUPER ADMIN</h1>
            <p className="text-gray-400">Manage all vendors and system settings</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all flex items-center gap-2"
            >
              Vendor View
            </button>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-xl font-bold transition-all flex items-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              LOGOUT
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-8">
            {errorMsg}
          </div>
        )}

        {showCreateTemplateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-md overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h2 className="text-xl font-bold">Create Template Event</h2>
                <button 
                  onClick={() => setShowCreateTemplateModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Template Name</label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g., Wedding Template 2026"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] transition-colors"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setShowCreateTemplateModal(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleCreateTemplateEvent}
                    disabled={!newTemplateName.trim()}
                    className="flex-1 py-3 bg-[#bc13fe] hover:bg-[#bc13fe]/80 text-white rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    CREATE
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSqlModal && (
          <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 p-6 rounded-xl mb-8 flex items-start gap-4">
            <ShieldAlert className="w-8 h-8 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold mb-2">Supabase Database Update Required</h3>
              <p className="mb-4 text-sm opacity-90">
                To view and manage all vendors and their details (Company, Country, Phone), you need to run this SQL command in your Supabase SQL Editor:
              </p>
              <pre className="bg-black/50 p-4 rounded-lg text-xs overflow-x-auto border border-yellow-500/20">
{`-- Run this in Supabase SQL Editor

-- 1. Add missing columns to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS admin_message TEXT;

-- Add storage_folder to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_folder TEXT;

-- Add template_event_id to global_settings table
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS template_event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- Create template_concepts table
CREATE TABLE IF NOT EXISTS template_concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  ref_image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- RLS for template_concepts
ALTER TABLE template_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read template concepts" ON template_concepts FOR SELECT USING (true);
CREATE POLICY "Super admin can do everything on template concepts" ON template_concepts FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');

-- 2. Update default free credits to 5
-- If your global_settings table uses an integer ID, run this instead: UPDATE global_settings SET default_free_credits = 5 WHERE id = 1;
UPDATE global_settings SET default_free_credits = 5;

-- 3. Grant Super Admin access
CREATE POLICY "Super admin can do everything on vendors" ON vendors FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Super admin can do everything on events" ON events FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Super admin can do everything on concepts" ON concepts FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Super admin can do everything on global_settings" ON global_settings FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Anyone can read global_settings" ON global_settings FOR SELECT USING (true);

-- 3.5. Allow deleting sessions (photos) from the gallery
CREATE POLICY "Anyone can delete sessions" ON sessions FOR DELETE USING (true);

-- 4. Create a secure function to delete users (requires super admin privileges)
CREATE OR REPLACE FUNCTION delete_user(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with the privileges of the creator (postgres role)
AS $$
BEGIN
  -- Check if the calling user is the super admin
  IF auth.jwt() ->> 'email' != 'coroaiphotobooth@gmail.com' THEN
    RAISE EXCEPTION 'Unauthorized: Only super admin can delete users';
  END IF;

  -- Delete from auth.users (this will cascade to vendors if foreign keys are set up, 
  -- but we explicitly delete from vendors first just in case)
  DELETE FROM public.vendors WHERE id = user_id;
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

-- 5. Grant execute permission to authenticated users (the function itself checks the email)
GRANT EXECUTE ON FUNCTION delete_user(user_id UUID) TO authenticated;`}
              </pre>
              <button 
                onClick={() => setShowSqlModal(false)}
                className="mt-4 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg text-sm font-bold transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-4 mb-8 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-[#bc13fe] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('vendors')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${activeTab === 'vendors' ? 'bg-[#bc13fe] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            Vendor Management
          </button>
        </div>

        {activeTab === 'dashboard' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-6 rounded-2xl border border-white/10">
              <h2 className="text-xl font-bold mb-4">Template Concepts Gallery</h2>
              <p className="text-sm text-gray-400 mb-6">
                Create reusable concepts that vendors can load directly into their events.
              </p>
              
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    setEditingConcept(null);
                    setConceptForm({ name: '', prompt: '', thumbnail: '', ref_image: '' });
                    setShowConceptModal(true);
                  }}
                  className="w-full py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  + ADD NEW TEMPLATE CONCEPT
                </button>

                <div className="mt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {templateConcepts.map(concept => (
                      <div key={concept.id} className="bg-black/30 border border-white/5 rounded-xl overflow-hidden group">
                        <div className="aspect-square relative">
                          <img src={concept.thumbnail} alt={concept.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setEditingConcept(concept);
                                setConceptForm({
                                  name: concept.name,
                                  prompt: concept.prompt,
                                  thumbnail: concept.thumbnail,
                                  ref_image: concept.ref_image || ''
                                });
                                setShowConceptModal(true);
                              }}
                              className="p-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplateConcept(concept.id)}
                              className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="p-3">
                          <h3 className="font-bold text-sm truncate">{concept.name}</h3>
                          <p className="text-xs text-gray-500 truncate mt-1">{concept.prompt}</p>
                        </div>
                      </div>
                    ))}
                    {templateConcepts.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-4 col-span-full">No template concepts found.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-card p-6 rounded-2xl border border-white/10">
              <h2 className="text-xl font-bold mb-4">Global Settings</h2>
              <p className="text-sm text-gray-400 mb-6">
                Configure system-wide settings for all vendors.
              </p>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Default Free Credits</label>
                  <input
                    type="number"
                    value={globalSettings.default_free_credits}
                    onChange={(e) => setGlobalSettings({...globalSettings, default_free_credits: parseInt(e.target.value) || 0})}
                    className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                  />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">System Status</label>
                  <select 
                    value={globalSettings.system_status}
                    onChange={(e) => setGlobalSettings({...globalSettings, system_status: e.target.value})}
                    className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                  >
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance Mode</option>
                  </select>
                </div>

                <button 
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="w-full py-3 mt-4 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold tracking-wider transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {savingSettings ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SAVE SETTINGS'}
                </button>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-white/10">
              <h2 className="text-xl font-bold mb-4">Vendor Messaging</h2>
              <p className="text-sm text-gray-400 mb-6">
                Send a message or information to vendors. It will appear on their dashboard.
              </p>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Select Vendor</label>
                  <select 
                    value={messageForm.vendorId}
                    onChange={(e) => setMessageForm({...messageForm, vendorId: e.target.value})}
                    className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors"
                  >
                    <option value="all">All Vendors</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.email})</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Message</label>
                  <textarea
                    value={messageForm.message}
                    onChange={(e) => setMessageForm({...messageForm, message: e.target.value})}
                    placeholder="Type your message here..."
                    className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-[#bc13fe] outline-none transition-colors h-32 resize-none"
                  />
                </div>

                <button 
                  onClick={handleSendMessage}
                  disabled={sendingMessage}
                  className="w-full py-3 mt-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold tracking-wider transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {sendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SEND MESSAGE'}
                </button>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-white/10">
              <h2 className="text-xl font-bold mb-4">Template Management</h2>
              <p className="text-sm text-gray-400 mb-6">
                Create a default event template. New events will copy settings and concepts from the default template.
              </p>
              
              <div className="space-y-4">
                <button 
                  onClick={() => setShowCreateTemplateModal(true)}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  + CREATE TEMPLATE FOR DEFAULT
                </button>

                <div className="mt-6">
                  <h3 className="text-sm font-bold text-gray-300 mb-3">Available Events</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {events.map(event => (
                      <div key={event.id} className={`p-3 rounded-lg border flex flex-col gap-2 ${globalSettings.template_event_id === event.id ? 'bg-[#bc13fe]/20 border-[#bc13fe]/50' : 'bg-black/30 border-white/5'}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-sm">{event.name}</p>
                            <p className="text-xs text-gray-500">Vendor: {vendors.find(v => v.id === event.vendor_id)?.name || 'Unknown'}</p>
                          </div>
                          {globalSettings.template_event_id === event.id && (
                            <span className="text-[10px] bg-[#bc13fe] text-white px-2 py-1 rounded-full font-bold">DEFAULT</span>
                          )}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => navigate(`/admin/${event.id}`)}
                            className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-xs font-bold rounded transition-colors"
                          >
                            EDIT SETUP
                          </button>
                          {globalSettings.template_event_id !== event.id && (
                            <button
                              onClick={() => handleSetDefaultTemplate(event.id)}
                              className="flex-1 py-1.5 bg-[#bc13fe]/20 hover:bg-[#bc13fe]/40 text-[#bc13fe] text-xs font-bold rounded transition-colors"
                            >
                              SET TO DEFAULT
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTemplateEvent(event.id)}
                            className="py-1.5 px-3 bg-red-500/20 hover:bg-red-500/40 text-red-500 text-xs font-bold rounded transition-colors"
                            title="Delete Template Event"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {events.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-4">No events found.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="glass-card p-6 rounded-2xl border border-white/10">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Settings className="w-6 h-6 text-[#bc13fe]" />
                  Vendor Management
                </h2>
                <div className="relative w-full sm:w-64">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search vendors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:border-[#bc13fe] outline-none transition-colors"
                  />
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-sm">
                      <th className="pb-4 font-medium">Email</th>
                      <th className="pb-4 font-medium">Name</th>
                      <th className="pb-4 font-medium">Company</th>
                      <th className="pb-4 font-medium">Country</th>
                      <th className="pb-4 font-medium">Phone</th>
                      <th className="pb-4 font-medium">Plan</th>
                      <th className="pb-4 font-medium">Credits</th>
                      <th className="pb-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredVendors.map(v => (
                      <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-4">{v.email || 'N/A'}</td>
                        <td className="py-4">
                          {editingVendor?.id === v.id ? (
                            <input 
                              type="text" 
                              value={editForm.name} 
                              onChange={e => setEditForm({...editForm, name: e.target.value})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1 w-full"
                            />
                          ) : (v.name || 'N/A')}
                        </td>
                        <td className="py-4 text-gray-400">
                          {editingVendor?.id === v.id ? (
                            <input 
                              type="text" 
                              value={editForm.company_name} 
                              onChange={e => setEditForm({...editForm, company_name: e.target.value})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1 w-full"
                            />
                          ) : (v.company_name || '-')}
                        </td>
                        <td className="py-4 text-gray-400">
                          {editingVendor?.id === v.id ? (
                            <input 
                              type="text" 
                              value={editForm.country} 
                              onChange={e => setEditForm({...editForm, country: e.target.value})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1 w-full"
                            />
                          ) : (v.country || '-')}
                        </td>
                        <td className="py-4 text-gray-400">
                          {editingVendor?.id === v.id ? (
                            <input 
                              type="text" 
                              value={editForm.phone} 
                              onChange={e => setEditForm({...editForm, phone: e.target.value})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1 w-full"
                            />
                          ) : (v.phone || '-')}
                        </td>
                        <td className="py-4">
                          {editingVendor?.id === v.id ? (
                            <select 
                              value={editForm.plan} 
                              onChange={e => setEditForm({...editForm, plan: e.target.value})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1"
                            >
                              <option value="free">Free</option>
                              <option value="pro">Pro</option>
                              <option value="enterprise">Enterprise</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              v.plan === 'pro' ? 'bg-[#bc13fe]/20 text-[#bc13fe]' : 
                              v.plan === 'enterprise' ? 'bg-blue-500/20 text-blue-400' : 
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {v.plan?.toUpperCase() || 'FREE'}
                            </span>
                          )}
                        </td>
                        <td className="py-4">
                          {editingVendor?.id === v.id ? (
                            <input 
                              type="number" 
                              value={editForm.credits} 
                              onChange={e => setEditForm({...editForm, credits: parseInt(e.target.value) || 0})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1 w-20"
                            />
                          ) : (v.credits || 0)}
                        </td>
                        <td className="py-4 text-right">
                          {editingVendor?.id === v.id ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={saveEdit} className="p-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingVendor(null)} className="p-2 bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/30">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleMessageVendor(v.id)} 
                                className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                                title="Send Message"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => navigate(`/dashboard?vendorId=${v.id}`)} 
                                className="p-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30"
                                title="Enter Vendor Dashboard"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleToggleBlock(v)} 
                                className={`p-2 rounded ${v.is_blocked ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'}`}
                                title={v.is_blocked ? "Unblock Vendor" : "Block Vendor"}
                              >
                                {v.is_blocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                              </button>
                              <button onClick={() => startEdit(v)} className="p-2 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteVendor(v.id)} className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredVendors.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-500">No vendors found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Template Concept Modal */}
      {showConceptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#111] z-10">
              <h2 className="text-xl font-bold">{editingConcept ? 'Edit Template Concept' : 'Add Template Concept'}</h2>
              <button onClick={() => setShowConceptModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-300">Concept Name</label>
                <input
                  type="text"
                  value={conceptForm.name}
                  onChange={e => setConceptForm({ ...conceptForm, name: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-[#bc13fe] outline-none"
                  placeholder="e.g., Cyberpunk Neon"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-300">Prompt</label>
                <textarea
                  value={conceptForm.prompt}
                  onChange={e => setConceptForm({ ...conceptForm, prompt: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-[#bc13fe] outline-none h-32 resize-none"
                  placeholder="Enter the generation prompt..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-300">Thumbnail Image</label>
                  <div className="aspect-square rounded-xl border-2 border-dashed border-white/20 overflow-hidden relative group bg-black/50">
                    {conceptForm.thumbnail ? (
                      <>
                        <img src={conceptForm.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <label className="cursor-pointer px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold backdrop-blur-sm transition-colors">
                            Change Image
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'thumbnail')} />
                          </label>
                        </div>
                      </>
                    ) : (
                      <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                        <span className="text-3xl mb-2">+</span>
                        <span className="text-sm text-gray-400">Upload Thumbnail</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'thumbnail')} />
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 font-bold whitespace-nowrap">OR URL:</span>
                    <input
                      type="text"
                      value={conceptForm.thumbnail}
                      onChange={e => setConceptForm({ ...conceptForm, thumbnail: e.target.value })}
                      className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#bc13fe] outline-none"
                      placeholder="Paste image URL here..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-300">Reference Image (Optional)</label>
                  <div className="aspect-square rounded-xl border-2 border-dashed border-white/20 overflow-hidden relative group bg-black/50">
                    {conceptForm.ref_image ? (
                      <>
                        <img src={conceptForm.ref_image} alt="Reference" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <label className="cursor-pointer px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold backdrop-blur-sm transition-colors">
                            Change
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'ref_image')} />
                          </label>
                          <button 
                            onClick={() => setConceptForm({ ...conceptForm, ref_image: '' })}
                            className="px-4 py-2 bg-red-500/50 hover:bg-red-500/80 rounded-lg text-sm font-bold backdrop-blur-sm transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                        <span className="text-3xl mb-2">+</span>
                        <span className="text-sm text-gray-400">Upload Reference</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'ref_image')} />
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 font-bold whitespace-nowrap">OR URL:</span>
                    <input
                      type="text"
                      value={conceptForm.ref_image}
                      onChange={e => setConceptForm({ ...conceptForm, ref_image: e.target.value })}
                      className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#bc13fe] outline-none"
                      placeholder="Paste image URL here..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-4 sticky bottom-0 bg-[#111] z-10">
              <button
                onClick={() => setShowConceptModal(false)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplateConcept}
                disabled={savingConcept}
                className="px-6 py-2 bg-[#bc13fe] hover:bg-[#a010d8] rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {savingConcept ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Concept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
