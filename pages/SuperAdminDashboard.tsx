import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, LogOut, Trash2, Edit, Save, Settings, ShieldAlert, Lock, Unlock } from 'lucide-react';
import { Vendor } from '../types';
import { useDialog } from '../components/DialogProvider';

export default function SuperAdminDashboard() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [globalSettings, setGlobalSettings] = useState({ default_free_credits: 100, system_status: 'active' });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editForm, setEditForm] = useState({ name: '', company_name: '', country: '', phone: '', plan: 'free', credits: 0 });
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
          system_status: settingsData.system_status
        });
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

-- Add storage_folder to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_folder TEXT;

-- 2. Update default free credits to 5
-- If your global_settings table uses an integer ID, run this instead: UPDATE global_settings SET default_free_credits = 5 WHERE id = 1;
UPDATE global_settings SET default_free_credits = 5;

-- 3. Grant Super Admin access
CREATE POLICY "Super admin can do everything on vendors" ON vendors FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Super admin can do everything on events" ON events FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Super admin can do everything on concepts" ON concepts FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-6 rounded-2xl border border-white/10">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Settings className="w-6 h-6 text-[#bc13fe]" />
                Vendor Management
              </h2>
              
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
                    {vendors.map(v => (
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
                    {vendors.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500">No vendors found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
          </div>
        </div>
      </div>
    </div>
  );
}
