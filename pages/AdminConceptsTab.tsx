import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Concept, PhotoboothSettings, TemplateConcept } from '../types';
import { saveConceptsToGas } from '../lib/appsScript';
import { supabase } from '../lib/supabase';
import { useDialog } from '../components/DialogProvider';
import { Loader2 } from 'lucide-react';

interface AdminConceptsTabProps {
  concepts: Concept[];
  onSaveConcepts: (concepts: Concept[]) => void;
  adminPin: string;
  settings: PhotoboothSettings;
}

const AdminConceptsTab: React.FC<AdminConceptsTabProps> = ({ concepts, onSaveConcepts, adminPin, settings }) => {
  const [localConcepts, setLocalConcepts] = useState(concepts);
  const { eventId } = useParams<{ eventId: string }>();
  const [isSavingConcepts, setIsSavingConcepts] = useState(false);
  const { showDialog } = useDialog();

  // Template Concept State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateConcepts, setTemplateConcepts] = useState<TemplateConcept[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    setLocalConcepts(concepts);
  }, [concepts]);

  const fetchTemplateConcepts = async () => {
    try {
      setLoadingTemplates(true);
      const { data, error } = await supabase
        .from('template_concepts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code !== '42P01' && error.code !== 'PGRST205') { // Ignore if table doesn't exist yet
          console.error("Error fetching template concepts:", error);
        }
      } else if (data) {
        setTemplateConcepts(data);
      }
    } catch (err) {
      console.error("Failed to fetch template concepts:", err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleOpenTemplateModal = () => {
    fetchTemplateConcepts();
    setShowTemplateModal(true);
  };

  const handleUseTemplate = (template: TemplateConcept) => {
    const newId = `concept_${Date.now()}`;
    const newConcept: Concept = {
      id: newId,
      name: template.name,
      prompt: template.prompt,
      thumbnail: template.thumbnail,
      refImage: template.ref_image || undefined
    };
    setLocalConcepts(prev => [...prev, newConcept]);
    setShowTemplateModal(false);
  };

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

  const handleUploadAsset = async (file: File, type: 'thumbnail' | 'refImage', index: number) => {
    if (eventId) {
      try {
        const fileExt = file.name.split('.').pop();
        const folderName = settings.storage_folder || eventId;
        const fileName = `${folderName}/assets/${type}-${Date.now()}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('photobooth')
          .upload(fileName, file, { upsert: true });
          
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage
          .from('photobooth')
          .getPublicUrl(fileName);
          
        if (type === 'thumbnail') {
          handleThumbChange(index, publicUrl);
        } else {
          handleRefImageChange(index, publicUrl);
        }
      } catch (err) {
        console.error(`Error uploading ${type}:`, err);
        await showDialog('alert', 'Error', `Failed to upload ${type} to Database.`);
      }
    } else {
      // Fallback to base64 for GAS
      const reader = new FileReader();
      reader.onload = () => {
        if (type === 'thumbnail') {
          handleThumbChange(index, reader.result as string);
        } else {
          handleRefImageChange(index, reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
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
        
        // Get existing concepts from DB to find which ones to delete
        const { data: existingConcepts } = await supabase
          .from('concepts')
          .select('id')
          .eq('event_id', eventId);

        const localConceptIds = localConcepts.map(c => c.id);
        const conceptsToDelete = existingConcepts
          ?.filter(c => !localConceptIds.includes(c.id))
          .map(c => c.id) || [];

        // Delete removed concepts
        if (conceptsToDelete.length > 0) {
          await supabase.from('concepts').delete().in('id', conceptsToDelete);
        }
        
        // Upsert concepts
        const { error } = await supabase
          .from('concepts')
          .upsert(conceptsToSave, { onConflict: 'id' });
          
        if (error) throw error;
        await showDialog('alert', 'Success', 'SUCCESS: Concepts saved locally AND synced to Database.');
      } else {
        const ok = await saveConceptsToGas(localConcepts, adminPin);
        
        if (ok) {
          await showDialog('alert', 'Success', 'SUCCESS: Concepts saved locally AND synced to Cloud (GAS).');
        } else {
          await showDialog('alert', 'Warning', 'WARNING: Concepts saved LOCALLY only. Cloud sync failed (Data might be too large), but items are safe on this machine.');
        }
      }
    } catch (e) {
        await showDialog('alert', 'Warning', 'Local save successful. Cloud error: ' + e);
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
                  <label className="absolute inset-0 bg-[#bc13fe]/80 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity text-center px-1">
                     Update Thumbnail
                     <input type="file" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                           setIsSavingConcepts(true);
                           await handleUploadAsset(file, 'thumbnail', index);
                           setIsSavingConcepts(false);
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
                     <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                           if (file.size > 1024 * 1024) {
                              await showDialog('alert', 'Error', "File too large! Max size is 1MB.");
                              return;
                           }
                           setIsSavingConcepts(true);
                           await handleUploadAsset(file, 'refImage', index);
                           setIsSavingConcepts(false);
                        }
                     }} />
                  </label>
               </div>

               {/* TEXT INPUTS */}
               <div className="flex-1 flex flex-col gap-4">
                  <input 
                     className="bg-transparent border-b border-white/10 p-2 font-heading uppercase italic text-white outline-none focus:border-[#bc13fe] w-full" 
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
        <div className="glass-card p-6 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-white/10 hover:border-[#bc13fe]/50 hover:bg-white/5 transition-all min-h-[200px] rounded-xl backdrop-blur-sm">
          <button onClick={handleAddConcept} className="flex flex-col items-center justify-center gap-4 w-full h-full group">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center text-white/50 group-hover:text-[#bc13fe] group-hover:border-[#bc13fe] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </div>
            <span className="font-heading text-xs tracking-[0.3em] text-white/40 uppercase italic">ADD_NEW_CONCEPT</span>
          </button>
          
          <div className="w-full border-t border-white/10 pt-4 mt-2">
            <button 
              onClick={handleOpenTemplateModal}
              className="w-full py-2 bg-[#bc13fe]/20 hover:bg-[#bc13fe]/40 text-[#bc13fe] rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
            >
              USE TEMPLATE CONCEPT
            </button>
          </div>
        </div>
      </div>
      <div className="flex justify-center mt-10">
        <button onClick={handleSyncConcepts} disabled={isSavingConcepts} className="px-20 py-6 bg-[#bc13fe] font-heading tracking-widest uppercase italic shadow-2xl hover:bg-[#a010d8] transition-all disabled:opacity-50 rounded-lg">
          {isSavingConcepts ? 'SINKRONISASI...' : 'SYNC ALL CONCEPTS TO CLOUD'}
        </button>
      </div>

      {/* Template Concept Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#111] z-10">
              <h2 className="text-xl font-bold">Load Template Concept</h2>
              <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-6">
              {loadingTemplates ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#bc13fe]" />
                </div>
              ) : templateConcepts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No template concepts available.</p>
                  <p className="text-sm mt-2">Super Admin can create templates in their dashboard.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {templateConcepts.map(template => (
                    <div key={template.id} className="bg-black/30 border border-white/5 rounded-xl overflow-hidden group hover:border-[#bc13fe]/50 transition-colors flex flex-col">
                      <div className="aspect-square relative">
                        <img src={template.thumbnail} alt={template.name} className="w-full h-full object-cover" />
                        {template.ref_image && (
                          <div className="absolute top-2 right-2 bg-black/80 text-[10px] px-2 py-1 rounded border border-white/10">
                            Has Ref Image
                          </div>
                        )}
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <h3 className="font-bold text-sm mb-1">{template.name}</h3>
                        <p className="text-xs text-gray-500 line-clamp-3 mb-4 flex-1">{template.prompt}</p>
                        <button
                          onClick={() => handleUseTemplate(template)}
                          className="w-full py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          LOAD CONCEPT
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminConceptsTab;
