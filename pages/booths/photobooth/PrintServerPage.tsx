import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { printImage } from '../../../lib/printUtils';

const PrintServerPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [status, setStatus] = useState<'idle' | 'printing'>('idle');
  const [lastPrintTime, setLastPrintTime] = useState<string | null>(null);
  const [printQueue, setPrintQueue] = useState<string[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;

    // Subscribe to print commands via Supabase Broadcast
    const channel = supabase.channel(`print_server_${eventId}`);

    channel.on('broadcast', { event: 'print_job' }, (payload) => {
      const { imageUrl } = payload.payload;
      if (imageUrl) {
        setPrintQueue(prev => [...prev, imageUrl]);
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Print Server connected and listening for print jobs.');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // Process Print Queue
  useEffect(() => {
    if (status === 'idle' && printQueue.length > 0) {
      const nextImage = printQueue[0];
      setPrintQueue(prev => prev.slice(1));
      processPrintJob(nextImage);
    }
  }, [printQueue, status]);

  const processPrintJob = async (imageUrl: string) => {
    setStatus('printing');
    setCurrentImage(imageUrl);
    
    try {
      // Wait a moment for the image to render in the DOM if needed, 
      // but printImage utility creates an iframe and loads it.
      // We will just call printImage.
      printImage(imageUrl);
      
      setLastPrintTime(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Print failed:", error);
    } finally {
      // Small delay before accepting next job to prevent browser freeze
      setTimeout(() => {
        setStatus('idle');
        setCurrentImage(null);
      }, 3000); 
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-mono">
      <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl">
        <div className="w-20 h-20 bg-cyan-900/30 rounded-full flex items-center justify-center mb-6 border border-cyan-500/30">
          <svg className={`w-10 h-10 text-cyan-400 ${status === 'printing' ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold tracking-widest uppercase text-cyan-300 mb-2">Print Server</h1>
        <p className="text-gray-400 text-sm mb-8">
          Leave this page open. It will automatically print photos sent from the photobooth.
        </p>

        <div className="w-full bg-black/50 rounded-lg p-4 border border-white/5 flex flex-col gap-3 text-left">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-gray-500 text-xs uppercase">Status</span>
            <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${status === 'printing' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
              {status === 'printing' ? 'Printing...' : 'Standby'}
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-gray-500 text-xs uppercase">Queue</span>
            <span className="text-white font-bold">{printQueue.length} jobs</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-xs uppercase">Last Print</span>
            <span className="text-white">{lastPrintTime || '-'}</span>
          </div>
        </div>

        {currentImage && (
          <div className="mt-6 w-32 h-32 rounded-lg overflow-hidden border border-white/10 opacity-50">
            <img src={currentImage} alt="Printing" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintServerPage;
