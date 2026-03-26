import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, LogOut, Plus, Settings, Play, Image as ImageIcon, Video, Coins } from 'lucide-react';
import { Vendor, Event } from '../types';

export default function VendorDashboard() {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate('/login');
          return;
        }

        // Fetch Vendor Profile
        const { data: vendorData, error: vendorError } = await supabase
          .from('vendors')
          .select('*')
          .eq('id', user.id)
          .single();

        if (vendorError) {
          if (vendorError.code === 'PGRST116') {
            // Vendor doesn't exist, create it
            const newVendor = {
              id: user.id,
              email: user.email || '',
              name: user.user_metadata?.full_name || 'Vendor'
            };
            const { data: createdVendor, error: createError } = await supabase
              .from('vendors')
              .insert([newVendor])
              .select()
              .single();
              
            if (createError) {
              console.error("Error creating vendor:", createError);
              setErrorMsg(`Warning: Could not create your vendor profile in the database (${createError.message}). You may not be able to create events.`);
              setVendor({ ...newVendor, created_at: new Date().toISOString() } as any);
            } else {
              setVendor(createdVendor);
            }
          } else {
            console.error("Error fetching vendor:", vendorError);
            setVendor({
              id: user.id,
              email: user.email || '',
              name: user.user_metadata?.full_name || 'Vendor',
              plan: 'free',
              credits: 100,
              created_at: new Date().toISOString()
            });
          }
        } else {
          setVendor(vendorData);
        }

        // Fetch Events
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .eq('vendor_id', user.id)
          .order('created_at', { ascending: false });

        if (eventsError) {
          console.error("Error fetching events:", eventsError);
        } else {
          setEvents(eventsData || []);
        }
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    if (!newEventName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('events')
        .insert([
          {
            vendor_id: vendor.id,
            name: newEventName.trim()
          }
        ])
        .select();

      if (error) throw error;
      if (data) {
        setEvents([data[0], ...events]);
        setShowCreateModal(false);
        setNewEventName('');
      }
    } catch (err: any) {
      console.error("Failed to create event:", err);
      setErrorMsg(`Failed to create event: ${err.message || 'Unknown error'}. Please ensure your Supabase tables and policies are correctly set up.`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin text-[#bc13fe]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold neon-text mb-1">VENDOR DASHBOARD</h1>
            <p className="text-gray-400">Welcome back, {vendor?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            {vendor?.email === 'coroaiphotobooth@gmail.com' && (
              <button
                onClick={() => navigate('/superadmin')}
                className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-full font-bold transition-all text-sm"
              >
                Super Admin
              </button>
            )}
            <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2 border border-[#bc13fe]/30">
              <Coins className="w-4 h-4 text-[#bc13fe]" />
              <span className="font-bold">{vendor?.credits} Credits</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats / Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">Total Events</h3>
            <p className="text-4xl font-bold">{events.length}</p>
          </div>
          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">Current Plan</h3>
            <p className="text-4xl font-bold capitalize text-[#bc13fe]">{vendor?.plan}</p>
          </div>
          <div className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#bc13fe]/10 to-transparent flex flex-col">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">Available Credits</h3>
            <p className="text-4xl font-bold">{vendor?.credits}</p>
            <div className="mt-auto pt-4 flex items-center justify-between">
              <p className="text-xs text-gray-500">1 Credit = 1 AI Generation</p>
              <button 
                onClick={() => alert("Payment gateway integration coming soon! (Stripe/Xendit)")}
                className="text-xs bg-[#bc13fe] hover:bg-[#a010d8] text-white px-3 py-1.5 rounded-md font-bold transition-colors"
              >
                BUY CREDITS
              </button>
            </div>
          </div>
        </div>

        {/* Events List */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-heading font-bold">Your Events</h2>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            CREATE EVENT
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.length === 0 ? (
            <div className="col-span-full glass-card p-10 rounded-2xl border border-white/10 text-center text-gray-500 flex flex-col items-center justify-center">
              <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
              <p>No events found. Create your first photobooth event!</p>
            </div>
          ) : (
            events.map(event => (
              <div key={event.id} className="glass-card p-6 rounded-2xl border border-white/10 flex flex-col gap-4 hover:border-[#bc13fe]/50 transition-colors group">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg mb-1">{event.name}</h3>
                    <p className="text-xs text-gray-400">{event.date ? new Date(event.date).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${event.is_active !== false ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-gray-600'}`} title={event.is_active !== false ? 'Active' : 'Inactive'} />
                </div>
                
                <p className="text-sm text-gray-400 line-clamp-2">{event.description || 'New Photobooth Event'}</p>
                
                <div className="mt-auto pt-4 border-t border-white/10 flex gap-2">
                  <button 
                    onClick={() => navigate(`/app/${event.id}`)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-3 h-3" />
                    LAUNCH
                  </button>
                  <button 
                    onClick={() => navigate(`/admin/${event.id}`)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Settings className="w-3 h-3" />
                    SETTINGS
                  </button>
                  <button 
                    onClick={() => navigate(`/app/${event.id}?page=gallery`)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <ImageIcon className="w-3 h-3" />
                    GALLERY
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-white/10 p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Event</h2>
            <form onSubmit={handleCreateEvent}>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Event Name</label>
                <input
                  type="text"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                  placeholder="e.g., John & Jane Wedding"
                  autoFocus
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-sm font-bold transition-colors"
                >
                  CREATE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMsg && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-red-500/30 p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-400">Error</h2>
            <p className="text-gray-300 mb-6 text-sm">{errorMsg}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setErrorMsg(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
