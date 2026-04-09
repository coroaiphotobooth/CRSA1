import React from 'react';

interface AdminMonitorTabProps {
  onLaunchMonitor?: () => void;
  onLaunchPrintServer?: () => void;
  showPrintServer?: boolean;
}

const AdminMonitorTab: React.FC<AdminMonitorTabProps> = ({ onLaunchMonitor, onLaunchPrintServer, showPrintServer }) => {
  if (!onLaunchMonitor && !onLaunchPrintServer) return null;

  return (
    <div className="flex justify-end mb-8 gap-4">
       {onLaunchPrintServer && showPrintServer && (
         <button 
           onClick={onLaunchPrintServer} 
           className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-cyan-900 to-teal-900 border border-cyan-500/30 hover:border-cyan-400 text-cyan-200 font-heading tracking-[0.2em] uppercase rounded-lg shadow-lg hover:shadow-cyan-500/20 transition-all backdrop-blur-md"
         >
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
           OPEN PRINT SERVER
         </button>
       )}
       {onLaunchMonitor && (
         <button 
           onClick={onLaunchMonitor} 
           className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-900 to-purple-900 border border-blue-500/30 hover:border-blue-400 text-blue-200 font-heading tracking-[0.2em] uppercase rounded-lg shadow-lg hover:shadow-blue-500/20 transition-all backdrop-blur-md"
         >
           <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
           LAUNCH LIVE MONITOR
         </button>
       )}
    </div>
  );
};

export default AdminMonitorTab;
