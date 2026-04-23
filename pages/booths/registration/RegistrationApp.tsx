import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { PhotoboothSettings } from '../../../types';
import { DEFAULT_SETTINGS } from '../../../constants';
import CheckinPage from '../../CheckinPage';

const RegistrationApp: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PhotoboothSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        if (!eventId) return;
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .single();
        
        if (error) throw error;
        if (data) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data.settings,
            eventName: data.name,
            activeEventId: data.id,
            eventType: data.event_type || 'registration'
          });
        }
      } catch (err) {
        console.error("Failed to load registration settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [eventId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-green-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <CheckinPage 
      settings={settings}
      onExit={() => navigate(`/admin/${eventId}/registration`)}
    />
  );
};

export default RegistrationApp;
