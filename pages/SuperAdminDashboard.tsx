import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, LogOut, Trash2, Edit, Save, Settings, ShieldAlert } from 'lucide-react';
import { Vendor } from '../types';

export default function SuperAdminDashboard() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [globalSettings, setGlobalSettings] = useState({ default_free_credits: 100, system_status: 'active' });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editForm, setEditForm] = useState({ name: '', plan: 'free', credits: 0 });
  const [showSqlModal, setShowSqlModal] = useState(false);
  const navigate = useNavigate();

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
      }
      
      setVendors(vendorsData || []);

      // Fetch Global Settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('global_settings')
        .select('*')
        .eq('id', 'default')
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
          id: 'default',
          default_free_credits: globalSettings.default_free_credits,
          system_status: globalSettings.system_status,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      alert('Global settings saved successfully!');
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleDeleteVendor = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this vendor? This will delete all their events and data.')) return;
    
    try {
      // Note: Deleting from auth.users requires service role key. 
      // We can only delete from public.vendors if RLS allows it.
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) throw error;
      setVendors(vendors.filter(v => v.id !== id));
    } catch (err: any) {
      alert(`Failed to delete vendor: ${err.message}\n\nNote: Deleting users completely requires Supabase Dashboard access or a Service Role key.`);
    }
  };

  const startEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setEditForm({
      name: vendor.name || '',
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
          plan: editForm.plan,
          credits: editForm.credits
        })
        .eq('id', editingVendor.id);

      if (error) throw error;
      
      setVendors(vendors.map(v => v.id === editingVendor.id ? { ...v, ...editForm } as Vendor : v));
      setEditingVendor(null);
    } catch (err: any) {
      alert(`Failed to update vendor: ${err.message}`);
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
              <h3 className="text-lg font-bold mb-2">Supabase RLS Update Required</h3>
              <p className="mb-4 text-sm opacity-90">
                To view and manage all vendors, you need to run this SQL command in your Supabase SQL Editor to grant Super Admin access:
              </p>
              <pre className="bg-black/50 p-4 rounded-lg text-xs overflow-x-auto border border-yellow-500/20">
{`-- Run this in Supabase SQL Editor
CREATE POLICY "Super admin can do everything on vendors" ON vendors FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Super admin can do everything on events" ON events FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE POLICY "Super admin can do everything on concepts" ON concepts FOR ALL USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');`}
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
