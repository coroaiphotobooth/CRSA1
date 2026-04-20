import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Concept, PhotoboothSettings, TemplateConcept, ConceptTemplate } from '../../../../types';
import { saveConceptsToGas } from '../../../../lib/appsScript';
import { supabase } from '../../../../lib/supabase';
import { useDialog } from '../../../../components/DialogProvider';
import { Loader2, Sparkles, Plus, X, Palette, Trash2, Edit } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

import { useTourState, setTourState } from '../../../../lib/tourState';

export interface AdminConceptsTabRef {
  saveConcepts: () => Promise<void>;
  hasUnsavedChanges: () => boolean;
}

interface AdminConceptsTabProps {
  concepts: Concept[];
  onSaveConcepts: (concepts: Concept[]) => void;
  adminPin: string;
  settings: PhotoboothSettings;
}

const AdminConceptsTab = forwardRef<AdminConceptsTabRef, AdminConceptsTabProps>(({ concepts, onSaveConcepts, adminPin, settings }, ref) => {
  const [localConcepts, setLocalConcepts] = useState(concepts);
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [isSavingConcepts, setIsSavingConcepts] = useState(false);
  const { showDialog } = useDialog();
  const { isActive, tourType, stepIndex } = useTourState();
  const prevIsActive = useRef(isActive);

  // Creation Selection Modal
  const [showCreationSelectionModal, setShowCreationSelectionModal] = useState(false);

  // Create from Image State
  const [showCreateFromImageModal, setShowCreateFromImageModal] = useState(false);
  const [createFromImageName, setCreateFromImageName] = useState('');
  const [createFromImageFile, setCreateFromImageFile] = useState<File | null>(null);
  const [createFromImagePreview, setCreateFromImagePreview] = useState<string | null>(null);
  const [isCreatingFromImage, setIsCreatingFromImage] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Edit Modal State
  const [editingConceptIndex, setEditingConceptIndex] = useState<number | null>(null);

  useEffect(() => {
    setIsDirty(JSON.stringify(localConcepts) !== JSON.stringify(concepts));
  }, [localConcepts, concepts]);

  useImperativeHandle(ref, () => ({
    saveConcepts: async () => {
      await handleSyncConcepts();
    },
    hasUnsavedChanges: () => isDirty
  }));

  // Template Concept State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateConcepts, setTemplateConcepts] = useState<TemplateConcept[]>([]);
  const [conceptTemplates, setConceptTemplates] = useState<ConceptTemplate[]>([]);
  const [templateTab, setTemplateTab] = useState<'superadmin' | 'mine'>('superadmin');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Close modal if tour is skipped
  useEffect(() => {
    if (prevIsActive.current && !isActive && showTemplateModal) {
      setShowTemplateModal(false);
    }
    prevIsActive.current = isActive;
  }, [isActive, showTemplateModal]);

  useEffect(() => {
    setLocalConcepts(concepts);
  }, [concepts]);

  const fetchTemplateConcepts = async () => {
    try {
      setLoadingTemplates(true);
      // Fetch old template concepts
      const { data: oldData, error: oldError } = await supabase
        .from('template_concepts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (oldError && oldError.code !== '42P01' && oldError.code !== 'PGRST205') {
        console.error("Error fetching template concepts:", oldError);
      } else if (oldData) {
        setTemplateConcepts(oldData);
      }

      // Fetch new concept templates
      const { data: newData, error: newError } = await supabase
        .from('concept_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (newError && newError.code !== '42P01' && newError.code !== 'PGRST205') {
        console.error("Error fetching concept templates:", newError);
      } else if (newData) {
        setConceptTemplates(newData);
      }

    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleOpenTemplateModal = async () => {
    setShowTemplateModal(true);
    await fetchTemplateConcepts();
    if (isActive && tourType === 'concept' && stepIndex === 0) {
      setTimeout(() => {
        setTourState({ stepIndex: 1 });
      }, 100);
    }
  };

  const handleUseTemplate = (template: TemplateConcept | ConceptTemplate, type: 'old' | 'new') => {
    const newId = crypto.randomUUID();
    let newConcept: Concept;

    if (type === 'old') {
      const t = template as TemplateConcept;
      newConcept = {
        id: newId,
        concept_id: `template_${t.id}`,
        name: t.name,
        prompt: t.prompt,
        thumbnail: t.thumbnail,
        refImage: t.ref_image || undefined
      };
    } else {
      const t = template as ConceptTemplate;
      newConcept = {
        id: newId,
        concept_id: `concept_studio_${t.id}`,
        name: t.name,
        prompt: t.prompt,
        thumbnail: t.thumbnail || t.reference_image_split || t.reference_image_bg || 'https://picsum.photos/seed/concept/300/500',
        reference_image_split: t.reference_image_split,
        reference_image_bg: t.reference_image_bg,
        style_preset: t.style_preset
      };
    }

    setLocalConcepts(prev => [...prev, newConcept]);
    setShowTemplateModal(false);
    if (isActive && tourType === 'concept' && stepIndex === 1) {
      setTourState({ stepIndex: 2 });
    }
  };

  const handleCreateFromImage = async () => {
    if (!createFromImageName.trim()) {
      await showDialog('alert', 'Error', 'Please enter a concept name.');
      return;
    }
    if (!createFromImageFile) {
      await showDialog('alert', 'Error', 'Please upload an image.');
      return;
    }

    try {
      setIsCreatingFromImage(true);
      
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(createFromImageFile);
      const base64Data = await base64Promise;

      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API Key not configured");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const systemInstruction = `You are an expert AI image prompt engineer. Your task is to analyze the provided image and generate a highly detailed image generation prompt in ENGLISH.
DO NOT include any conversational filler, greetings, or explanations. Output ONLY the requested sections.

Analyze the image and provide the following sections exactly as formatted below:

WARDROBE / OUTFIT MALE:
[Describe the male outfit based on the image. If the image only contains a female, invent a matching male outfit in the exact same style/theme. Do not explain your reasoning, just describe the outfit.]

WARDROBE / OUTFIT FEMALE:
[Describe the female outfit based on the image. If the image only contains a male, invent a matching female outfit in the exact same style/theme. Do not explain your reasoning, just describe the outfit.]

ENVIRONMENT & BACKGROUND:
[Describe the setting, background elements, and atmosphere]

LIGHTING & COLOR:
[Describe the lighting setup, color palette, and mood]

STYLE IMAGE:
[Describe the artistic style, e.g., photorealistic, cinematic, 35mm photography, etc.]

CAMERA & COMPOSITION:
[Describe the camera angle, shot type, lens, and composition]`;

      const mandatoryPrefix = `AUTO-DETECT SUBJECT (MANDATORY)
Detect all human subjects automatically (single person, friends, family, or group).
Apply the transformation evenly.

Ensure:
All faces are visible
try to make the image of the face exactly like the original
keep it if someone is wearing glasses, hijab, or head accessories,s

`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: createFromImageFile.type,
            }
          },
          "Generate a detailed prompt based on this image following the system instructions. Output ONLY the requested sections in English."
        ],
        config: {
          systemInstruction: systemInstruction,
        }
      });

      const generatedPrompt = mandatoryPrefix + (response.text || '').trim();

      const newId = crypto.randomUUID();
      let thumbUrl = 'https://picsum.photos/seed/' + newId.substring(0, 8) + '/300/500';
      
      if (eventId && createFromImageFile) {
         try {
            const fileExt = createFromImageFile.name.split('.').pop() || 'jpg';
            const folderName = settings.storage_folder || eventId;
            const fileName = `${folderName}/assets/thumbnail-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
              .from('photobooth')
              .upload(fileName, createFromImageFile, { upsert: true });
            
            if (!uploadError) {
               const { data: { publicUrl } } = supabase.storage
                 .from('photobooth')
                 .getPublicUrl(fileName);
               thumbUrl = publicUrl;
            }
         } catch (e) {
            console.error("Failed to upload thumbnail", e);
         }
      }

      const newConcept: Concept = {
        id: newId,
        concept_id: 'smart_' + newId,
        name: createFromImageName,
        prompt: generatedPrompt,
        thumbnail: thumbUrl,
        refImage: undefined
      };
      
      setLocalConcepts(prev => [...prev, newConcept]);
      setShowCreateFromImageModal(false);
      setCreateFromImageName('');
      setCreateFromImageFile(null);
      setCreateFromImagePreview(null);

      await showDialog('alert', 'Success', 'Please Save and try this concept. If it is OK, do not forget to upload the image preview thumbnail for the guest to see on the concept page.\n\nSilakan Save dan coba konsep ini, jika sudah ok jangan lupa untuk upload image preview thumbnail nya untuk preview ketika tamu memilih di halaman konsep.');

    } catch (error) {
      console.error("Error creating from image:", error);
      await showDialog('alert', 'Error', 'Failed to generate prompt from image. Please try again.');
    } finally {
      setIsCreatingFromImage(false);
    }
  };

  const handleAddConcept = () => {
    const newId = crypto.randomUUID();
    const newConcept: Concept = {
      id: newId,
      concept_id: newId,
      name: 'NEW CONCEPT',
      prompt: '',
      thumbnail: 'https://picsum.photos/seed/' + newId.substring(0, 8) + '/300/500'
    };
    setLocalConcepts(prev => {
      const newList = [...prev, newConcept];
      setEditingConceptIndex(newList.length - 1);
      return newList;
    });
    if (isActive && tourType === 'concept' && stepIndex === 2) {
      setTourState({ stepIndex: 3 });
    }
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

  const handleRefImageChange2 = (index: number, base64: string) => {
    setLocalConcepts(prev => prev.map((c, i) => i === index ? { ...c, refImage2: base64 } : c));
  };

  const [isEnhancing, setIsEnhancing] = useState<number | null>(null);

  const handleEnhancePrompt = async (index: number) => {
    const concept = localConcepts[index];
    if (!concept || !concept.prompt.trim()) return;

    setIsEnhancing(index);
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API Key not configured");
      }
      const ai = new GoogleGenAI({ apiKey });
      const model = ai.models;
      const hasRefImage = !!concept.refImage;
      const systemInstruction = `You are an expert prompt engineer for photorealistic AI image generation. 
Your task is to take a simple user prompt and enhance it into a highly detailed, descriptive, and optimized prompt.
${hasRefImage ? 'The user has provided a reference image. Ensure the prompt explicitly mentions integrating the subject with the style, clothing, or environment of the reference image.' : ''}
Keep the core intent of the original prompt but add details about lighting, camera angle, texture, and photorealism.

CRITICAL INSTRUCTIONS TO INCLUDE IN THE ENHANCED PROMPT:
- Deteksi semua subjek manusia dalam foto (1 orang, pasangan, atau grup)
- Terapkan transformasi ke SELURUH subjek yang terdeteksi. Semua subjek diperlakukan setara.
- Pertahankan wajah asli setiap subjek 100%. Struktur wajah, warna kulit, usia, gender, dan ekspresi tetap natural.
- Jika subjek memakai hijab, PERTAHANKAN hijab. Jika subjek TIDAK memakai hijab, JANGAN menambahkan hijab.
- Jika subjek memakai kacamata, PERTAHANKAN kacamata. Jika subjek TIDAK memakai kacamata, JANGAN menambahkan kacamata.

Output ONLY the enhanced prompt text, nothing else.`;

      let contents: any = concept.prompt;
      
      if (hasRefImage && concept.refImage) {
        try {
          const imgResponse = await fetch(concept.refImage);
          const blob = await imgResponse.blob();
          
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64String = reader.result as string;
              resolve(base64String.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          contents = {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: blob.type || 'image/jpeg'
                }
              },
              {
                text: concept.prompt
              }
            ]
          };
        } catch (imgErr) {
          console.warn("Failed to fetch reference image for prompt enhancement:", imgErr);
        }
      }

      const response = await model.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });
      
      const enhancedPrompt = response.text?.trim();
      if (enhancedPrompt) {
        handleConceptChange(index, 'prompt', enhancedPrompt);
        if (isActive && tourType === 'concept' && stepIndex === 5) {
          setTourState({ stepIndex: 6 });
        }
      }
    } catch (err) {
      console.error("Failed to enhance prompt:", err);
      await showDialog('alert', 'Error', 'Failed to enhance prompt. Please check your API key or try again.');
    } finally {
      setIsEnhancing(null);
    }
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

  const handleRemoveRefImage2 = (index: number) => {
    setLocalConcepts(prev => prev.map((c, i) => {
       if (i === index) {
          const { refImage2, ...rest } = c;
          return rest as Concept;
       }
       return c;
    }));
  };

  const handleUploadAsset = async (file: File, type: 'thumbnail' | 'refImage' | 'refImage2', index: number) => {
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
        } else if (type === 'refImage') {
          handleRefImageChange(index, publicUrl);
        } else if (type === 'refImage2') {
          handleRefImageChange2(index, publicUrl);
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
        } else if (type === 'refImage') {
          handleRefImageChange(index, reader.result as string);
        } else if (type === 'refImage2') {
          handleRefImageChange2(index, reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSyncConcepts = async () => {
    const hasEmptyPrompt = localConcepts.some(c => !c.prompt || c.prompt.trim() === '');
    if (hasEmptyPrompt) {
      await showDialog('alert', 'Warning', 'Please write your concept in the prompt box to save it.');
      return;
    }

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
        // Helper to check if string is a valid UUID
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

        // Fix any invalid UUIDs in local concepts before saving to Supabase
        const fixedLocalConcepts = localConcepts.map(c => {
          if (!isUUID(c.id)) {
            return { ...c, id: crypto.randomUUID() };
          }
          return c;
        });

        // Update local state with fixed IDs
        setLocalConcepts(fixedLocalConcepts);
        onSaveConcepts(fixedLocalConcepts);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Fetch the event's vendor_id to ensure concepts are saved under the correct vendor
        // even if a super admin is the one editing them.
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('vendor_id')
          .eq('id', eventId)
          .single();
          
        if (eventError) throw eventError;
        const vendorId = eventData?.vendor_id || user.id;

        const conceptsToSave = fixedLocalConcepts.map(c => {
          const payload: any = {
            id: c.id,
            concept_id: c.concept_id || null,
            vendor_id: vendorId,
            event_id: eventId,
            name: c.name,
            prompt: c.prompt,
            thumbnail: c.thumbnail,
            ref_image: c.refImage || (c as any).ref_image || null,
            ref_image_2: c.refImage2 || (c as any).ref_image_2 || null,
            reference_image_split: c.reference_image_split || null,
            reference_image_bg: c.reference_image_bg || null,
            style_preset: c.style_preset || null
          };
          return payload;
        });

        // Get existing concepts from DB to find which ones to delete
        const { data: existingConcepts } = await supabase
          .from('concepts')
          .select('id')
          .eq('event_id', eventId);

        const localConceptIds = fixedLocalConcepts.map(c => c.id);
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

        // Fetch back to get generated UUIDs
        const { data: refreshedConcepts, error: refreshError } = await supabase
          .from('concepts')
          .select('*')
          .eq('event_id', eventId);

        if (!refreshError && refreshedConcepts) {
          const mapped = refreshedConcepts.map(c => ({
            id: c.id,
            concept_id: c.concept_id || c.id,
            name: c.name,
            prompt: c.prompt,
            thumbnail: c.thumbnail,
            refImage: c.ref_image || undefined,
            refImage2: c.ref_image_2 || undefined,
            reference_image_split: c.reference_image_split || undefined,
            reference_image_bg: c.reference_image_bg || undefined,
            style_preset: c.style_preset || undefined
          }));
          setLocalConcepts(mapped);
          onSaveConcepts(mapped);
        }

        await showDialog('alert', 'Success', 'SUCCESS: Concepts saved locally AND synced to Database.');
      } else {
        const ok = await saveConceptsToGas(localConcepts, adminPin);
        
        if (ok) {
          await showDialog('alert', 'Success', 'SUCCESS: Concepts saved locally AND synced to Cloud (GAS).');
        } else {
          await showDialog('alert', 'Warning', 'WARNING: Concepts saved LOCALLY only. Cloud sync failed (Data might be too large), but items are safe on this machine.');
        }
      }
    } catch (e: any) {
        await showDialog('alert', 'Warning', 'Local save successful. Cloud error: ' + (e.message || JSON.stringify(e)));
    } finally {
      setIsSavingConcepts(false);
      if (isActive && tourType === 'concept' && stepIndex === 6) {
        setTourState({ isActive: false, tourType: null, stepIndex: 0 });
      }
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {localConcepts.map((concept, index) => {
          const isTemplateOrSmart = concept.concept_id?.startsWith('template_') || 
                                    concept.id.startsWith('template_') || 
                                    concept.concept_id?.startsWith('smart_') || 
                                    concept.id.startsWith('smart_') ||
                                    concept.concept_id?.startsWith('concept_studio_') ||
                                    concept.id.startsWith('concept_studio_');

          return (
          <div key={concept.id} onClick={() => setEditingConceptIndex(index)} className={`glass-card relative group rounded-xl overflow-hidden border border-white/10 aspect-[3/4] flex flex-col cursor-pointer hover:border-[#bc13fe]/50 hover:shadow-[0_0_20px_rgba(188,19,254,0.2)] transition-all ${index === localConcepts.length - 1 ? 'tour-thumbnail' : ''}`}>
               <img src={concept.thumbnail} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
               
               <button 
                 onClick={(e) => { e.stopPropagation(); handleDeleteConcept(index); }} 
                 className="absolute top-2 right-2 text-white/50 hover:text-red-500 bg-black/50 hover:bg-black/80 backdrop-blur-md transition-colors p-2 z-20 rounded-full"
                 title="Delete Concept"
               >
                 <Trash2 className="w-4 h-4" />
               </button>

               <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col gap-1 z-10 w-full">
                 <h3 className="text-white font-bold text-sm truncate drop-shadow-md w-full">{concept.name || 'Untitled'}</h3>
                 <p className="text-white/60 text-[9px] uppercase font-bold tracking-wider truncate w-full">{isTemplateOrSmart ? 'Template / AI' : 'Custom Concept'}</p>
               </div>
               
               <div className="absolute inset-0 bg-[#bc13fe]/0 group-hover:bg-[#bc13fe]/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 z-0">
                  <div className="bg-black/80 text-white rounded-full p-3 transform translate-y-4 group-hover:translate-y-0 shadow-xl transition-all">
                     <Edit className="w-5 h-5" />
                  </div>
               </div>
          </div>
        )})}

        <div onClick={() => setShowCreationSelectionModal(true)} className="glass-card flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-white/20 hover:border-[#bc13fe]/50 hover:bg-[#bc13fe]/5 transition-all cursor-pointer min-h-[200px] tour-create-own group">
           <div className="bg-white/5 rounded-full p-4 text-white group-hover:scale-110 group-hover:text-[#bc13fe] transition-all">
              <Plus className="w-6 h-6" />
           </div>
           <div className="text-center px-4">
              <h3 className="font-bold text-xs mb-1 uppercase tracking-wider group-hover:text-[#bc13fe] transition-colors">Add Concept</h3>
              <p className="text-[9px] text-gray-500">Choose method</p>
           </div>
        </div>
      </div>

      {/* CONCEPT EDITING MODAL */}
      {editingConceptIndex !== null && localConcepts[editingConceptIndex] && (() => {
        const index = editingConceptIndex;
        const concept = localConcepts[index];
        const isTemplateOrSmart = concept.concept_id?.startsWith('template_') || 
                                  concept.id.startsWith('template_') || 
                                  concept.concept_id?.startsWith('smart_') || 
                                  concept.id.startsWith('smart_') ||
                                  concept.concept_id?.startsWith('concept_studio_') ||
                                  concept.id.startsWith('concept_studio_');

        return (
         <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingConceptIndex(null)}></div>
            <div className="relative bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
               <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#111]/80 backdrop-blur-md z-10 shrink-0">
                  <h2 className="text-lg font-bold">Edit Concept</h2>
                  <button onClick={() => setEditingConceptIndex(null)} className="text-gray-400 hover:text-white transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>
               
               <div className="p-4 overflow-y-auto custom-scrollbar flex flex-col gap-6 flex-1">
                 {/* TITLE & TEXT INPUTS */}
                 <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-400">CONCEPT NAME</label>
                    <input 
                       className="bg-black/50 border border-white/10 p-3 rounded-lg font-heading text-base font-bold text-white outline-none focus:border-[#bc13fe] w-full transition-colors" 
                       value={concept.name} 
                       onChange={e => handleConceptChange(index, 'name', e.target.value)} 
                       placeholder="E.g. Neon Cyberpunk"
                    />
                 </div>

                 <div className="flex flex-col sm:flex-row gap-6">
                    {/* THUMBNAIL */}
                    <div className={`flex flex-col gap-2 w-full sm:w-[120px] shrink-0 ${index === localConcepts.length - 1 ? 'tour-thumbnail' : ''}`}>
                      <label className="text-xs font-bold text-gray-400">THUMBNAIL</label>
                      <div className="w-full sm:w-[120px] aspect-[3/4] bg-black/50 border border-dashed border-white/20 rounded-lg overflow-hidden relative group/thumb shadow-lg">
                         {concept.thumbnail ? (
                           <img src={concept.thumbnail} className="w-full h-full object-cover" />
                         ) : (
                           <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                             <Plus className="w-6 h-6 mb-1" />
                             <span className="text-[10px]">Upload</span>
                           </div>
                         )}
                         <label className="absolute inset-0 bg-[#bc13fe]/80 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity text-center px-2">
                            UPLOAD
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                  if (file.size > 1024 * 1024) {
                                     await showDialog('alert', 'Error', "File too large! Max size is 1MB.");
                                     return;
                                  }
                                  setIsSavingConcepts(true);
                                  await handleUploadAsset(file, 'thumbnail', index);
                                  setIsSavingConcepts(false);
                               }
                            }} />
                         </label>
                      </div>
                    </div>

                    {/* REFERENCE IMAGES (NEW) - HIDDEN FOR TEMPLATES/SMART */}
                    {!isTemplateOrSmart ? (
                      <div className={`flex flex-col gap-2 flex-1 ${index === localConcepts.length - 1 ? 'tour-reference' : ''}`}>
                        <label className="text-xs font-bold text-gray-400">REFERENCES (OPTIONAL)</label>
                        <div className="flex gap-3">
                          <div className="flex flex-col gap-1.5 flex-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase">Image 1 (Style/Pose)</span>
                            <div className="w-full aspect-square bg-black/50 border border-dashed border-white/20 rounded-lg overflow-hidden relative group/ref shadow-lg flex items-center justify-center">
                               {concept.refImage ? (
                                  <>
                                     <img src={concept.refImage} className="w-full h-full object-cover" />
                                     <button 
                                        onClick={() => handleRemoveRefImage(index)}
                                        className="absolute top-1 right-1 bg-red-600 rounded-full p-1 flex items-center justify-center text-white z-20 hover:scale-110"
                                     >
                                        <X className="w-3 h-3" />
                                     </button>
                                  </>
                               ) : (
                                  <span className="text-[10px] text-white/30 text-center px-2">Ref 1</span>
                               )}
                               
                               <label className="absolute inset-0 bg-blue-600/80 opacity-0 group-hover/ref:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity text-center px-1 z-10">
                                  UPLOAD
                                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                     const file = e.target.files?.[0];
                                     if (file) {
                                        if (file.size > 2 * 1024 * 1024) {
                                           await showDialog('alert', 'Error', "File too large! Max size is 2MB.");
                                           return;
                                        }
                                        setIsSavingConcepts(true);
                                        await handleUploadAsset(file, 'refImage', index);
                                        setIsSavingConcepts(false);
                                     }
                                  }} />
                               </label>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5 flex-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase">Image 2 (Clothes/BG)</span>
                            <div className="w-full aspect-square bg-black/50 border border-dashed border-white/20 rounded-lg overflow-hidden relative group/ref2 shadow-lg flex items-center justify-center">
                               {concept.refImage2 ? (
                                  <>
                                     <img src={concept.refImage2} className="w-full h-full object-cover" />
                                     <button 
                                        onClick={() => handleRemoveRefImage2(index)}
                                        className="absolute top-1 right-1 bg-red-600 rounded-full p-1 flex items-center justify-center text-white z-20 hover:scale-110"
                                     >
                                        <X className="w-3 h-3" />
                                     </button>
                                  </>
                               ) : (
                                  <span className="text-[10px] text-white/30 text-center px-2">Ref 2</span>
                               )}
                               
                               <label className="absolute inset-0 bg-blue-600/80 opacity-0 group-hover/ref2:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity text-center px-1 z-10">
                                  UPLOAD
                                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                     const file = e.target.files?.[0];
                                     if (file) {
                                        if (file.size > 2 * 1024 * 1024) {
                                           await showDialog('alert', 'Error', "File too large! Max size is 2MB.");
                                           return;
                                        }
                                        setIsSavingConcepts(true);
                                        await handleUploadAsset(file, 'refImage2', index);
                                        setIsSavingConcepts(false);
                                     }
                                  }} />
                               </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 bg-black/40 border border-white/10 rounded-lg flex flex-col items-center justify-center p-4 text-center min-h-[140px]">
                         <Sparkles className="w-8 h-8 text-[#bc13fe]/50 mb-2" />
                         <span className="text-sm font-heading font-bold uppercase tracking-widest text-white/70">
                            {(concept.concept_id?.startsWith('smart_') || concept.id.startsWith('smart_')) ? 'AI GENERATED' : 'TEMPLATE'}
                         </span>
                         <p className="text-[10px] text-gray-500 mt-2">Locked simple prompt.</p>
                      </div>
                    )}
                 </div>
                  
                 {/* PROMPT OR TEMPLATE PLACEHOLDER */}
                 <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-400">PROMPT</label>
                    {!isTemplateOrSmart && (
                      <div className={`w-full flex flex-col gap-2 ${index === localConcepts.length - 1 ? 'tour-prompt' : ''}`}>
                        <textarea 
                           className="bg-black/50 border border-white/10 p-3 text-[11px] font-mono h-28 text-white outline-none focus:border-white/30 resize-y w-full rounded-lg custom-scrollbar" 
                           value={concept.prompt} 
                           onChange={e => handleConceptChange(index, 'prompt', e.target.value)} 
                           placeholder="Describe the aesthetic, background, mood, lighting..."
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
                          <span className="text-[10px] text-gray-500">Click to optimize -&gt;</span>
                          <button
                            onClick={() => handleEnhancePrompt(index)}
                            disabled={isEnhancing === index || !concept.prompt.trim()}
                            className={`bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${index === localConcepts.length - 1 ? 'tour-optimize-prompt' : ''}`}
                          >
                            {isEnhancing === index ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                            AUTO OPTIMIZE
                          </button>
                        </div>
                      </div>
                    )}
                 </div>

                 {/* SAVE/CLOSE MODAL ACTION */}
                 <div className="border-t border-white/10 pt-4 mt-2">
                    <button 
                       onClick={() => setEditingConceptIndex(null)}
                       className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                       Done Editing
                    </button>
                 </div>
               </div>
            </div>
         </div>
        )
      })()}

      {/* CREATION SELECTION MODAL */}
      {showCreationSelectionModal && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowCreationSelectionModal(false)}></div>
          <div className="relative bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-lg flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#111]/80 backdrop-blur-md z-10 shrink-0">
               <h2 className="text-xl font-bold">Add Concept</h2>
               <button onClick={() => setShowCreationSelectionModal(false)} className="text-gray-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
               {/* 1. Create Your Own (Scratch) */}
               <button 
                  onClick={() => {
                     setShowCreationSelectionModal(false);
                     handleAddConcept();
                  }}
                  className="w-full text-left bg-black/40 hover:bg-[#bc13fe]/20 border border-white/5 hover:border-[#bc13fe]/50 p-4 rounded-xl transition-all group flex items-start gap-4"
               >
                  <div className="bg-white/10 group-hover:bg-[#bc13fe]/30 rounded-lg p-3 text-white group-hover:text-[#bc13fe] transition-colors">
                     <Plus className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-[#bc13fe] transition-colors">Create Your Own Concept</h3>
                     <p className="text-xs text-gray-500 mt-1">Start from scratch with your own prompt, style, and reference images.</p>
                  </div>
               </button>

               {/* 2. Create from AI Image */}
               <button 
                  onClick={() => {
                     setShowCreationSelectionModal(false);
                     setShowCreateFromImageModal(true);
                  }}
                  className="w-full text-left bg-black/40 hover:bg-blue-500/20 border border-white/5 hover:border-blue-500/50 p-4 rounded-xl transition-all group flex items-start gap-4"
               >
                  <div className="bg-white/10 group-hover:bg-blue-500/30 rounded-lg p-3 text-white group-hover:text-blue-400 transition-colors">
                     <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-blue-400 transition-colors">Create by AI Image</h3>
                     <p className="text-xs text-gray-500 mt-1">Upload a reference, and let Gemini AI write the perfect prompt for you.</p>
                  </div>
               </button>

               {/* 3. Create in Concept Studio */}
               <button 
                  onClick={() => {
                     setShowCreationSelectionModal(false);
                     navigate('/dashboard?tab=studio');
                  }}
                  className="w-full text-left bg-black/40 hover:bg-amber-500/20 border border-white/5 hover:border-amber-500/50 p-4 rounded-xl transition-all group flex items-start gap-4"
               >
                  <div className="bg-white/10 group-hover:bg-amber-500/30 rounded-lg p-3 text-white group-hover:text-amber-400 transition-colors">
                     <Edit className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-amber-400 transition-colors">Create in Concept Studio</h3>
                     <p className="text-xs text-gray-500 mt-1">Go to the Studio to experiment, test generation, and save templates.</p>
                  </div>
               </button>

               {/* 4. Select by Template */}
               <button 
                  onClick={() => {
                     setShowCreationSelectionModal(false);
                     handleOpenTemplateModal();
                  }}
                  className="w-full text-left bg-black/40 hover:bg-[#bc13fe]/20 border border-white/5 hover:border-[#bc13fe]/50 p-4 rounded-xl transition-all group flex items-start gap-4"
               >
                  <div className="bg-white/10 group-hover:bg-[#bc13fe]/30 rounded-lg p-3 text-white group-hover:text-[#bc13fe] transition-colors">
                     <Palette className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-[#bc13fe] transition-colors">Select by Template</h3>
                     <p className="text-xs text-gray-500 mt-1">Load ready-to-use concepts from the global or your personal gallery.</p>
                  </div>
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Create From Image Modal */}
      {showCreateFromImageModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowCreateFromImageModal(false)}></div>
          <div className="relative bg-[#111]/80 backdrop-blur-md border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#111]/80 backdrop-blur-md z-10">
              <h2 className="text-xl font-bold">Create from AI Image</h2>
              <button onClick={() => setShowCreateFromImageModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Concept Name</label>
                <input 
                  type="text" 
                  value={createFromImageName}
                  onChange={(e) => setCreateFromImageName(e.target.value)}
                  placeholder="E.g. Cyberpunk Neon"
                  className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-[#bc13fe]/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Upload AI Image</label>
                <div className="w-full aspect-video bg-black/50 border-2 border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group">
                  {createFromImagePreview ? (
                    <>
                      <img src={createFromImagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-bold">Change Image</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <Plus className="w-8 h-8 mb-2" />
                      <span className="text-sm">Click to upload</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setCreateFromImageFile(file);
                        const reader = new FileReader();
                        reader.onload = (e) => setCreateFromImagePreview(e.target?.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>

              <button 
                onClick={handleCreateFromImage}
                disabled={isCreatingFromImage || !createFromImageName.trim() || !createFromImageFile}
                className="w-full py-4 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
              >
                {isCreatingFromImage ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    GENERATING PROMPT...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    CREATE FROM AI IMAGE
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Concept Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => {
            setShowTemplateModal(false);
            if (isActive && tourType === 'concept' && stepIndex === 1) {
              setTourState({ stepIndex: 2 });
            }
          }}></div>
          <div className="relative bg-[#111]/80 backdrop-blur-md border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden tour-template-modal">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#111]/80 backdrop-blur-md z-10">
              <h2 className="text-xl font-bold">Load Template Concept</h2>
              <button onClick={() => {
                setShowTemplateModal(false);
                if (isActive && tourType === 'concept' && stepIndex === 1) {
                  setTourState({ stepIndex: 2 });
                }
              }} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-white/10">
              <button
                className={`flex-1 py-3 text-sm font-bold transition-colors ${templateTab === 'superadmin' ? 'text-[#bc13fe] border-b-2 border-[#bc13fe]' : 'text-gray-400 hover:text-white'}`}
                onClick={() => setTemplateTab('superadmin')}
              >
                Coroai Templates
              </button>
              <button
                className={`flex-1 py-3 text-sm font-bold transition-colors ${templateTab === 'mine' ? 'text-[#bc13fe] border-b-2 border-[#bc13fe]' : 'text-gray-400 hover:text-white'}`}
                onClick={() => setTemplateTab('mine')}
              >
                My Templates
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {loadingTemplates ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#bc13fe]" />
                </div>
              ) : templateTab === 'superadmin' ? (
                templateConcepts.length === 0 ? (
                  <div 
                    className="text-center py-12 text-gray-500 tour-load-template cursor-pointer"
                    onClick={() => {
                      setShowTemplateModal(false);
                      if (isActive && tourType === 'concept' && stepIndex === 1) {
                        setTourState({ stepIndex: 2 });
                      }
                    }}
                  >
                    <p>No superadmin templates available.</p>
                    <p className="text-sm mt-2">Super Admin can create templates in their dashboard.</p>
                    <p className="text-xs mt-4 text-[#bc13fe]">Click here to close and continue tour</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {templateConcepts.map(template => (
                      <div key={template.id} className="bg-black/30 border border-white/5 rounded-xl overflow-hidden group hover:border-[#bc13fe]/50 transition-colors flex flex-col">
                        <div className="aspect-square relative">
                          <img src={template.thumbnail} alt={template.name} className="w-full h-full object-cover" />
                          {template.ref_image && (
                            <div className="absolute top-2 right-2 bg-black/80 text-[9px] px-1.5 py-0.5 rounded border border-white/10">
                              + Ref
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex flex-col flex-1">
                          <h3 className="font-bold text-xs mb-1 truncate" title={template.name}>{template.name}</h3>
                          <p className="text-[9px] text-gray-500 mb-3 flex-1 italic">TEMPLATE</p>
                          <button
                            onClick={() => handleUseTemplate(template, 'old')}
                            className="w-full py-1.5 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-md text-[10px] font-bold transition-colors tour-load-template"
                          >
                            LOAD
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                conceptTemplates.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No templates found.</p>
                    <p className="text-sm mt-2">Create your own templates in the Concept Studio.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {conceptTemplates.map(template => (
                      <div key={template.id} className="bg-black/30 border border-white/5 rounded-xl overflow-hidden group hover:border-[#bc13fe]/50 transition-colors flex flex-col">
                        <div className="aspect-square relative">
                          <img src={template.reference_image_split || template.reference_image_bg || 'https://picsum.photos/seed/concept/300/500'} alt={template.name} className="w-full h-full object-cover" />
                          {(template.reference_image_split || template.reference_image_bg) && (
                            <div className="absolute top-2 right-2 bg-black/80 text-[9px] px-1.5 py-0.5 rounded border border-white/10">
                              + Ref
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex flex-col flex-1">
                          <h3 className="font-bold text-xs mb-1 truncate" title={template.name}>{template.name}</h3>
                          <p className="text-[9px] text-gray-500 mb-3 flex-1 italic">{template.style_preset || 'TEMPLATE'}</p>
                          <button
                            onClick={() => handleUseTemplate(template, 'new')}
                            className="w-full py-1.5 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-md text-[10px] font-bold transition-colors"
                          >
                            LOAD
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminConceptsTab;
