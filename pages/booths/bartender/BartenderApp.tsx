import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useLocation, Navigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { PhotoboothSettings } from '../../../types';
import { DEFAULT_SETTINGS } from '../../../constants';
import BartenderLandingPage from './BartenderLandingPage';
import BartenderMenuPage from './BartenderMenuPage';

// Trigger resync
console.log('Bartender App Loaded!');

enum BartenderState {
  LANDING = 'LANDING',
  MENU = 'MENU'
}

const BartenderApp: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [currentPage, setCurrentPage] = useState<BartenderState>(BartenderState.LANDING);
  const [settings, setSettings] = useState<PhotoboothSettings>(DEFAULT_SETTINGS);
  const [guestName, setGuestName] = useState<string>('');
  const [guestKode, setGuestKode] = useState<string>('');
  
  // Load settings for this event (similar to PhotoboothFlow)
  useEffect(() => {
    const loadEventSettings = async () => {
      if (eventId) {
        const { data, error } = await supabase.from('events').select('settings').eq('id', eventId).single();
        if (data && data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }
      }
    };
    loadEventSettings();
  }, [eventId]);

  const handleStart = (name: string, kode: string) => {
    setGuestName(name);
    setGuestKode(kode);
    setCurrentPage(BartenderState.MENU);
  };

  return (
    <div className="w-full min-h-screen bg-black overflow-hidden flex flex-col font-sans text-white">
      {currentPage === BartenderState.LANDING && (
        <BartenderLandingPage 
          onStart={handleStart} 
          settings={settings}
        />
      )}
      {currentPage === BartenderState.MENU && (
        <BartenderMenuPage 
          settings={settings}
          guestName={guestName}
          guestKode={guestKode}
          onBack={() => setCurrentPage(BartenderState.LANDING)}
        />
      )}
    </div>
  );
};

export default BartenderApp;
