
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Concept, PhotoboothSettings } from '../../../../types';
import { DEFAULT_GAS_URL } from '../../../../constants';

import AdminSettingsTab, { AdminSettingsTabRef } from './AdminSettingsTab';
import AdminConceptsTab, { AdminConceptsTabRef } from './AdminConceptsTab';
import AdminMonitorTab from './AdminMonitorTab';
import { useDialog } from '../../../../components/DialogProvider';

interface AdminPageProps {
  settings: PhotoboothSettings;
  concepts: Concept[];
  onSaveSettings: (settings: PhotoboothSettings) => void;
  onSaveConcepts: (concepts: Concept[]) => void;
  onBack: () => void;
  onLaunchMonitor?: () => void;
  initialTab?: 'settings' | 'concepts';
}

const AdminPage: React.FC<AdminPageProps> = ({ settings, concepts, onSaveSettings, onSaveConcepts, onBack, onLaunchMonitor, initialTab: propInitialTab }) => {
  const [gasUrl, setGasUrl] = useState('');
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const urlTab = queryParams.get('tab') === 'concept' ? 'concepts' : 'settings';
  const initialTab = propInitialTab || urlTab;
  const [activeTab, setActiveTab] = useState<'settings' | 'concepts'>(initialTab);
  const { showDialog } = useDialog();
  const adminSettingsRef = useRef<AdminSettingsTabRef>(null);
  const adminConceptsRef = useRef<AdminConceptsTabRef>(null);

  // Initialize GAS URL
  useEffect(() => {
    const savedUrl = localStorage.getItem('APPS_SCRIPT_BASE_URL') || DEFAULT_GAS_URL;
    setGasUrl(savedUrl);
  }, []);

  const handleTabChange = async (newTab: 'settings' | 'concepts') => {
    if (newTab === activeTab) return;

    const settingsDirty = activeTab === 'settings' && (adminSettingsRef.current?.hasUnsavedChanges?.() || false);
    const conceptsDirty = activeTab === 'concepts' && (adminConceptsRef.current?.hasUnsavedChanges?.() || false);

    if (settingsDirty || conceptsDirty) {
      const confirm = await showDialog(
        'confirm', 
        'Unsaved Changes', 
        'Anda memiliki perubahan yang belum disimpan di tab ini. Apakah Anda yakin ingin pindah tab tanpa menyimpan?'
      );
      if (confirm) {
        setActiveTab(newTab);
      }
    } else {
      setActiveTab(newTab);
    }
  };

  const handleBack = async () => {
    const settingsDirty = adminSettingsRef.current?.hasUnsavedChanges?.() || false;
    const conceptsDirty = adminConceptsRef.current?.hasUnsavedChanges?.() || false;

    if (settingsDirty || conceptsDirty) {
      const confirm = await showDialog(
        'confirm', 
        'Unsaved Changes', 
        'Anda memiliki perubahan yang belum disimpan. Apakah Anda yakin ingin meninggalkan halaman ini tanpa menyimpan?'
      );
      if (confirm) {
        onBack();
      }
    } else {
      onBack();
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col bg-transparent">
      <div className="sticky top-0 z-50 flex flex-col md:flex-row justify-between items-center mb-10 w-full border-b border-white/10 bg-black/90 backdrop-blur-md px-6 py-4 md:px-10 shadow-2xl">
        <h2 className="text-xl md:text-2xl font-heading text-white neon-text italic uppercase">SYSTEM_ROOT</h2>
        <div className="flex bg-white/5 p-1 rounded-xl my-4 md:my-0">
          {(['settings', 'concepts'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-4 md:px-6 py-2 rounded-lg text-[10px] font-bold tracking-[0.3em] uppercase transition-all ${activeTab === tab ? 'bg-[#bc13fe] text-white shadow-xl shadow-[#bc13fe]/40' : 'text-gray-500 hover:text-white'} ${tab === 'concepts' ? 'tour-concept-tab' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {activeTab === 'settings' && (
            <button 
              onClick={() => adminSettingsRef.current?.saveSettings()} 
              className="px-6 py-3 bg-green-800 hover:bg-green-700 text-white font-heading tracking-widest uppercase italic transition-all rounded-lg shadow-xl text-xs tour-save-settings"
            >
              SAVE SETTINGS
            </button>
          )}
          {activeTab === 'concepts' && (
            <button 
              onClick={() => adminConceptsRef.current?.saveConcepts()} 
              className="px-6 py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white font-heading tracking-widest uppercase italic transition-all rounded-lg shadow-xl text-xs tour-save-concept"
            >
              SAVE CONCEPT
            </button>
          )}
          <button onClick={handleBack} className="px-6 py-3 border-2 border-white/10 text-white uppercase tracking-widest text-xs italic hover:bg-white/5 rounded-lg transition-colors tour-back-btn">Back</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-6 md:px-10 pb-24">
        {/* Launch Monitor Button Area */}
        <AdminMonitorTab 
          onLaunchMonitor={onLaunchMonitor} 
        />

        {activeTab === 'settings' && (
          <AdminSettingsTab 
            ref={adminSettingsRef}
            settings={settings} 
            onSaveSettings={onSaveSettings} 
            gasUrl={gasUrl}
          />
        )}

        {/* Concepts Tab */}
        {activeTab === 'concepts' && (
          <AdminConceptsTab 
            ref={adminConceptsRef}
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
