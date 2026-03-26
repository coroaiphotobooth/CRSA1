
import React, { useState, useEffect } from 'react';
import { Concept, PhotoboothSettings } from '../types';
import { DEFAULT_GAS_URL } from '../constants';

import AdminSettingsTab from './AdminSettingsTab';
import AdminConceptsTab from './AdminConceptsTab';
import AdminMonitorTab from './AdminMonitorTab';
import { useDialog } from '../components/DialogProvider';

interface AdminPageProps {
  settings: PhotoboothSettings;
  concepts: Concept[];
  onSaveSettings: (settings: PhotoboothSettings) => void;
  onSaveConcepts: (concepts: Concept[]) => void;
  onBack: () => void;
  onLaunchMonitor?: () => void;
}

const AdminPage: React.FC<AdminPageProps> = ({ settings, concepts, onSaveSettings, onSaveConcepts, onBack, onLaunchMonitor }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [gasUrl, setGasUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'concepts'>('settings');
  const { showDialog } = useDialog();

  // Initialize GAS URL
  useEffect(() => {
    const savedUrl = localStorage.getItem('APPS_SCRIPT_BASE_URL') || DEFAULT_GAS_URL;
    setGasUrl(savedUrl);
  }, []);

  const handleLogin = async () => {
    if (pin === settings.adminPin) {
      setIsAuthenticated(true);
    } else {
      await showDialog('alert', 'Error', 'INVALID SECURITY PIN');
      setPin('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6 bg-transparent">
        <h2 className="text-3xl font-heading mb-10 neon-text italic uppercase drop-shadow-lg">SECURE ACCESS</h2>
        <div className="glass-card p-8 flex flex-col items-center gap-8 w-full max-w-sm backdrop-blur-md bg-black/60">
          <input 
            type="password" 
            placeholder="PIN" 
            className="bg-black/50 border-2 border-white/5 px-6 py-5 text-center text-3xl outline-none focus:border-purple-500 w-full font-mono text-white rounded-lg"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin} className="w-full py-5 bg-purple-600 font-heading tracking-widest uppercase rounded-lg hover:bg-purple-500 transition-colors">AUTHORIZE</button>
          <button onClick={onBack} className="text-gray-400 hover:text-white uppercase text-[10px] tracking-widest transition-colors">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex flex-col p-6 md:p-10 bg-transparent overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 max-w-7xl mx-auto w-full border-b border-white/5 pb-10 gap-8 bg-black/40 backdrop-blur-md p-6 rounded-xl">
        <h2 className="text-2xl font-heading text-white neon-text italic uppercase">SYSTEM_ROOT</h2>
        <div className="flex bg-white/5 p-1 rounded-xl">
          {(['settings', 'concepts'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg text-[10px] font-bold tracking-[0.3em] uppercase transition-all ${activeTab === tab ? 'bg-purple-600 text-white shadow-xl shadow-purple-900/40' : 'text-gray-500 hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="px-10 py-4 border-2 border-red-900/40 text-red-500 uppercase tracking-widest text-xs italic hover:bg-red-900/10 rounded-lg transition-colors">Disconnect</button>
      </div>

      <div className="max-w-7xl mx-auto w-full pb-24">
        {/* Launch Monitor Button Area */}
        <AdminMonitorTab onLaunchMonitor={onLaunchMonitor} />

        {activeTab === 'settings' && (
          <AdminSettingsTab 
            settings={settings} 
            onSaveSettings={onSaveSettings} 
            gasUrl={gasUrl} 
          />
        )}

        {/* Concepts Tab */}
        {activeTab === 'concepts' && (
          <AdminConceptsTab 
            concepts={concepts} 
            onSaveConcepts={onSaveConcepts} 
            adminPin={settings.adminPin} 
          />
        )}
      </div>
    </div>
  );
};

export default AdminPage;
