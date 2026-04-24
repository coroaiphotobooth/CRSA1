import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Send } from 'lucide-react';
import { PhotoboothSettings } from '../../types';

interface GuestbookLandingProps {
  settings: PhotoboothSettings;
  onNext: (name: string, message: string) => void;
}

const GuestbookLanding: React.FC<GuestbookLandingProps> = ({ settings, onNext }) => {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && message.trim()) {
      onNext(name.trim(), message.trim());
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      {settings.backgroundImage ? (
        <div 
          className="absolute inset-0 z-0 opacity-40 bg-cover bg-center"
          style={{ backgroundImage: `url(${settings.backgroundImage})` }}
        />
      ) : (
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-glow/20 to-[#050505]" />
      )}

      <div className="relative z-10 w-full max-w-md">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-4xl font-heading font-bold neon-text mb-4">
            {settings.eventName || 'Guestbook AI'}
          </h1>
          <p className="text-gray-300">
            {settings.eventDescription || 'Leave a message and take an AI photo!'}
          </p>
        </motion.div>

        <motion.form 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="glass-card p-6 rounded-2xl border border-white/10 flex flex-col gap-4"
        >
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">Your Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-glow transition-colors"
              placeholder="Enter your name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">Your Message</label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-glow transition-colors resize-none"
              placeholder="Write a message for the event..."
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || !message.trim()}
            className="mt-4 w-full py-4 bg-glow hover:bg-[#a010d8] disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-glow/20"
          >
            <Camera className="w-5 h-5" />
            Take Photo
          </button>
        </motion.form>
      </div>
    </div>
  );
};

export default GuestbookLanding;
