import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2, LogOut, Trash2, Settings, ShieldAlert } from 'lucide-react';
import { Vendor, TemplateConcept } from '../../types';
import { useDialog } from '../../components/DialogProvider';
import TemplateConceptsGallery from './TemplateConceptsGallery';
import VendorManagement from './VendorManagement';

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vendors'>('dashboard');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [templateConcepts, setTemplateConcepts] = useState<TemplateConcept[]>([]);
  const [globalSettings, setGlobalSettings] = useState({ default_free_credits: 100, system_status: 'active', template_event_id: '' });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Message Form State
  const [messageForm, setMessageForm] = useState({ vendorId: 'all', message: '' });
  const [sendingMessage, setSendingMessage] = useState(false);

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync missing vendors from auth.users
CREATE OR REPLACE FUNCTION sync_missing_vendors()
RETURNS void AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'admin@coroai.app' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.vendors (id, email, name, credits)
  SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'full_name', 'Vendor'), 
    COALESCE((SELECT default_free_credits FROM public.global_settings LIMIT 1), 10)
  FROM auth.users au
  LEFT JOIN public.vendors v ON au.id = v.id
  WHERE v.id IS NULL;
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
            <TemplateConceptsGallery 
              templateConcepts={templateConcepts} 
              setTemplateConcepts={setTemplateConcepts} 
            />
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
          <VendorManagement 
            vendors={vendors} 
            setVendors={setVendors} 
            onlineVendors={onlineVendors} 
            handleMessageVendor={handleMessageVendor} 
            fetchData={fetchData} 
          />
        )}
      </div>
    </div>
  );
}
