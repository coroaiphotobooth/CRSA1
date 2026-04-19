import React, { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { PhotoboothSettings } from '../../../../types';
import { useDialog } from '../../../../components/DialogProvider';
import { Upload, Users, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../../../../lib/supabase';

interface AdminVipTabProps {
  settings: PhotoboothSettings;
  onSaveSettings: (settings: PhotoboothSettings) => void;
}

export interface AdminVipTabRef {
  saveVipSettings: () => Promise<void>;
  hasUnsavedChanges: () => boolean;
}

const AdminVipTab = forwardRef<AdminVipTabRef, AdminVipTabProps>(({ settings, onSaveSettings }, ref) => {
  const [localSettings, setLocalSettings] = useState<PhotoboothSettings>(settings);
  const [isDirty, setIsDirty] = useState(false);
  const { showDialog } = useDialog();
  const [isParsing, setIsParsing] = useState(false);
  
  // Realtime Status Tracking
  const [completedKodes, setCompletedKodes] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCompletedSessions = async () => {
    if (!settings.activeEventId) return;
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('guest_name')
        .eq('event_id', settings.activeEventId)
        .like('guest_name', 'VIP_%');
        
      if (!error && data) {
        const kodes = new Set<string>();
        data.forEach(row => {
          if (row.guest_name) {
            // guest_name format: VIP_kode_name
            const parts = row.guest_name.split('_');
            if (parts.length >= 3) {
              kodes.add(parts[1]); 
            }
          }
        });
        setCompletedKodes(kodes);
      }
    } catch (e) {
      console.error("Failed to fetch VIP sessions", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCompletedSessions();
  }, [settings.activeEventId]);

  useImperativeHandle(ref, () => ({
    saveVipSettings: async () => {
      onSaveSettings(localSettings);
      setIsDirty(false);
      showDialog('alert', 'Success', 'VIP Settings saved securely to Supabase settings.');
    },
    hasUnsavedChanges: () => isDirty
  }));

  const handleChange = (field: keyof PhotoboothSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedGuests = results.data.map((row: any) => ({
          firstName: row['First Name'] || row['first name'] || '',
          lastName: row['Last Name'] || row['last name'] || '',
          email: row['Email'] || row['email'] || '',
          phone: row['Phone'] || row['phone'] || '',
          company: row['Company'] || row['company'] || '',
          jobTitle: row['Job Title'] || row['job title'] || '',
          kode: row['kode'] || row['Kode'] || '',
          statusFoto: row['Status foto'] || row['status foto'] || 'belum'
        }));

        const validGuests = parsedGuests.filter(g => g.kode); // Only keep rows with proper 'kode'
        
        handleChange('vipGuests', validGuests);
        setIsParsing(false);
        showDialog('alert', 'Import Success', `Successfully loaded ${validGuests.length} VIP guests from CSV.`);
      },
      error: (err) => {
        setIsParsing(false);
        showDialog('alert', 'Import Failed', `Failed to parse CSV: ${err.message}`);
      }
    });
  };

  const vipGuests = localSettings.vipGuests || [];
  
  // Combine original CSV status with Supabase dynamic status
  const getIsCompleted = (guest: any) => {
    return guest.statusFoto?.toLowerCase().includes('sudah') || completedKodes.has(guest.kode);
  };

  const completedCount = vipGuests.filter(getIsCompleted).length;

  const handleExport = () => {
    if (!vipGuests || vipGuests.length === 0) {
      showDialog('alert', 'Export Failed', 'No guests to export.');
      return;
    }

    const csvData = vipGuests.map(g => ({
      'First Name': g.firstName,
      'Last Name': g.lastName,
      'Email': g.email,
      'Phone': g.phone,
      'Company': g.company,
      'Job Title': g.jobTitle,
      'Kode': g.kode,
      'Status foto': getIsCompleted(g) ? 'sudah' : 'belum'
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.href = url;
    link.download = `VIP_Report_${settings.eventName || 'Photobooth'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="p-6 md:p-8 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden backdrop-blur-sm">
        <h3 className="text-xl font-heading text-white italic mb-2 tracking-wide uppercase flex items-center justify-between">
          <span>VIP Access Mode</span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-sans not-italic text-gray-400">Enable VIP ID Login Screen</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={localSettings.enableVipMode || false}
                onChange={(e) => handleChange('enableVipMode', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#bc13fe]"></div>
            </label>
          </div>
        </h3>
        <p className="text-sm text-gray-400 mb-8 max-w-2xl">
          Upload a CSV file containing your VIP guests. Required columns: "First Name" and "kode". 
          This is a temporary feature mapped directly to this event setting.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="block w-full cursor-pointer">
              <div className="w-full h-32 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center hover:border-[#bc13fe] hover:bg-white/5 transition-all group">
                <Upload className="w-8 h-8 text-gray-400 group-hover:text-[#bc13fe] mb-2" />
                <span className="text-sm font-bold text-gray-300">Click to Upload VIP CSV</span>
                <span className="text-xs text-gray-500 mt-1">.csv format only</span>
              </div>
              <input 
                type="file" 
                accept=".csv"
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isParsing}
              />
            </label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/50 p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white mb-1">{vipGuests.length}</span>
                <span className="text-xs text-gray-400 uppercase tracking-widest text-center">Total Guests</span>
              </div>
              <div className="bg-black/50 p-4 rounded-xl border border-[#bc13fe]/30 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[#bc13fe] mb-1">{completedCount}</span>
                <span className="text-xs text-gray-400 uppercase tracking-widest text-center">Completed</span>
              </div>
            </div>
          </div>

          <div className="bg-black/50 border border-white/10 rounded-xl p-4 h-64 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4 sticky top-0 bg-black/80 backdrop-blur pb-2 z-10 border-b border-white/5">
              <h4 className="font-bold text-white uppercase text-xs tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4 text-[#bc13fe]" /> VIP Guest List
              </h4>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleExport} 
                  className="text-xs text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors font-bold uppercase tracking-widest"
                >
                  Export CSV
                </button>
                <button 
                  onClick={fetchCompletedSessions} 
                  disabled={isRefreshing}
                  className="text-[#bc13fe] hover:text-[#a010d8] transition-colors p-1"
                  title="Refresh Live Status"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            
            {vipGuests.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                No guests imported yet.
              </div>
            ) : (
              <div className="space-y-2">
                {vipGuests.map((guest, idx) => {
                  const isCompleted = getIsCompleted(guest);
                  return (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{guest.firstName} {guest.lastName}</span>
                        <span className="text-xs text-gray-500 font-mono">{guest.kode}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCompleted ? (
                          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-md">
                            <CheckCircle className="w-3 h-3" /> Done
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-md">
                            <Clock className="w-3 h-3" /> Waiting
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default AdminVipTab;
