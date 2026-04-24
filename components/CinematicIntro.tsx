import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface CinematicIntroProps {
  vendorName: string;
  onComplete: (language: 'en' | 'id') => void;
  isInstallable?: boolean;
  onInstall?: () => void;
}

export default function CinematicIntro({ vendorName, onComplete, isInstallable, onInstall }: CinematicIntroProps) {
  const [step, setStep] = useState(0);
  const [selectedLang, setSelectedLang] = useState<'en' | 'id'>('en');

  useEffect(() => {
    if (step === 0) {
      const timer = setTimeout(() => setStep(1), 3000);
      return () => clearTimeout(timer);
    }
    if (step === 1) {
      const timer = setTimeout(() => setStep(2), 3500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 1 } }}
      >
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 1.5 }}
            className="text-4xl md:text-6xl font-light tracking-widest text-center"
          >
            Hello {vendorName}
          </motion.div>
        )}
        
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 1.5 }}
            className="text-center flex flex-col items-center"
          >
            <h1 className="text-2xl md:text-4xl font-light tracking-widest mb-4 text-gray-400">Welcome to</h1>
            <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500">
              Coroai Photobooth app
            </h2>
            <p className="text-sm md:text-lg tracking-[0.3em] text-glow uppercase font-light">
              creative intelligence Studio
            </p>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="flex flex-col items-center gap-10"
          >
            <h3 className="text-2xl font-light tracking-widest text-center">
              Select your language<br/>
              <span className="text-lg text-gray-400">Pilih bahasa Anda</span>
            </h3>
            <div className="flex flex-col sm:flex-row gap-6">
              <button 
                onClick={() => {
                  setSelectedLang('en');
                  if (isInstallable) {
                    setStep(3);
                  } else {
                    onComplete('en');
                  }
                }}
                className="px-10 py-5 border border-white/20 rounded-lg hover:bg-white hover:text-black transition-all tracking-widest uppercase font-bold"
              >
                English
              </button>
              <button 
                onClick={() => {
                  setSelectedLang('id');
                  if (isInstallable) {
                    setStep(3);
                  } else {
                    onComplete('id');
                  }
                }}
                className="px-10 py-5 border border-white/20 rounded-lg hover:bg-white hover:text-black transition-all tracking-widest uppercase font-bold"
              >
                Indonesia
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="flex flex-col items-center gap-10"
          >
            <h3 className="text-2xl font-light tracking-widest text-center">
              {selectedLang === 'id' ? 'Instal Aplikasi ke Desktop/HP' : 'Install App to Desktop/Mobile'}
            </h3>
            <div className="flex flex-col sm:flex-row gap-6">
              <button 
                onClick={() => {
                  if (onInstall) onInstall();
                  onComplete(selectedLang);
                }}
                className="px-10 py-5 bg-glow text-white rounded-lg hover:bg-glow/80 transition-all tracking-widest uppercase font-bold"
              >
                Install App
              </button>
              <button 
                onClick={() => onComplete(selectedLang)}
                className="px-10 py-5 border border-white/20 rounded-lg hover:bg-white hover:text-black transition-all tracking-widest uppercase font-bold"
              >
                {selectedLang === 'id' ? 'Nanti Saja' : 'Install Later'}
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
