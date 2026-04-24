import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { PhotoboothSettings } from '../../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, UserCheck, Maximize, Clock, ArrowLeft, Activity, List, X, Search } from 'lucide-react';

interface ArrivalData {
  id: string;
  name: string;
  table: string;
  pax: string;
  timestamp: string;
  status?: string;
}

const RegistrationMonitor: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PhotoboothSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [arrivals, setArrivals] = useState<ArrivalData[]>([]);
  const [allGuests, setAllGuests] = useState<ArrivalData[]>([]);
  const [totalCheckedIn, setTotalCheckedIn] = useState(0);
  const [totalInvited, setTotalInvited] = useState(0);
  const [lastCheckedIn, setLastCheckedIn] = useState<ArrivalData | null>(null);
  const [showAllDataModal, setShowAllDataModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isFullScreen = useRef(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        if (!eventId) return;
        const { data, error } = await supabase
          .from('events')
          .select('settings')
          .eq('id', eventId)
          .single();
        
        if (error) throw error;
        if (data) {
          setSettings(data.settings);
        }
      } catch (err) {
        console.error("Failed to load registration settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [eventId]);

  useEffect(() => {
    let mounted = true;
    const fetchLiveArrivals = async () => {
      try {
        let scriptUrl = "https://script.google.com/macros/s/AKfycbwWZV9VV6W1njqvju2yTGAcfjEEt9YwsI3_57FX3RTCFmwGNiYtGbRFTI7PttRCc7R6/exec";
        if (settings?.vipAppsScriptUrl && settings.vipAppsScriptUrl.includes('AKfycbwWZV9VV6W1njqvju2yTGAcfjEEt9YwsI3_57FX3RTCFmwGNiYtGbRFTI7PttRCc7R6')) {
           scriptUrl = settings.vipAppsScriptUrl;
        }
        
        const res = await fetch(`${scriptUrl}?action=getRecent&t=${Date.now()}`);
        console.log("Monitor Fetch Status:", res.status);
        if (!res.ok) return;
        
        const json = await res.json();
        console.log("Monitor Fetch JSON:", json);
        if (mounted && (json.result === 'success' || json.success === true) && Array.isArray(json.data)) {
          setArrivals(prev => {
            const newData = json.data.slice(0, 50); 
            if (newData.length > 0 && (!prev.length || newData[0].id !== prev[0].id)) {
              setLastCheckedIn(newData[0]);
              setTimeout(() => {
                if (mounted) setLastCheckedIn(null);
              }, 10000);
            }
            return newData;
          });
          if (json.allData && Array.isArray(json.allData)) {
            setAllGuests(json.allData);
          }
          if (json.totalCount !== undefined) {
            setTotalCheckedIn(json.totalCount);
          } else {
            setTotalCheckedIn(json.data.length);
          }
          if (json.totalInvited !== undefined) {
            setTotalInvited(json.totalInvited);
          }
        }
      } catch (err) {
        console.warn("Live monitoring fetch issue:", err);
      }
    };

    fetchLiveArrivals();
    const interval = setInterval(fetchLiveArrivals, 5000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [settings?.vipAppsScriptUrl]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
      isFullScreen.current = true;
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        isFullScreen.current = false;
      }
    }
  };

  const filteredGuests = useMemo(() => {
    if (!searchQuery) return allGuests;
    return allGuests.filter(g => 
      g.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      g.id?.toString().toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allGuests, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-green-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-green-500/10 blur-[120px] rounded-full mix-blend-screen" />
         <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <div className="absolute top-6 left-6 z-50 flex gap-4">
         <button onClick={() => navigate('/dashboard')} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-colors border border-white/20">
            <ArrowLeft className="w-4 h-4" />
         </button>
      </div>
      
      <div className="absolute top-6 right-6 z-50 flex gap-4">
         <button onClick={() => setShowAllDataModal(true)} className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 rounded-full flex items-center justify-center text-green-400 backdrop-blur-md transition-colors border border-green-500/30 text-xs font-bold uppercase tracking-widest gap-2">
            <List className="w-4 h-4" /> Lihat Semua Data
         </button>
         <button onClick={toggleFullScreen} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-colors border border-white/20 text-xs font-bold uppercase tracking-widest gap-2">
            <Maximize className="w-4 h-4" /> Fullscreen
         </button>
      </div>

      <div className="relative z-10 w-full h-screen flex flex-col p-8">
        <div className="flex flex-col items-center mb-12 mt-4">
          <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tight mb-4 text-center">
             Live <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">Arrivals</span>
          </h1>
          <div className="flex items-center gap-2 text-green-400/80 mb-2 border border-green-500/20 px-4 py-1.5 rounded-full bg-green-500/10">
             <Activity className="w-4 h-4 animate-pulse" />
             <span className="text-xs uppercase tracking-widest font-bold">Real-time Analytics</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto w-full">
          
          <div className="col-span-1 lg:col-span-2 flex flex-col gap-8">
            <div className="grid grid-cols-2 gap-8">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm flex flex-col items-center justify-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <Users className="w-12 h-12 text-gray-500 mb-6" />
                  <span className="text-6xl font-black mb-2">{totalCheckedIn}{totalInvited > 0 ? <span className="text-2xl text-gray-500 font-medium"> / {totalInvited}</span> : ''}</span>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Total Checked In</span>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm flex flex-col items-center justify-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <UserCheck className="w-12 h-12 text-green-400 mb-6" />
                  <span className="text-sm font-bold text-green-400 uppercase tracking-widest mb-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/30">System Active</span>
                  <span className="text-xs font-medium text-gray-500 text-center mt-2 max-w-[200px]">Polling Apps Script for real-time guest arrivals</span>
                </div>
            </div>

            <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm relative overflow-hidden flex items-center justify-center min-h-[300px]">
              <AnimatePresence mode="wait">
                {lastCheckedIn ? (
                  <motion.div 
                    key={lastCheckedIn.id}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    className="text-center"
                  >
                    <div className="inline-block px-4 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold uppercase tracking-widest mb-6 animate-pulse">
                      Tamu Baru Login (New Arrival)
                    </div>
                    <h2 className="text-5xl lg:text-7xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70">
                      {lastCheckedIn.name}
                    </h2>
                    <div className="flex items-center justify-center gap-6 mt-6">
                      {lastCheckedIn.table && (
                        <div className="text-xl text-gray-400 font-mono">
                          Table: <span className="text-white font-bold">{lastCheckedIn.table}</span>
                        </div>
                      )}
                      {lastCheckedIn.pax && (
                        <div className="text-xl text-gray-400 font-mono">
                          Pax: <span className="text-white font-bold">{lastCheckedIn.pax}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="waiting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center flex flex-col items-center"
                  >
                     <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-green-500 animate-spin mb-6" />
                     <p className="text-gray-500 text-sm uppercase tracking-widest font-bold">Waiting for next arrival...</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="col-span-1 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-sm flex flex-col max-h-[80vh]">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center justify-between">
              <span>Tamu Sudah Login</span>
              <Clock className="w-4 h-4 text-gray-500" />
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              <AnimatePresence>
                {arrivals.length > 0 ? (
                  arrivals.map((arrival, index) => (
                    <motion.div 
                      key={`${arrival.id}-${index}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-black/40 border border-white/5 rounded-2xl p-4 hover:border-white/20 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-white line-clamp-1">{arrival.name}</span>
                        {arrival.timestamp && (
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider whitespace-nowrap ml-2">
                             {arrival.timestamp}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs font-mono text-gray-400">
                        {arrival.table && <span>Table {arrival.table}</span>}
                        {arrival.pax && <span>{arrival.pax} Pax</span>}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-500 italic text-sm">
                    No recent arrivals recorded yet. (Or invalid Apps Script endpoint).
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </div>

      {showAllDataModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
           <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-5xl md:h-[80vh] h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
           >
              <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                 <h2 className="text-xl md:text-2xl font-bold uppercase tracking-widest text-green-400">Semua Data Rekap</h2>
                 <button onClick={() => setShowAllDataModal(false)} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                    <X className="w-5 h-5" />
                 </button>
              </div>
              <div className="p-6 md:p-8 flex-1 overflow-auto bg-black/20 custom-scrollbar">
                 <div className="mb-6 flex gap-4">
                    <div className="relative flex-1 max-w-md">
                       <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                       <input 
                         type="text"
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         placeholder="Cari nama atau kode tamu..."
                         className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:border-green-500 focus:bg-green-500/5 transition-all outline-none"
                       />
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-6 rounded-xl flex items-center justify-center font-bold text-sm tracking-widest">
                       {filteredGuests.filter(g => String(g.status).toLowerCase().includes('sudah')).length} / {filteredGuests.length} HADIR
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredGuests.map((guest, idx) => {
                       const isAttended = String(guest.status).toLowerCase().includes('sudah');
                       return (
                          <div key={`${guest.id}-${idx}`} className={`p-5 rounded-2xl border transition-all ${isAttended ? 'bg-green-500/5 border-green-500/30 hover:border-green-500/60' : 'bg-white/5 border-white/10 hover:border-white/30'}`}>
                             <div className="flex items-start justify-between mb-3">
                                <div>
                                   <div className="text-[10px] text-gray-500 font-mono mb-1">ID: {guest.id}</div>
                                   <div className="font-bold text-lg text-white leading-tight">{guest.name}</div>
                                </div>
                                {isAttended ? (
                                   <div className="px-2 py-1 bg-green-500/20 text-green-400 text-[9px] uppercase tracking-widest font-bold rounded">
                                      Hadir
                                   </div>
                                ) : (
                                   <div className="px-2 py-1 bg-gray-500/20 text-gray-400 text-[9px] uppercase tracking-widest font-bold rounded">
                                      Belum
                                   </div>
                                )}
                             </div>
                             {(guest.table || guest.pax) && (
                                <div className="flex gap-4 text-xs font-mono text-gray-400 border-t border-white/5 pt-3 mt-1">
                                   {guest.table && <span>Table: <span className="text-white">{guest.table}</span></span>}
                                   {guest.pax && <span>Pax: <span className="text-white">{guest.pax}</span></span>}
                                </div>
                             )}
                             {isAttended && guest.timestamp && (
                                <div className="text-[10px] text-green-500/70 mt-2 font-mono flex items-center gap-1 before:content-[''] before:block before:w-1 before:h-1 before:bg-green-500 before:rounded-full">
                                   Check-in: {guest.timestamp}
                                </div>
                             )}
                          </div>
                       )
                    })}
                    {filteredGuests.length === 0 && (
                       <div className="col-span-full p-12 text-center text-gray-500 text-sm">
                          Tidak ada data tamu ditemukan.
                       </div>
                    )}
                 </div>
              </div>
           </motion.div>
        </div>
      )}
    </div>
  );
};

export default RegistrationMonitor;
