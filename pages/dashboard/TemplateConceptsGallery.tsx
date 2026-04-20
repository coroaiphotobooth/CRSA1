import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Trash2, Edit, Image as ImageIcon, Save } from 'lucide-react';
import { TemplateConcept } from '../../types';
import { useDialog } from '../../components/DialogProvider';

interface TemplateConceptsGalleryProps {
  templateConcepts: TemplateConcept[];
  setTemplateConcepts: React.Dispatch<React.SetStateAction<TemplateConcept[]>>;
}

export default function TemplateConceptsGallery({ templateConcepts, setTemplateConcepts }: TemplateConceptsGalleryProps) {
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [editingConcept, setEditingConcept] = useState<TemplateConcept | null>(null);
  const [conceptForm, setConceptForm] = useState({ name: '', prompt: '', thumbnail: '', ref_image: '', ref_image_2: '' });
  const [savingConcept, setSavingConcept] = useState(false);
  const { showDialog } = useDialog();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'thumbnail' | 'ref_image' | 'ref_image_2') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSavingConcept(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `template_concepts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('photobooth')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photobooth')
        .getPublicUrl(filePath);

      setConceptForm({ ...conceptForm, [field]: publicUrl });
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to upload image: ${err.message}`);
    } finally {
      setSavingConcept(false);
    }
  };

  const handleSaveTemplateConcept = async () => {
    if (!conceptForm.name || !conceptForm.prompt || !conceptForm.thumbnail) {
      await showDialog('alert', 'Error', 'Name, prompt, and thumbnail are required.');
      return;
    }

    try {
      setSavingConcept(true);
      if (editingConcept) {
        const { error } = await supabase
          .from('template_concepts')
          .update({
            name: conceptForm.name,
            prompt: conceptForm.prompt,
            thumbnail: conceptForm.thumbnail,
            ref_image: conceptForm.ref_image || null,
            ref_image_2: conceptForm.ref_image_2 || null
          })
          .eq('id', editingConcept.id);

        if (error) throw error;
        setTemplateConcepts(templateConcepts.map(c => c.id === editingConcept.id ? { ...c, ...conceptForm } : c));
      } else {
        const { data, error } = await supabase
          .from('template_concepts')
          .insert([{
            name: conceptForm.name,
            prompt: conceptForm.prompt,
            thumbnail: conceptForm.thumbnail,
            ref_image: conceptForm.ref_image || null,
            ref_image_2: conceptForm.ref_image_2 || null
          }])
          .select();

        if (error) throw error;
        if (data && data[0]) {
          setTemplateConcepts([data[0], ...templateConcepts]);
        }
      }
      setShowConceptModal(false);
      setEditingConcept(null);
      setConceptForm({ name: '', prompt: '', thumbnail: '', ref_image: '', ref_image_2: '' });
      await showDialog('alert', 'Success', 'Template concept saved successfully!');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to save template concept: ${err.message}`);
    } finally {
      setSavingConcept(false);
    }
  };

  const handleDeleteTemplateConcept = async (id: string) => {
    const confirmed = await showDialog('confirm', 'Confirm Deletion', 'Are you sure you want to delete this template concept?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('template_concepts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTemplateConcepts(templateConcepts.filter(c => c.id !== id));
      await showDialog('alert', 'Success', 'Template concept deleted successfully.');
    } catch (err: any) {
      await showDialog('alert', 'Error', `Failed to delete template concept: ${err.message}`);
    }
  };

  return (
    <div className="glass-card p-6 rounded-2xl border border-white/10">
      <h2 className="text-xl font-bold mb-4">Template Concepts Gallery</h2>
      <p className="text-sm text-gray-400 mb-6">
        Create reusable concepts that vendors can load directly into their events.
      </p>
      
      <div className="space-y-4">
        <button 
          onClick={() => {
            setEditingConcept(null);
            setConceptForm({ name: '', prompt: '', thumbnail: '', ref_image: '', ref_image_2: '' });
            setShowConceptModal(true);
          }}
          className="w-full py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
        >
          + ADD NEW TEMPLATE CONCEPT
        </button>

        <div className="mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {templateConcepts.map(concept => (
              <div key={concept.id} className="bg-black/30 border border-white/5 rounded-xl overflow-hidden group">
                <div className="aspect-square relative">
                  <img src={concept.thumbnail} alt={concept.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setEditingConcept(concept);
                        setConceptForm({
                          name: concept.name,
                          prompt: concept.prompt,
                          thumbnail: concept.thumbnail,
                          ref_image: concept.ref_image || '',
                          ref_image_2: concept.ref_image_2 || ''
                        });
                        setShowConceptModal(true);
                      }}
                      className="p-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplateConcept(concept.id)}
                      className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-bold text-sm truncate">{concept.name}</h3>
                  <p className="text-xs text-gray-500 truncate mt-1">{concept.prompt}</p>
                </div>
              </div>
            ))}
            {templateConcepts.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4 col-span-full">No template concepts found.</p>
            )}
          </div>
        </div>
      </div>

      {/* Template Concept Modal */}
      {showConceptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111]/80 backdrop-blur-md border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#111]/80 backdrop-blur-md z-10">
              <h2 className="text-xl font-bold">{editingConcept ? 'Edit Template Concept' : 'Add Template Concept'}</h2>
              <button onClick={() => setShowConceptModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-300">Concept Name</label>
                <input
                  type="text"
                  value={conceptForm.name}
                  onChange={e => setConceptForm({ ...conceptForm, name: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-[#bc13fe] outline-none"
                  placeholder="e.g., Cyberpunk Neon"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-300">Prompt</label>
                <textarea
                  value={conceptForm.prompt}
                  onChange={e => setConceptForm({ ...conceptForm, prompt: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-[#bc13fe] outline-none h-32 resize-none"
                  placeholder="Enter the generation prompt..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-300">Thumbnail Image</label>
                  <div className="aspect-square rounded-xl border-2 border-dashed border-white/20 overflow-hidden relative group bg-black/50">
                    {conceptForm.thumbnail ? (
                      <>
                        <img src={conceptForm.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <label className="cursor-pointer px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold backdrop-blur-sm transition-colors">
                            Change Image
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'thumbnail')} />
                          </label>
                        </div>
                      </>
                    ) : (
                      <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                        <span className="text-3xl mb-2">+</span>
                        <span className="text-sm text-gray-400">Upload Thumbnail</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'thumbnail')} />
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 font-bold whitespace-nowrap">OR URL:</span>
                    <input
                      type="text"
                      value={conceptForm.thumbnail}
                      onChange={e => setConceptForm({ ...conceptForm, thumbnail: e.target.value })}
                      className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:border-[#bc13fe] outline-none"
                      placeholder="Paste image URL here..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-300">Reference Images (Optional)</label>
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="text-[10px] text-gray-400 font-bold uppercase">Image 1 (Style)</div>
                      <div className="aspect-square rounded-xl border-2 border-dashed border-white/20 overflow-hidden relative group bg-black/50">
                        {conceptForm.ref_image ? (
                          <>
                            <img src={conceptForm.ref_image} alt="Reference 1" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                              <label className="cursor-pointer px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold backdrop-blur-sm transition-colors">
                                Change
                                <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'ref_image')} />
                              </label>
                              <button 
                                onClick={() => setConceptForm({ ...conceptForm, ref_image: '' })}
                                className="px-3 py-1.5 bg-red-500/50 hover:bg-red-500/80 rounded-lg text-xs font-bold backdrop-blur-sm transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                            <span className="text-3xl mb-2">+</span>
                            <span className="text-xs text-gray-400">Upload Ref 1</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'ref_image')} />
                          </label>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-gray-500 font-bold whitespace-nowrap">OR URL:</span>
                        <input
                          type="text"
                          value={conceptForm.ref_image || ''}
                          onChange={e => setConceptForm({ ...conceptForm, ref_image: e.target.value })}
                          className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-[10px] text-white focus:border-[#bc13fe] outline-none"
                          placeholder="Paste URL..."
                        />
                      </div>
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="text-[10px] text-gray-400 font-bold uppercase">Image 2 (Clothes/BG)</div>
                      <div className="aspect-square rounded-xl border-2 border-dashed border-white/20 overflow-hidden relative group bg-black/50">
                        {conceptForm.ref_image_2 ? (
                          <>
                            <img src={conceptForm.ref_image_2} alt="Reference 2" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                              <label className="cursor-pointer px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold backdrop-blur-sm transition-colors">
                                Change
                                <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'ref_image_2')} />
                              </label>
                              <button 
                                onClick={() => setConceptForm({ ...conceptForm, ref_image_2: '' })}
                                className="px-3 py-1.5 bg-red-500/50 hover:bg-red-500/80 rounded-lg text-xs font-bold backdrop-blur-sm transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                            <span className="text-3xl mb-2">+</span>
                            <span className="text-xs text-gray-400">Upload Ref 2</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'ref_image_2')} />
                          </label>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-gray-500 font-bold whitespace-nowrap">OR URL:</span>
                        <input
                          type="text"
                          value={conceptForm.ref_image_2 || ''}
                          onChange={e => setConceptForm({ ...conceptForm, ref_image_2: e.target.value })}
                          className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-[10px] text-white focus:border-[#bc13fe] outline-none"
                          placeholder="Paste URL..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-4 sticky bottom-0 bg-[#111] z-10">
              <button
                onClick={() => setShowConceptModal(false)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplateConcept}
                disabled={savingConcept}
                className="px-6 py-2 bg-[#bc13fe] hover:bg-[#a010d8] rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {savingConcept ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Concept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
