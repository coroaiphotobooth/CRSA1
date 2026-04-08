import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2, LogOut, Trash2, Edit, Save, Settings, ShieldAlert, Lock, Unlock, ExternalLink, Search, MessageSquare, MoreVertical, Plus, X } from 'lucide-react';
import { Vendor, TemplateConcept } from '../../types';
import { useDialog } from '../../components/DialogProvider';

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
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', company_name: '', country: '', phone: '', plan: 'free', credits: 0, unlimited_seconds_left: 0, _original_unlimited_seconds_left: 0, unlimited_expires_at: null as string | null });
  
  // Template Concept Form State
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [editingConcept, setEditingConcept] = useState<TemplateConcept | null>(null);
  const [conceptForm, setConceptForm] = useState({ name: '', prompt: '', thumbnail: '', ref_image: '' });
  const [savingConcept, setSavingConcept] = useState(false);

  // Message Form State
  const [messageForm, setMessageForm] = useState({ vendorId: 'all', message: '' });
  const [sendingMessage, setSendingMessage] = useState(false);

  // Add Vendor State
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [addVendorForm, setAddVendorForm] = useState({ email: '', password: '', name: '', company_name: '' });
  const [addingVendor, setAddingVendor] = useState(false);

  // Template Event State
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const [showSqlModal, setShowSqlModal] = useState(false);
  const navigate = useNavigate();
  const { showDialog } = useDialog();

  const SUPER_ADMIN_EMAIL = 'admin@coroai.app';
  const [onlineVendors, setOnlineVendors] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();

    // Subscribe to vendor presence
    const channel = supabase.channel('vendor_presence');
    
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const onlineIds = new Set<string>();
      
      for (const id in state) {
        // state[id] is an array of presences for that key
        const presences = state[id] as any[];
        if (presences && presences.length > 0) {
          onlineIds.add(id);
        }
      }
      
      setOnlineVendors(onlineIds);
    }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      } else if (vendorsData && vendorsData.length > 0 && (!('company_name' in vendorsData[0]) || !('email_confirmed' in vendorsData[0]) || !('credits_used' in vendorsData[0]) || !('unlimited_seconds_left' in vendorsData[0]))) {
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
        const superAdminVendor = vendorsData?.find(v => v.email === 'admin@coroai.app');
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

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addVendorForm.email || !addVendorForm.password || !addVendorForm.name) {
      await showDialog('alert', 'Error', 'Please fill in all required fields.');
      return;
    }

    try {
      setAddingVendor(true);
      
      // Create a secondary Supabase client to avoid logging out the super admin
      const { createClient } = await import('@supabase/supabase-js');
      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL || '',
        import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data, error } = await tempSupabase.auth.signUp({
        email: addVendorForm.email,
        password: addVendorForm.password,
        options: {
          data: {
            full_name: addVendorForm.name,
            company_name: addVendorForm.company_name
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Update company name if provided (since trigger might not catch it)
        if (addVendorForm.company_name) {
          await supabase.from('vendors').update({ company_name: addVendorForm.company_name }).eq('id', data.user.id);
        }
        
        await showDialog('alert', 'Success', 'Vendor added successfully! They can now log in.');
        setIsAddVendorOpen(false);
        setAddVendorForm({ email: '', password: '', name: '', company_name: '' });
        fetchData(); // Refresh vendors list
      }
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to add vendor: ${err.message}`);
    } finally {
      setAddingVendor(false);
    }
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

  const handleConfirmEmail = async (vendor: Vendor) => {
    const confirmed = await showDialog('confirm', 'Confirm Email', `Are you sure you want to manually confirm the email for ${vendor.name}?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc('confirm_vendor_email', { vendor_id: vendor.id });
      if (error) throw error;

      setVendors(vendors.map(v => 
        v.id === vendor.id ? { ...v, email_confirmed: true } : v
      ));
      await showDialog('alert', 'Success', 'Vendor email confirmed successfully.');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to confirm email: ${err.message}\n\nNote: You may need to run the SQL command in the yellow warning box at the top of the page to enable this feature.`);
    }
  };

  const startEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    
    let currentRemaining = vendor.unlimited_seconds_left || 0;
    if (vendor.is_timer_running && vendor.timer_last_started_at) {
      const elapsed = Math.floor((Date.now() - new Date(vendor.timer_last_started_at).getTime()) / 1000);
      currentRemaining = Math.max(0, currentRemaining - elapsed);
    }

    setEditForm({
      name: vendor.name || '',
      company_name: vendor.company_name || '',
      country: vendor.country || '',
      phone: vendor.phone || '',
      plan: vendor.plan || 'free',
      credits: vendor.credits || 0,
      unlimited_seconds_left: currentRemaining,
      _original_unlimited_seconds_left: currentRemaining,
      unlimited_expires_at: vendor.unlimited_expires_at || null
    });
  };

  const saveExpiryOnly = async (vendorId: string, expiresAt: string | null) => {
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ unlimited_expires_at: expiresAt })
        .eq('id', vendorId);
      if (error) throw error;
      setVendors(vendors.map(v => v.id === vendorId ? { ...v, unlimited_expires_at: expiresAt } : v));
      await showDialog('alert', 'Success', 'Expiry updated successfully');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to update expiry: ${err.message}`);
    }
  };

  const saveEdit = async () => {
    if (!editingVendor) return;
    try {
      const updatePayload: any = {};
      if (editForm.name !== editingVendor.name) updatePayload.name = editForm.name;
      if (editForm.company_name !== editingVendor.company_name) updatePayload.company_name = editForm.company_name;
      if (editForm.country !== editingVendor.country) updatePayload.country = editForm.country;
      if (editForm.phone !== editingVendor.phone) updatePayload.phone = editForm.phone;
      if (editForm.plan !== editingVendor.plan) updatePayload.plan = editForm.plan;
      if (editForm.credits !== editingVendor.credits) updatePayload.credits = editForm.credits;
      if (editForm.unlimited_expires_at !== editingVendor.unlimited_expires_at) updatePayload.unlimited_expires_at = editForm.unlimited_expires_at;
      
      if (editForm.unlimited_seconds_left !== editForm._original_unlimited_seconds_left) {
        updatePayload.unlimited_seconds_left = editForm.unlimited_seconds_left;
        updatePayload.is_timer_running = false;
        updatePayload.timer_last_started_at = null;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error } = await supabase
          .from('vendors')
          .update(updatePayload)
          .eq('id', editingVendor.id);

        if (error) throw error;
      }
      
      setVendors(vendors.map(v => v.id === editingVendor.id ? { ...v, ...updatePayload } as Vendor : v));
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
          plan: 'pay_as_you_go',
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

  const getRemainingTime = (v: Vendor) => {
    if (v.is_timer_running && v.timer_last_started_at) {
      const elapsed = Math.floor((Date.now() - new Date(v.timer_last_started_at).getTime()) / 1000);
      return Math.max(0, (v.unlimited_seconds_left || 0) - elapsed);
    }
    return v.unlimited_seconds_left || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#bc13fe]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-heading font-bold neon-text mb-2">SUPER ADMIN</h1>
            <p className="text-gray-400 text-sm md:text-base">Manage all vendors and system settings</p>
          </div>
          <div className="flex gap-3">
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
            <div className="bg-[#1a1a1a]/80 backdrop-blur-md rounded-2xl border border-white/10 w-full max-w-md overflow-hidden shadow-2xl">
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
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS unlimited_seconds_left INTEGER DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_timer_running BOOLEAN DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS timer_last_started_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS unlimited_expires_at TIMESTAMPTZ;

-- Add storage_folder to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_folder TEXT;

-- 2. Update RLS Policies for Events (Secure Access)
-- Remove old policies
DROP POLICY IF EXISTS "Anyone can view events" ON events;
DROP POLICY IF EXISTS "Vendors can view own events" ON events;
DROP POLICY IF EXISTS "Superadmin can view all events" ON events;
DROP POLICY IF EXISTS "Anyone can view templates" ON events;
DROP POLICY IF EXISTS "Anyone can view superadmin events" ON events;
DROP POLICY IF EXISTS "Guests can view events" ON events;

-- Create a secure function to get the superadmin ID
CREATE OR REPLACE FUNCTION get_superadmin_id()
RETURNS UUID AS $$
  SELECT id FROM vendors WHERE email = 'admin@coroai.app' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Vendor only sees their own events
CREATE POLICY "Vendors can view own events" ON events FOR SELECT USING (vendor_id = auth.uid());

-- Superadmin sees all events
CREATE POLICY "Superadmin can view all events" ON events FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@coroai.app');

-- Anyone (including vendors) can see ALL events created by the Super Admin (these act as templates)
CREATE POLICY "Anyone can view superadmin events" ON events FOR SELECT USING (vendor_id = get_superadmin_id());

-- Guests (unauthenticated) can view events (needed for the public photobooth app to load settings)
-- This is safe because event IDs are unguessable UUIDs
CREATE POLICY "Guests can view events" ON events FOR SELECT USING (auth.role() = 'anon');

-- Allow reading concepts if the parent event is readable
DROP POLICY IF EXISTS "Anyone can read concepts" ON concepts;
CREATE POLICY "Anyone can read concepts" ON concepts FOR SELECT USING (true);

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
DROP POLICY IF EXISTS "Anyone can read template concepts" ON template_concepts;
CREATE POLICY "Anyone can read template concepts" ON template_concepts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Super admin can do everything on template concepts" ON template_concepts;
CREATE POLICY "Super admin can do everything on template concepts" ON template_concepts FOR ALL USING (auth.jwt() ->> 'email' = 'admin@coroai.app');

-- 2. Update default free credits to 50
-- If your global_settings table uses a text ID, run this instead: UPDATE global_settings SET default_free_credits = 50 WHERE id = '1';
UPDATE global_settings SET default_free_credits = 50;

-- Update plan check constraint
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_plan_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_plan_check CHECK (plan IN ('free', 'pay_as_you_go', 'rent', 'pro', 'enterprise'));

-- 3. Grant Super Admin access
DROP POLICY IF EXISTS "Super admin can do everything on vendors" ON vendors;
CREATE POLICY "Super admin can do everything on vendors" ON vendors FOR ALL USING (auth.jwt() ->> 'email' = 'admin@coroai.app');
DROP POLICY IF EXISTS "Super admin can do everything on events" ON events;
CREATE POLICY "Super admin can do everything on events" ON events FOR ALL USING (auth.jwt() ->> 'email' = 'admin@coroai.app');
DROP POLICY IF EXISTS "Super admin can do everything on concepts" ON concepts;
CREATE POLICY "Super admin can do everything on concepts" ON concepts FOR ALL USING (auth.jwt() ->> 'email' = 'admin@coroai.app');
DROP POLICY IF EXISTS "Super admin can do everything on global_settings" ON global_settings;
CREATE POLICY "Super admin can do everything on global_settings" ON global_settings FOR ALL USING (auth.jwt() ->> 'email' = 'admin@coroai.app');
DROP POLICY IF EXISTS "Anyone can read global_settings" ON global_settings;
CREATE POLICY "Anyone can read global_settings" ON global_settings FOR SELECT USING (true);

-- 3.1. Restrict public access to events and concepts
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() ->> 'email') = 'admin@coroai.app';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Anyone can view events" ON events;
DROP POLICY IF EXISTS "Vendors can view their own events" ON events;
CREATE POLICY "Vendors can view their own events" ON events FOR SELECT USING (auth.uid() = vendor_id OR is_superadmin());

DROP POLICY IF EXISTS "Anyone can view concepts" ON concepts;
DROP POLICY IF EXISTS "Vendors can view concepts for their events" ON concepts;
CREATE POLICY "Vendors can view concepts for their events" ON concepts FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = concepts.event_id AND (events.vendor_id = auth.uid() OR is_superadmin()))
);

-- Anyone (including vendors) can see ALL concepts created by the Super Admin (these act as templates)
DROP POLICY IF EXISTS "Anyone can view superadmin concepts" ON concepts;
CREATE POLICY "Anyone can view superadmin concepts" ON concepts FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = concepts.event_id AND events.vendor_id = get_superadmin_id())
);

-- 3.5. Allow deleting sessions (photos) from the gallery
DROP POLICY IF EXISTS "Anyone can delete sessions" ON sessions;
CREATE POLICY "Anyone can delete sessions" ON sessions FOR DELETE USING (true);

-- 4. Create a secure function to delete users (requires super admin privileges)
CREATE OR REPLACE FUNCTION delete_user(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with the privileges of the creator (postgres role)
AS $$
BEGIN
  -- Check if the calling user is the super admin
  IF auth.jwt() ->> 'email' != 'admin@coroai.app' THEN
    RAISE EXCEPTION 'Unauthorized: Only super admin can delete users';
  END IF;

  -- Delete from auth.users (this will cascade to vendors if foreign keys are set up, 
  -- but we explicitly delete from vendors first just in case)
  DELETE FROM public.vendors WHERE id = user_id;
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

-- 5. Grant execute permission to authenticated users (the function itself checks the email)
GRANT EXECUTE ON FUNCTION delete_user(user_id UUID) TO authenticated;

-- 6. Update decrement_credits functions to track usage and support unlimited timer
CREATE OR REPLACE FUNCTION decrement_credits(p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_vendor_id UUID;
  v_credits INTEGER;
  v_is_timer_running BOOLEAN;
  v_timer_last_started_at TIMESTAMPTZ;
  v_unlimited_seconds_left INTEGER;
  v_unlimited_expires_at TIMESTAMPTZ;
  v_elapsed INTEGER;
  v_remaining INTEGER;
BEGIN
  SELECT v.id, v.credits, v.is_timer_running, v.timer_last_started_at, v.unlimited_seconds_left, v.unlimited_expires_at
  INTO v_vendor_id, v_credits, v_is_timer_running, v_timer_last_started_at, v_unlimited_seconds_left, v_unlimited_expires_at
  FROM events e JOIN vendors v ON e.vendor_id = v.id
  WHERE e.id = p_event_id AND e.is_active = true;
  
  IF v_vendor_id IS NULL THEN RETURN FALSE; END IF;

  IF v_unlimited_expires_at IS NOT NULL AND NOW() > v_unlimited_expires_at THEN
    UPDATE vendors SET is_timer_running = false, timer_last_started_at = null, unlimited_seconds_left = 0, unlimited_expires_at = null WHERE id = v_vendor_id;
    v_is_timer_running := false;
    v_unlimited_seconds_left := 0;
  END IF;

  IF v_is_timer_running AND v_timer_last_started_at IS NOT NULL THEN
    v_elapsed := EXTRACT(EPOCH FROM (NOW() - v_timer_last_started_at))::INTEGER;
    v_remaining := GREATEST(0, COALESCE(v_unlimited_seconds_left, 0) - v_elapsed);
    IF v_remaining > 0 THEN
      RETURN TRUE;
    ELSE
      UPDATE vendors SET is_timer_running = false, timer_last_started_at = null, unlimited_seconds_left = 0 WHERE id = v_vendor_id;
    END IF;
  END IF;

  IF v_credits <= 0 THEN RETURN FALSE; END IF;
  UPDATE vendors SET credits = credits - 1, credits_used = COALESCE(credits_used, 0) + 1 WHERE id = v_vendor_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_credits_by_amount(p_event_id UUID, p_amount INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_vendor_id UUID;
  v_credits INTEGER;
  v_is_timer_running BOOLEAN;
  v_timer_last_started_at TIMESTAMPTZ;
  v_unlimited_seconds_left INTEGER;
  v_unlimited_expires_at TIMESTAMPTZ;
  v_elapsed INTEGER;
  v_remaining INTEGER;
BEGIN
  SELECT v.id, v.credits, v.is_timer_running, v.timer_last_started_at, v.unlimited_seconds_left, v.unlimited_expires_at
  INTO v_vendor_id, v_credits, v_is_timer_running, v_timer_last_started_at, v_unlimited_seconds_left, v_unlimited_expires_at
  FROM events e JOIN vendors v ON e.vendor_id = v.id
  WHERE e.id = p_event_id AND e.is_active = true;
  
  IF v_vendor_id IS NULL THEN RETURN FALSE; END IF;

  IF v_unlimited_expires_at IS NOT NULL AND NOW() > v_unlimited_expires_at THEN
    UPDATE vendors SET is_timer_running = false, timer_last_started_at = null, unlimited_seconds_left = 0, unlimited_expires_at = null WHERE id = v_vendor_id;
    v_is_timer_running := false;
    v_unlimited_seconds_left := 0;
  END IF;

  IF v_is_timer_running AND v_timer_last_started_at IS NOT NULL THEN
    v_elapsed := EXTRACT(EPOCH FROM (NOW() - v_timer_last_started_at))::INTEGER;
    v_remaining := GREATEST(0, COALESCE(v_unlimited_seconds_left, 0) - v_elapsed);
    IF v_remaining > 0 THEN
      RETURN TRUE;
    ELSE
      UPDATE vendors SET is_timer_running = false, timer_last_started_at = null, unlimited_seconds_left = 0 WHERE id = v_vendor_id;
    END IF;
  END IF;

  IF v_credits < p_amount THEN RETURN FALSE; END IF;
  UPDATE vendors SET credits = credits - p_amount, credits_used = COALESCE(credits_used, 0) + p_amount WHERE id = v_vendor_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to manually confirm a vendor's email
CREATE OR REPLACE FUNCTION confirm_vendor_email(vendor_id UUID)
RETURNS void AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'admin@coroai.app' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = vendor_id;
  UPDATE public.vendors SET email_confirmed = true WHERE id = vendor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`}
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
                <div className="flex items-center gap-4 w-full sm:w-auto">
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
                  <button
                    onClick={() => setIsAddVendorOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#bc13fe] hover:bg-[#bc13fe]/80 text-white rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Add Vendor
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto custom-scrollbar -mx-6 px-6">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-[#1a1a1a] z-10">
                    <tr className="text-gray-400 text-[11px] uppercase tracking-wider">
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10">No.</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10">Vendor Info</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10">Status</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10">Company & Contact</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10">Plan</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10 text-center">Credits</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10 text-center">Unlimited</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10 text-center">Used</th>
                      <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13px]">
                    {filteredVendors.map((v, index) => (
                      <tr key={v.id} className="group border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-2 text-gray-500 align-top">{index + 1}</td>
                        <td className="py-3 px-2 align-top max-w-[200px]">
                          <div className="flex flex-col">
                            {editingVendor?.id === v.id ? (
                              <input 
                                type="text" 
                                value={editForm.name} 
                                onChange={e => setEditForm({...editForm, name: e.target.value})}
                                className="bg-black/50 border border-white/20 rounded px-2 py-1 w-full mb-1"
                                placeholder="Name"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white block truncate" title={v.name || 'N/A'}>{v.name || 'N/A'}</span>
                                {onlineVendors.has(v.id) ? (
                                  <span className="flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]" title="Online"></span>
                                ) : (
                                  <span className="flex h-2 w-2 rounded-full bg-gray-600" title="Offline"></span>
                                )}
                              </div>
                            )}
                            <span className="text-gray-500 text-[11px] truncate" title={v.email || 'N/A'}>{v.email || 'N/A'}</span>
                            {v.last_login_at && (
                              <span className="text-gray-600 text-[10px] mt-1" title="Last Login">
                                Last: {new Date(v.last_login_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-top">
                          <div className="flex flex-col gap-1">
                            {v.email_confirmed ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 w-fit">
                                CONFIRMED
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 w-fit">
                                UNCONFIRMED
                              </span>
                            )}
                            {v.is_blocked && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 w-fit">
                                BLOCKED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-top max-w-[200px]">
                          <div className="flex flex-col gap-1">
                            {editingVendor?.id === v.id ? (
                              <>
                                <input 
                                  type="text" 
                                  value={editForm.company_name} 
                                  onChange={e => setEditForm({...editForm, company_name: e.target.value})}
                                  className="bg-black/50 border border-white/20 rounded px-2 py-1 w-full text-xs"
                                  placeholder="Company"
                                />
                                <input 
                                  type="text" 
                                  value={editForm.phone} 
                                  onChange={e => setEditForm({...editForm, phone: e.target.value})}
                                  className="bg-black/50 border border-white/20 rounded px-2 py-1 w-full text-xs"
                                  placeholder="Phone"
                                />
                              </>
                            ) : (
                              <>
                                <span className="text-gray-300 block truncate" title={v.company_name || '-'}>{v.company_name || '-'}</span>
                                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                  <span>{v.country || '-'}</span>
                                  {v.phone && <span>• {v.phone}</span>}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-top">
                          {editingVendor?.id === v.id ? (
                            <select 
                              value={editForm.plan} 
                              onChange={e => setEditForm({...editForm, plan: e.target.value as any})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1 text-xs w-full"
                            >
                              <option value="free">FREE</option>
                              <option value="pay_as_you_go">PAY AS YOU GO</option>
                              <option value="rent">RENT</option>
                              <option value="pro">PRO</option>
                              <option value="enterprise">ENTERPRISE</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              v.plan === 'pay_as_you_go' ? 'bg-[#bc13fe]/10 text-[#bc13fe] border border-[#bc13fe]/20' : 
                              v.plan === 'rent' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                              v.plan === 'pro' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                              v.plan === 'enterprise' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                            }`}>
                              {v.plan?.replace(/_/g, ' ').toUpperCase() || 'FREE'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 align-top text-center">
                          {editingVendor?.id === v.id ? (
                            <input 
                              type="number" 
                              value={editForm.credits} 
                              onChange={e => setEditForm({...editForm, credits: parseInt(e.target.value) || 0})}
                              className="bg-black/50 border border-white/20 rounded px-2 py-1 w-16 text-center text-xs"
                            />
                          ) : (
                            <span className="font-mono">{v.credits || 0}</span>
                          )}
                        </td>
                        <td className="py-3 px-2 align-top text-center min-w-[140px]">
                          <div className="flex flex-col items-center gap-1">
                            {editingVendor?.id === v.id ? (
                              <div className="flex flex-col gap-1 w-full">
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number" 
                                    step="0.5"
                                    value={editForm.unlimited_seconds_left / 3600} 
                                    onChange={e => setEditForm({...editForm, unlimited_seconds_left: Math.floor(parseFloat(e.target.value || '0') * 3600)})}
                                    className="bg-black/50 border border-white/20 rounded px-1 py-1 w-full text-center text-xs"
                                  />
                                  <span className="text-[10px] text-gray-500">h</span>
                                </div>
                                <input 
                                  type="datetime-local" 
                                  value={editForm.unlimited_expires_at ? new Date(new Date(editForm.unlimited_expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                                  onChange={e => setEditForm({...editForm, unlimited_expires_at: e.target.value ? new Date(e.target.value).toISOString() : null})}
                                  className="bg-black/50 border border-white/20 rounded px-1 py-1 w-full text-[10px] text-white"
                                />
                              </div>
                            ) : (
                              <>
                                <span className={`font-mono ${v.is_timer_running ? "text-green-400 font-bold" : "text-gray-300"}`}>
                                  {(getRemainingTime(v) / 3600).toFixed(1)}h
                                </span>
                                {v.unlimited_expires_at && (
                                  <span className={`text-[10px] ${new Date(v.unlimited_expires_at).getTime() < Date.now() ? "text-red-500" : "text-gray-500"}`}>
                                    Exp: {new Date(v.unlimited_expires_at).toLocaleDateString()}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-top text-center">
                          <span className="font-mono text-gray-500">{v.credits_used || 0}</span>
                        </td>
                        <td className="py-3 px-2 align-top text-right">
                          {editingVendor?.id === v.id ? (
                            <div className="flex justify-end gap-1">
                              <button onClick={saveEdit} className="p-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors" title="Save">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingVendor(null)} className="p-1.5 bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/30 transition-colors" title="Cancel">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1 relative">
                              <button onClick={() => startEdit(v)} className="p-1.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition-colors" title="Edit">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setOpenActionMenuId(openActionMenuId === v.id ? null : v.id)}
                                className="p-1.5 bg-white/5 text-gray-400 rounded hover:bg-white/10 transition-colors"
                                title="More"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {openActionMenuId === v.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenActionMenuId(null)}></div>
                                  <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden flex flex-col">
                                    {!v.email_confirmed && (
                                      <button 
                                        onClick={() => { handleConfirmEmail(v); setOpenActionMenuId(null); }} 
                                        className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors text-green-400"
                                      >
                                        <ShieldAlert className="w-4 h-4" />
                                        <span className="text-xs font-bold">Confirm Email</span>
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => { handleMessageVendor(v.id); setOpenActionMenuId(null); }} 
                                      className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors text-blue-400 border-t border-white/5"
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                      <span className="text-xs font-bold">Send Message</span>
                                    </button>
                                    <button 
                                      onClick={() => { navigate(`/dashboard?vendorId=${v.id}`); setOpenActionMenuId(null); }} 
                                      className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors text-purple-400 border-t border-white/5"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                      <span className="text-xs font-bold">Enter Dashboard</span>
                                    </button>
                                    <button 
                                      onClick={() => { handleToggleBlock(v); setOpenActionMenuId(null); }} 
                                      className={`flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors border-t border-white/5 ${v.is_blocked ? 'text-yellow-400' : 'text-orange-400'}`}
                                    >
                                      {v.is_blocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                      <span className="text-xs font-bold">{v.is_blocked ? "Unblock Vendor" : "Block Vendor"}</span>
                                    </button>
                                    <button 
                                      onClick={() => { handleDeleteVendor(v.id); setOpenActionMenuId(null); }} 
                                      className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-red-500/10 transition-colors text-red-400 border-t border-white/5"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      <span className="text-xs font-bold">Remove Vendor</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredVendors.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-gray-500 italic">No vendors found matching your search</td>
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
          <div className="bg-[#111]/80 backdrop-blur-md border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#111]/80 backdrop-blur-md z-10">
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

      {/* Add Vendor Modal */}
      {isAddVendorOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#111] z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#bc13fe]" />
                Add New Vendor
              </h2>
              <button onClick={() => setIsAddVendorOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleAddVendor} className="p-6 overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    required
                    value={addVendorForm.email}
                    onChange={e => setAddVendorForm({...addVendorForm, email: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-[#bc13fe] outline-none"
                    placeholder="vendor@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Password <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={addVendorForm.password}
                    onChange={e => setAddVendorForm({...addVendorForm, password: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-[#bc13fe] outline-none"
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Full Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={addVendorForm.name}
                    onChange={e => setAddVendorForm({...addVendorForm, name: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-[#bc13fe] outline-none"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={addVendorForm.company_name}
                    onChange={e => setAddVendorForm({...addVendorForm, company_name: e.target.value})}
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-[#bc13fe] outline-none"
                    placeholder="Photography Studio"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setIsAddVendorOpen(false)}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingVendor}
                  className="px-6 py-2 bg-[#bc13fe] hover:bg-[#a010d8] rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {addingVendor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
