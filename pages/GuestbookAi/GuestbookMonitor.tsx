import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';

interface GuestbookEntry {
  id: string;
  guest_name: string;
  guest_message: string;
  result_image_url: string;
  created_at: string;
}

const GuestbookMonitor: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [eventName, setEventName] = useState('Guestbook AI');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  // Fetch initial data and event name
  useEffect(() => {
    if (!eventId) return;

    const loadData = async () => {
      // Get Event Name & Settings
      const { data: eventData } = await supabase
        .from('events')
        .select('name, settings')
        .eq('id', eventId)
        .single();
      
      if (eventData) {
        setEventName(eventData.name);
        if (eventData.settings?.backgroundImage) {
          setBackgroundImage(eventData.settings.backgroundImage);
        }
      }

      // Get Entries
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id, guest_name, guest_message, result_image_url, created_at')
        .eq('event_id', eventId)
        .eq('is_posted_to_wall', true)
        .order('created_at', { ascending: false });

      if (sessionData) {
        setEntries(sessionData);
      }
    };

    loadData();

    // Subscribe to new entries
    const subscription = supabase
      .channel('guestbook_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `event_id=eq.${eventId}`
        },
        (payload) => {
          const newRecord = payload.new as any;
          if (newRecord.is_posted_to_wall) {
            setEntries(prev => {
              // Check if already exists
              if (prev.some(e => e.id === newRecord.id)) return prev;
              
              const newEntry: GuestbookEntry = {
                id: newRecord.id,
                guest_name: newRecord.guest_name,
                guest_message: newRecord.guest_message,
                result_image_url: newRecord.result_image_url,
                created_at: newRecord.created_at
              };
              
              // Add to top and reset index to show it immediately
              setCurrentIndex(0);
              return [newEntry, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [eventId]);

  // Auto-rotate entries
  useEffect(() => {
    if (entries.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % entries.length);
    }, 10000); // Rotate every 10 seconds

    return () => clearInterval(timer);
  }, [entries.length]);

  const currentEntry = entries[currentIndex];
  const joinUrl = `${window.location.origin}/guestbook/${eventId}/guest`;

  return (
    <div 
      className="min-h-screen bg-[#050505] text-white flex overflow-hidden relative"
      style={backgroundImage ? {
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      } : {}}
    >
      {/* Background Effect */}
      {!backgroundImage && (
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#bc13fe]/20 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col z-10 p-8">
        {/* Header */}
        <div className="text-center mb-12 relative">
          <h1 className="text-5xl font-heading font-bold neon-text mb-4">{eventName}</h1>
          <p className="text-2xl text-gray-300">Scan the QR code to leave a message & take an AI photo!</p>
          
          <button 
            onClick={() => navigate(`/admin/${eventId}/guestbook`)}
            className="absolute top-0 right-0 p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
            title="Settings"
          >
            <Settings className="w-6 h-6 text-white/50 hover:text-white" />
          </button>
        </div>

        {/* Display Area */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {currentEntry ? (
              <motion.div
                key={currentEntry.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.1, y: -20 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="flex items-center gap-12 max-w-6xl w-full"
              >
                {/* Photo */}
                <div className="w-1/2 flex justify-end">
                  <div className="relative rounded-3xl overflow-hidden border-8 border-white/10 shadow-2xl shadow-[#bc13fe]/30 aspect-[3/4] max-h-[60vh]">
                    <img 
                      src={currentEntry.result_image_url} 
                      alt="Guest" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* Message */}
                <div className="w-1/2 flex flex-col justify-center">
                  <div className="glass-card p-10 rounded-3xl border border-white/10 relative">
                    <div className="absolute -top-6 -left-6 text-6xl text-[#bc13fe] opacity-50">"</div>
                    <p className="text-4xl leading-relaxed text-white font-medium mb-8 relative z-10">
                      {currentEntry.guest_message}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-1 bg-[#bc13fe] rounded-full" />
                      <h3 className="text-3xl font-bold text-[#bc13fe]">
                        {currentEntry.guest_name}
                      </h3>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-gray-500"
              >
                <h2 className="text-3xl mb-4">Waiting for guests...</h2>
                <p className="text-xl">Scan the QR code to be the first!</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* QR Code Corner */}
      <div className="absolute bottom-8 right-8 z-20 glass-card p-6 rounded-3xl border border-white/10 flex flex-col items-center shadow-2xl">
        <h3 className="text-xl font-bold mb-4 text-center">Join the<br/>Guestbook</h3>
        <div className="bg-white p-4 rounded-2xl mb-4">
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`} 
            alt="Join QR Code"
            className="w-40 h-40"
          />
        </div>
        <p className="text-sm text-gray-400 text-center">Scan to take photo</p>
      </div>
    </div>
  );
};

export default GuestbookMonitor;
