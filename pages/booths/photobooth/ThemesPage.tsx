
import React, { useState } from 'react';
import { Concept, PhotoboothSettings } from '../../../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ThemesPageProps {
  concepts: Concept[];
  onSelect: (concept: Concept) => void;
  onBack: () => void;
  onAdmin?: (tab?: 'settings' | 'concepts' | 'display' | 'vip') => void;
  settings?: PhotoboothSettings;
}

const ThemesPage: React.FC<ThemesPageProps> = ({ concepts, onSelect, onBack, onAdmin, settings }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  
  const layoutStyle = settings?.uiSettings?.conceptLayout || 'grid';
  const photoboothFlow = settings?.uiSettings?.photoboothFlow;
  
  const handlePrev = () => setActiveIndex(prev => Math.max(0, prev - 1));
  const handleNext = () => setActiveIndex(prev => Math.min(concepts.length - 1, prev + 1));

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;

    if (diff > 50) {
      handleNext();
    } else if (diff < -50) {
      handlePrev();
    }
    setTouchStartX(null);
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center p-6 md:p-10 bg-transparent font-sans">
      
      {/* HEADER SECTION - Fixed at Top */}
      <div className="flex justify-between items-center w-full mb-4 max-w-6xl shrink-0 z-20">
        <div className="w-24 md:w-32">
          {photoboothFlow !== 'no_launch_concept_photo' && (
            <button onClick={onBack} className="text-white flex items-center gap-2 hover:text-purple-400 transition-colors uppercase font-bold tracking-widest text-xs md:text-base bg-black/20 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              BACK
            </button>
          )}
        </div>
        <div className="text-center">
          <h2 className="text-xl md:text-3xl font-heading text-white neon-text italic uppercase bg-black/30 px-4 py-1 rounded-lg backdrop-blur-sm">CHOOSE CONCEPT</h2>
          <p className="text-[10px] text-purple-400 tracking-widest uppercase mt-1 drop-shadow-md">Select your transformation</p>
        </div>
        <div className="hidden md:block w-24 md:w-32" /> {/* Spacer to balance Back button */}
      </div>

      {/* CENTERED GRID WRAPPER - Takes remaining height and centers content */}
      <div className="flex-1 w-full max-w-6xl flex items-center justify-center py-4">
        {concepts.length === 0 ? (
          <div className="text-center bg-black/50 p-8 rounded-2xl border border-white/10 backdrop-blur-md flex flex-col items-center">
            <h3 className="text-xl font-bold text-white mb-6">No Concepts Available</h3>
            {onAdmin && (
              <button 
                onClick={() => onAdmin('concepts')}
                className="px-6 py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#bc13fe]/20 uppercase tracking-widest text-sm"
              >
                Add concept to this event
              </button>
            )}
          </div>
        ) : (
          layoutStyle === 'carousel' ? (
            <div className="relative w-full h-[60vh] md:h-[70vh] flex items-center justify-center">
                {activeIndex > 0 && (
                    <button onClick={handlePrev} className="absolute left-2 md:left-4 z-40 p-3 md:p-4 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-md border border-white/20 transition-all">
                        <ChevronLeft className="w-6 h-6 md:w-8 md:h-8" />
                    </button>
                )}
                
                <div 
                  className="relative w-full max-w-6xl h-[450px] md:h-[600px] flex items-center justify-center overflow-hidden"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                >
                    {concepts.map((concept, index) => {
                        const isCenter = index === activeIndex;
                        const isLeft = index === activeIndex - 1;
                        const isRight = index === activeIndex + 1;
                        
                        if (!isCenter && !isLeft && !isRight) return null;
                        
                        let baseClasses = "absolute top-0 bottom-0 my-auto cursor-pointer rounded-2xl overflow-hidden border-2 transition-all duration-500 shadow-2xl flex flex-col justify-end bg-black";
                        
                        if (isCenter) {
                          baseClasses += " z-30 scale-100 opacity-100 border-purple-500 shadow-[0_0_50px_rgba(168,85,247,0.5)] h-[90%] md:h-full aspect-[2/3] left-1/2 -translate-x-1/2";
                        } else if (isLeft) {
                          baseClasses += " z-20 scale-[0.85] opacity-50 blur-[2px] border-white/10 h-[75%] md:h-[80%] aspect-[2/3] left-[15%] md:left-[30%] -translate-x-1/2 hover:opacity-80";
                        } else if (isRight) {
                          baseClasses += " z-20 scale-[0.85] opacity-50 blur-[2px] border-white/10 h-[75%] md:h-[80%] aspect-[2/3] right-[15%] md:right-[30%] translate-x-1/2 hover:opacity-80";
                        }
                        
                        return (
                            <div 
                                key={concept.id}
                                onClick={() => {
                                    if (isCenter) onSelect(concept);
                                    else if (isLeft) handlePrev();
                                    else if (isRight) handleNext();
                                }}
                                className={baseClasses}
                            >
                                <img src={concept.thumbnail} alt={concept.name} className="absolute inset-0 w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-90" />
                                <div className="relative z-10 p-6 md:p-8 w-full flex flex-col items-center text-center">
                                    <h3 className="text-white font-heading text-2xl md:text-5xl uppercase tracking-wider drop-shadow-lg font-black italic">{concept.name}</h3>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {activeIndex < concepts.length - 1 && (
                    <button onClick={handleNext} className="absolute right-2 md:right-4 z-40 p-3 md:p-4 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-md border border-white/20 transition-all">
                        <ChevronRight className="w-6 h-6 md:w-8 md:h-8" />
                    </button>
                )}
            </div>
          ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full animate-[popIn_0.5s_ease-out]">
            {concepts.map((concept) => (
              <div 
                key={concept.id}
                onClick={() => onSelect(concept)}
                className="group relative h-[200px] md:h-[280px] cursor-pointer overflow-hidden rounded-xl border-2 border-white/10 hover:border-purple-500 transition-all duration-300 shadow-2xl hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:-translate-y-2 bg-black/40 backdrop-blur-sm"
              >
                <img 
                  src={concept.thumbnail} 
                  alt={concept.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70 group-hover:opacity-100"
                />
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90" />
                
                {/* Content */}
                <div className="absolute bottom-0 left-0 p-4 w-full flex flex-col gap-1">
                  <h3 className="text-sm md:text-lg font-heading text-white leading-tight tracking-tight uppercase italic group-hover:neon-text transition-all">{concept.name}</h3>
                  <div className="h-0.5 w-8 bg-purple-500 group-hover:w-full transition-all duration-500" />
                  <p className="text-[8px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 uppercase tracking-widest mt-1">
                      Click to Select
                  </p>
                </div>

                {/* Selection Ring Animation */}
                <div className="absolute inset-0 border-2 border-purple-500/0 group-hover:border-purple-500/100 rounded-xl transition-all duration-300" />
              </div>
            ))}
          </div>
          )
        )}
      </div>
      
    </div>
  );
};

export default ThemesPage;
