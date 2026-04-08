import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Send, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface GuestbookResultProps {
  sessionId: string;
  imageUrl: string;
  guestName: string;
  guestMessage: string;
  onPostSuccess: () => void;
}

const GuestbookResult: React.FC<GuestbookResultProps> = ({ 
  sessionId, 
  imageUrl, 
  guestName, 
  guestMessage, 
  onPostSuccess 
}) => {
  const { eventId } = useParams<{ eventId: string }>();
  const [isPosting, setIsPosting] = useState(false);
  const [isPosted, setIsPosted] = useState(false);

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `guestbook-${sessionId}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const handlePostToWall = async () => {
    setIsPosting(true);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          guest_name: guestName,
          guest_message: guestMessage,
          is_posted_to_wall: true
        })
        .eq('id', sessionId);

      if (error) throw error;
      
      // BROADCAST TO MONITOR
      if (eventId) {
        const channel = supabase.channel(`guestbook_updates_${eventId}`);
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.send({
              type: 'broadcast',
              event: 'new_guestbook_entry',
              payload: {
                id: sessionId,
                guest_name: guestName,
                guest_message: guestMessage,
                result_image_url: imageUrl,
                created_at: new Date().toISOString()
              }
            });
            supabase.removeChannel(channel);
          }
        });
      }
      
      setIsPosted(true);
      setTimeout(() => {
        onPostSuccess();
      }, 2000);
    } catch (error) {
      console.error('Error posting to wall:', error);
      alert('Failed to post to social wall. Please try again.');
      setIsPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full aspect-[3/4] rounded-2xl overflow-hidden border-4 border-white/10 shadow-2xl shadow-[#bc13fe]/20 mb-8 relative"
        >
          <img 
            src={imageUrl} 
            alt="Result" 
            className="w-full h-full object-cover"
          />
          {isPosted && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
              <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
              <h3 className="text-xl font-bold text-white">Posted to Wall!</h3>
            </div>
          )}
        </motion.div>

        <div className="w-full flex gap-4">
          <button
            onClick={handleDownload}
            className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-lg transition-all flex flex-col items-center justify-center gap-2"
          >
            <Download className="w-6 h-6" />
            <span className="text-sm">Download</span>
          </button>
          
          <button
            onClick={handlePostToWall}
            disabled={isPosting || isPosted}
            className={`flex-1 py-4 ${isPosted ? 'bg-green-500' : 'bg-[#bc13fe] hover:bg-[#a010d8]'} disabled:opacity-50 text-white rounded-xl font-bold text-lg transition-all flex flex-col items-center justify-center gap-2 shadow-lg shadow-[#bc13fe]/20`}
          >
            {isPosting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isPosted ? (
              <CheckCircle className="w-6 h-6" />
            ) : (
              <Send className="w-6 h-6" />
            )}
            <span className="text-sm">{isPosted ? 'Posted' : 'Post to Wall'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuestbookResult;
