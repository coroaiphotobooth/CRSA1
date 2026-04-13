import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Trash2, Edit, Save, ShieldAlert, Lock, Unlock, ExternalLink, Search, MessageSquare, MoreVertical, Plus, X, Settings, Activity, RefreshCw } from 'lucide-react';
import { Vendor } from '../../types';
import { useDialog } from '../../components/DialogProvider';

interface VendorManagementProps {
  vendors: Vendor[];
  setVendors: React.Dispatch<React.SetStateAction<Vendor[]>>;
  onlineVendors: Set<string>;
  handleMessageVendor: (vendorId: string) => void;
  fetchData: () => Promise<void>;
}

export default function VendorManagement({ vendors, setVendors, onlineVendors, handleMessageVendor, fetchData }: VendorManagementProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', company_name: '', country: '', phone: '', plan: 'free', credits: 0, unlimited_seconds_left: 0, _original_unlimited_seconds_left: 0, unlimited_expires_at: null as string | null });
  
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [addVendorForm, setAddVendorForm] = useState({ email: '', password: '', name: '', company_name: '' });
  const [addingVendor, setAddingVendor] = useState(false);

  const [latestActivities, setLatestActivities] = useState<Record<string, any>>({});
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [selectedVendorForActivity, setSelectedVendorForActivity] = useState<Vendor | null>(null);
  const [vendorActivities, setVendorActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  const { showDialog } = useDialog();

  useEffect(() => {
    const fetchLatestActivities = async () => {
      if (vendors.length === 0) return;
      
      try {
        const { data, error } = await supabase
          .from('vendor_activities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500); // Fetch a reasonable amount to find latest per vendor
          
        if (error) throw error;
        
        if (data) {
          const latest: Record<string, any> = {};
          data.forEach(act => {
            if (!latest[act.vendor_id]) {
              latest[act.vendor_id] = act;
            }
          });
          setLatestActivities(latest);
        }
      } catch (err) {
        console.error("Error fetching latest activities:", err);
      }
    };
    
    fetchLatestActivities();
  }, [vendors]);

  const openActivityModal = async (vendor: Vendor) => {
    setSelectedVendorForActivity(vendor);
    setIsActivityModalOpen(true);
    setLoadingActivities(true);
    
    try {
      const { data, error } = await supabase
        .from('vendor_activities')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (error) throw error;
      if (data) {
        setVendorActivities(data);
      }
    } catch (err: any) {
      console.error("Error fetching vendor activities:", err);
      await showDialog('alert', 'Error', `Failed to load activities: ${err.message}`);
    } finally {
      setLoadingActivities(false);
    }
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

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncUsers = async () => {
    try {
      setIsSyncing(true);
      const { error } = await supabase.rpc('sync_missing_vendors');
      if (error) throw error;
      
      await showDialog('alert', 'Success', 'Missing users have been synced to the vendor list. Please refresh the page to see them.');
      window.location.reload();
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to sync users: ${err.message}\n\nNote: You may need to run the SQL command in the yellow warning box at the top of the page to enable this feature.`);
    } finally {
      setIsSyncing(false);
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

  const getRemainingTime = (v: Vendor) => {
    if (!v.unlimited_seconds_left) return 0;
    if (!v.is_timer_running || !v.timer_last_started_at) return v.unlimited_seconds_left;
    
    const elapsed = Math.floor((Date.now() - new Date(v.timer_last_started_at).getTime()) / 1000);
    return Math.max(0, v.unlimited_seconds_left - elapsed);
  };

  const filteredVendors = vendors.filter(v => 
    (v.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.company_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
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
              onClick={handleSyncUsers}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Users
            </button>
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
                <th className="pb-3 pt-2 px-2 font-bold border-b border-white/10">Last Activity</th>
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
                  <td className="py-3 px-2 align-top max-w-[150px]">
                    <button 
                      onClick={() => openActivityModal(v)}
                      className="text-left group/act flex flex-col gap-1 w-full hover:bg-white/5 p-1.5 -ml-1.5 rounded transition-colors"
                    >
                      {v.last_login_at ? (
                        <span className="text-[10px] text-gray-400 group-hover/act:text-white transition-colors">
                          Login: {new Date(v.last_login_at).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-600">No login record</span>
                      )}
                      {latestActivities[v.id] && (
                        <span className="text-[11px] text-[#bc13fe] truncate w-full" title={latestActivities[v.id].action}>
                          {latestActivities[v.id].action}
                        </span>
                      )}
                    </button>
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
                                onClick={() => { window.open(`/dashboard?vendorId=${v.id}`, '_blank'); setOpenActionMenuId(null); }} 
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
                  <td colSpan={10} className="py-12 text-center text-gray-500 italic">No vendors found matching your search</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Log Modal */}
      {isActivityModalOpen && selectedVendorForActivity && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#111] z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#bc13fe]" />
                Activity Log: {selectedVendorForActivity.name || selectedVendorForActivity.email}
              </h2>
              <button onClick={() => setIsActivityModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {loadingActivities ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#bc13fe]" />
                </div>
              ) : vendorActivities.length > 0 ? (
                <div className="space-y-4">
                  {vendorActivities.map(act => (
                    <div key={act.id} className="bg-black/30 border border-white/5 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-white text-sm">{act.action}</span>
                        <span className="text-xs text-gray-500">{new Date(act.created_at).toLocaleString()}</span>
                      </div>
                      {act.details && Object.keys(act.details).length > 0 && (
                        <pre className="text-[10px] text-gray-400 bg-black/50 p-3 rounded-lg overflow-x-auto mt-2 border border-white/5">
                          {JSON.stringify(act.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 italic">
                  No activities recorded for this vendor.
                </div>
              )}
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
