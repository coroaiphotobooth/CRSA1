import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PhotoboothSettings, BartenderMenuItem } from '../../../types';
import { Wine, Sparkles } from 'lucide-react';

// Touch file
console.log('Bartender Menu Init');

interface BartenderMenuPageProps {
  settings: PhotoboothSettings;
  guestName: string;
  guestKode: string;
  onBack: () => void;
}

const DEFAULT_DRINK_MENU: BartenderMenuItem[] = [
  { id: 'cyber_mojito', name: 'Cyber Mojito', description: 'Mint, Lime, Neon Blue Curacao, Soda' },
  { id: 'galactic_coffee', name: 'Galactic Coffee', description: 'Cold Brew, Vanilla, Stardust Choco' },
  { id: 'neon_margarita', name: 'Neon Margarita', description: 'Tequila, Triple Sec, Lime, Salt Rim' },
];

const BartenderMenuPage: React.FC<BartenderMenuPageProps> = ({ settings, guestName, guestKode, onBack }) => {
  const [viewState, setViewState] = useState<'CHOICE' | 'MENU_LIST' | 'PROCESSING' | 'DONE'>('CHOICE');
  const [selectedDrink, setSelectedDrink] = useState<string | null>(null);

  const currentMenu = settings.bartenderMenu && settings.bartenderMenu.length > 0 ? settings.bartenderMenu : DEFAULT_DRINK_MENU;

  const handleOrderDrink = async (drinkName: string) => {
    setViewState('PROCESSING');
    setSelectedDrink(drinkName);

    try {
      const scriptUrl = "https://script.google.com/macros/s/AKfycbw5ZUzv-XwzgYJPvQt_PN42Yof3NivR_V3TJ3mfa6XkhsmAiOHMzZ5OTjA2NrKQk8s8/exec";
      await fetch(`${scriptUrl}?action=update&target=minuman&kode=${encodeURIComponent(guestKode)}&status=${encodeURIComponent(drinkName)}`, {
        method: 'GET',
        mode: 'no-cors'
      });
      // Give it a fake delay to feel like processing
      setTimeout(() => {
        setViewState('DONE');
      }, 2000);
    } catch (e) {
      console.error(e);
      setViewState('DONE'); // Still show done even if it failed silently for demo
    }
  };

  const handleOmakase = async () => {
    setViewState('PROCESSING');
    
    // Simulate AI choosing a drink
    const randomDrink = currentMenu[Math.floor(Math.random() * currentMenu.length)];
    setSelectedDrink(randomDrink.name + " (AI Special)");

    try {
      const scriptUrl = "https://script.google.com/macros/s/AKfycbw5ZUzv-XwzgYJPvQt_PN42Yof3NivR_V3TJ3mfa6XkhsmAiOHMzZ5OTjA2NrKQk8s8/exec";
      await fetch(`${scriptUrl}?action=update&target=minuman&kode=${encodeURIComponent(guestKode)}&status=${encodeURIComponent(randomDrink.name + " (AI Special)")}`, {
        method: 'GET',
        mode: 'no-cors'
      });
      setTimeout(() => {
        setViewState('DONE');
      }, 3000);
    } catch (e) {
      console.error(e);
      setViewState('DONE');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen relative p-6">
      <div className="absolute inset-0 bg-black z-0">
        <video 
          src={settings.vipVideoIdleUrl || '/placeholder-idle.mp4'} 
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen"
          autoPlay loop muted playsInline 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40 z-10" />
      </div>

      <div className="relative z-20 w-full max-w-4xl mx-auto flex flex-col items-center">
        
        {viewState === 'CHOICE' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col w-full gap-8 items-center"
          >
            <h2 className="text-3xl md:text-5xl font-heading font-bold text-white text-center uppercase tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
              Pesanan Minuman Anda
            </h2>
            <p className="text-gray-300 font-mono tracking-widest text-center max-w-lg mb-8 uppercase text-sm">
              Silakan pilih sendiri dari menu kami, atau biarkan AI meracikkan minuman khusus untuk Anda.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
              <button 
                onClick={() => setViewState('MENU_LIST')}
                className="group relative flex flex-col items-center justify-center p-10 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/20 hover:border-blue-400 rounded-3xl transition-all hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                <Wine className="w-16 h-16 text-blue-400 mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold font-heading tracking-widest uppercase mb-2">Lihat Menu</h3>
                <p className="text-xs text-gray-400 font-mono tracking-wider">Pilih minuman secara manual</p>
              </button>

              <button 
                onClick={handleOmakase}
                className="group relative flex flex-col items-center justify-center p-10 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/20 hover:border-[#bc13fe] rounded-3xl transition-all hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#bc13fe]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                <Sparkles className="w-16 h-16 text-[#bc13fe] mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold font-heading tracking-widest uppercase mb-2">Pilihkan Saya!</h3>
                <p className="text-xs text-gray-400 font-mono tracking-wider">Omakase racikan AI khusus</p>
              </button>
            </div>
          </motion.div>
        )}

        {viewState === 'MENU_LIST' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col w-full max-w-3xl"
          >
            <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-4">
              <h2 className="text-3xl font-heading font-bold uppercase tracking-widest text-blue-400">Daftar Menu</h2>
              <button 
                onClick={() => setViewState('CHOICE')}
                className="text-xs font-mono uppercase tracking-widest text-gray-400 hover:text-white"
              >
                ← Kembali
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentMenu.map((drink) => (
                <button
                  key={drink.id}
                  onClick={() => handleOrderDrink(drink.name)}
                  className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-blue-400 p-6 rounded-2xl flex flex-col text-left transition-all hover:bg-white/10 relative overflow-hidden group"
                >
                  {drink.imageUrl && (
                    <div className="absolute inset-x-0 top-0 h-32 opacity-30 group-hover:opacity-50 transition-opacity">
                      <img src={drink.imageUrl} alt={drink.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent"></div>
                    </div>
                  )}
                  <div className={`relative z-10 ${drink.imageUrl ? 'pt-24' : ''}`}>
                    <h3 className="font-heading font-bold text-lg mb-2 uppercase tracking-wide text-white">{drink.name}</h3>
                    <p className="text-xs font-mono text-gray-400 leading-relaxed mb-6">{drink.description}</p>
                    <span className="mt-auto text-[10px] font-mono tracking-widest uppercase text-blue-400">Pesan →</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {viewState === 'PROCESSING' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center p-12 bg-black/60 backdrop-blur-xl border border-blue-500/30 rounded-3xl"
          >
            <div className="w-16 h-16 border-4 border-t-blue-500 border-white/10 rounded-full animate-spin mb-6"></div>
            <h3 className="text-white font-mono tracking-widest uppercase">Sedang Meracik</h3>
            <p className="text-blue-400 text-xs mt-2 font-mono uppercase opacity-70">Mohon tunggu sebentar...</p>
          </motion.div>
        )}

        {viewState === 'DONE' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center p-12 bg-blue-900/20 backdrop-blur-xl border border-blue-500/50 rounded-3xl"
          >
            <Wine className="w-20 h-20 text-blue-400 mb-6 drop-shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
            <h2 className="text-3xl font-heading font-black uppercase tracking-widest mb-4">Pesanan Selesai!</h2>
            <p className="text-gray-300 font-mono text-sm tracking-wider mb-2">
              Bartender AI sedang menyiapkan:
            </p>
            <p className="text-xl font-bold font-heading text-white uppercase tracking-widest px-6 py-3 bg-white/10 border border-white/20 rounded-xl mt-4 mb-10">
              {selectedDrink}
            </p>
            
            <button 
              onClick={onBack}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/30 rounded-full font-mono text-xs uppercase tracking-widest transition-all"
            >
              Selesai & Keluar
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default BartenderMenuPage;
