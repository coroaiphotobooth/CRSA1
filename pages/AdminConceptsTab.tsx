import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Concept } from '../types';
import { saveConceptsToGas } from '../lib/appsScript';
import { supabase } from '../lib/supabase';

interface AdminConceptsTabProps {
  concepts: Concept[];
  onSaveConcepts: (concepts: Concept[]) => void;
  adminPin: string;
}

const AdminConceptsTab: React.FC<AdminConceptsTabProps> = ({ concepts, onSaveConcepts, adminPin }) => {
  const [localConcepts, setLocalConcepts] = useState(concepts);
  const { eventId } = useParams<{ eventId: string }>();
  const [isSavingConcepts, setIsSavingConcepts] = useState(false);

  useEffect(() => {
    setLocalConcepts(concepts);
  }, [concepts]);

  const handleAddConcept = () => {
    const newId = `concept_${Date.now()}`;
    const newConcept: Concept = {
      id: newId,
      name: 'NEW CONCEPT',
      prompt: 'Describe the transformation here...',
      thumbnail: 'https://picsum.photos/seed/' + newId + '/300/500'
    };
    setLocalConcepts(prev => [...prev, newConcept]);
  };

  const handleDeleteConcept = (index: number) => {
    setLocalConcepts(prev => prev.filter((_, i) => i !== index));
  };

  const handleConceptChange = (index: number, field: keyof Concept, value: string) => {
    setLocalConcepts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleThumbChange = (index: number, base64: string) => {
    setLocalConcepts(prev => prev.map((c, i) => i === index ? { ...c, thumbnail: base64 } : c));
  };

  const handleRefImageChange = (index: number, base64: string) => {
    setLocalConcepts(prev => prev.map((c, i) => i === index ? { ...c, refImage: base64 } : c));
  };

  const handleRemoveRefImage = (index: number) => {
    setLocalConcepts(prev => prev.map((c, i) => {
       if (i === index) {
          const { refImage, ...rest } = c;
          return rest as Concept;
       }
       return c;
    }));
  };

  const handleSyncConcepts = async () => {
    setIsSavingConcepts(true);
    try {
      // CRITICAL FIX: Simpan ke database lokal (IndexedDB) dulu!
      // Ini membuat item yang baru Anda tambahkan langsung tersimpan di mesin kiosk.
      onSaveConcepts(localConcepts);
      
      console.log("Saving concepts to cloud...");
      
      if (eventId) {
        // Upsert concepts to Supabase
        // Note: This assumes a 'concepts' table exists with event_id
        // For a full implementation, we'd need to handle deletions too,
        // but for now we'll just upsert the current list.
        const conceptsToSave = localConcepts.map(c => ({
          ...c,
          event_id: eventId
        }));
        
        // Delete existing concepts for this event first to handle removals
        await supabase.from('concepts').delete().eq('event_id', eventId);
        
        const { error } = await supabase
          .from('concepts')
          .insert(conceptsToSave);
          
        if (error) throw error;
        alert('SUCCESS: Concepts saved locally AND synced to Supabase.');
      } else {
        const ok = await saveConceptsToGas(localConcepts, adminPin);
        
        if (ok) {
          alert('SUCCESS: Concepts saved locally AND synced to Cloud (GAS).');
        } else {
          alert('WARNING: Concepts saved LOCALLY only. Cloud sync failed (Data might be too large), but items are safe on this machine.');
        }
      }
    } catch (e) {
        alert('Local save successful. Cloud error: ' + e);
    } finally {
      setIsSavingConcepts(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {localConcepts.map((concept, index) => (
          <div key={concept.id} className="glass-card p-6 flex flex-col gap-4 relative group backdrop-blur-md bg-black/60 rounded-xl border border-white/10">
            <button 
              onClick={(e) => { e.stopPropagation(); handleDeleteConcept(index); }} 
              className="absolute top-4 right-4 text-red-900/40 hover:text-red-500 transition-colors p-2 z-20 hover:bg-white/10 rounded"
              title="Delete Concept"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            </button>

            <div className="flex gap-4">
               {/* THUMBNAIL */}
               <div className="w-24 aspect-[9/16] bg-white/5 border border-white/10 rounded-xl shrink-0 overflow-hidden relative group/thumb shadow-lg">
                  <img src={concept.thumbnail} className="w-full h-full object-cover" />
                  <label className="absolute inset-0 bg-purple-600/80 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity text-center px-1">
                     Update Thumbnail
                     <input type="file" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                           const reader = new FileReader();
                           reader.onload = () => handleThumbChange(index, reader.result as string);
                           reader.readAsDataURL(file);
                        }
                     }} />
                  </label>
               </div>

               {/* REFERENCE IMAGE (NEW) */}
               <div className="w-24 aspect-[9/16] bg-white/5 border border-dashed border-white/20 rounded-xl shrink-0 overflow-hidden relative group/ref shadow-lg flex items-center justify-center">
                  {concept.refImage ? (
                     <>
                        <img src={concept.refImage} className="w-full h-full object-cover" />
                        <button 
                           onClick={() => handleRemoveRefImage(index)}
                           className="absolute top-1 right-1 bg-red-600 rounded-full w-4 h-4 flex items-center justify-center text-white z-20 hover:scale-110"
                        >
                           <span className="text-[10px]">✕</span>
                        </button>
                     </>
                  ) : (
                     <span className="text-[8px] text-white/30 text-center px-2">Ref Image (Style)</span>
                  )}
                  
                  <label className="absolute inset-0 bg-blue-600/80 opacity-0 group-hover/ref:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity text-center px-1 z-10">
                     {concept.refImage ? 'Change Reference' : 'Add Reference'}
                     <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                           if (file.size > 1024 * 1024) {
                              alert("File too large! Max size is 1MB.");
                              return;
                           }
                           const reader = new FileReader();
                           reader.onload = () => handleRefImageChange(index, reader.result as string);
                           reader.readAsDataURL(file);
                        }
                     }} />
                  </label>
               </div>

               {/* TEXT INPUTS */}
               <div className="flex-1 flex flex-col gap-4">
                  <input 
                     className="bg-transparent border-b border-white/10 p-2 font-heading uppercase italic text-white outline-none focus:border-purple-500 w-full" 
                     value={concept.name} 
                     onChange={e => handleConceptChange(index, 'name', e.target.value)} 
                     placeholder="Concept Name"
                  />
                  <textarea 
                     className="bg-black/30 border border-white/5 p-3 text-[10px] font-mono h-24 text-gray-400 outline-none focus:border-white/20 resize-none w-full rounded-lg" 
                     value={concept.prompt} 
                     onChange={e => handleConceptChange(index, 'prompt', e.target.value)} 
                     placeholder="Prompt description..."
                  />
               </div>
            </div>
            
            {/* HELPER TEXT */}
            <div className="bg-white/5 p-2 rounded text-[9px] text-gray-500 italic">
               * <strong>Thumbnail:</strong> Displayed in concept menu. <br/>
               * <strong>Reference Image:</strong> Optional. If uploaded, AI will use it as style/clothing/background reference.
            </div>
          </div>
        ))}
        <button onClick={handleAddConcept} className="glass-card p-6 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-white/10 hover:border-purple-500/50 hover:bg-white/5 transition-all min-h-[200px] rounded-xl backdrop-blur-sm">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center text-white/50 group-hover:text-purple-500 group-hover:border-purple-500 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </div>
          <span className="font-heading text-xs tracking-[0.3em] text-white/40 uppercase italic">ADD_NEW_CONCEPT</span>
        </button>
      </div>
      <div className="flex justify-center mt-10">
        <button onClick={handleSyncConcepts} disabled={isSavingConcepts} className="px-20 py-6 bg-purple-600 font-heading tracking-widest uppercase italic shadow-2xl hover:bg-purple-500 transition-all disabled:opacity-50 rounded-lg">
          {isSavingConcepts ? 'SINKRONISASI...' : 'SYNC ALL CONCEPTS TO CLOUD'}
        </button>
      </div>
    </div>
  );
};

export default AdminConceptsTab;
