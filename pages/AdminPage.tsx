
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
  const [gasUrl, setGasUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'concepts'>('settings');
  const { showDialog } = useDialog();

  // Initialize GAS URL
  useEffect(() => {
    const savedUrl = localStorage.getItem('APPS_SCRIPT_BASE_URL') || DEFAULT_GAS_URL;
    setGasUrl(savedUrl);
  }, []);

  return (
    <div className="w-full min-h-screen flex flex-col p-6 md:p-10 bg-transparent overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 max-w-7xl mx-auto w-full border-b border-white/5 pb-10 gap-8 bg-black/40 backdrop-blur-md p-6 rounded-xl">
        <h2 className="text-2xl font-heading text-white neon-text italic uppercase">SYSTEM_ROOT</h2>
        <div className="flex bg-white/5 p-1 rounded-xl">
          {(['settings', 'concepts'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg text-[10px] font-bold tracking-[0.3em] uppercase transition-all ${activeTab === tab ? 'bg-[#bc13fe] text-white shadow-xl shadow-[#bc13fe]/40' : 'text-gray-500 hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button onClick={onBack} className="px-10 py-4 border-2 border-white/10 text-white uppercase tracking-widest text-xs italic hover:bg-white/5 rounded-lg transition-colors">Back</button>
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
            settings={settings}
          />
        )}
      </div>
    </div>
  );
};

export default AdminPage;
