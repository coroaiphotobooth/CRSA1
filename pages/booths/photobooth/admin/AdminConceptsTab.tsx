import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Concept, PhotoboothSettings, TemplateConcept, ConceptTemplate } from '../../../../types';
import { saveConceptsToGas } from '../../../../lib/appsScript';
import { supabase } from '../../../../lib/supabase';
import { useDialog } from '../../../../components/DialogProvider';
import { Loader2, Sparkles, Plus, X, Palette, Trash2, Edit, GripHorizontal, Save, Upload } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { CONCEPT_DESIGNER_SYSTEM_PROMPT } from '../../../../lib/gemini';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getEnhancedPrompt } from '../../../../lib/promptEnhancer';

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

// Sortable Concept Card Component
interface SortableConceptCardProps {
  concept: Concept;
  index: number;
  totalConcepts: number;
  onEdit: (index: number, slots: number) => void;
  onDelete: (index: number) => void;
}

const SortableConceptCard: React.FC<SortableConceptCardProps> = ({ concept, index, totalConcepts, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: concept.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  const isTemplateOrSmart = concept.concept_id?.startsWith('template_') || 
                            concept.id.startsWith('template_') || 
                            concept.concept_id?.startsWith('smart_') || 
                            concept.id.startsWith('smart_') ||
                            concept.concept_id?.startsWith('concept_studio_') ||
                            concept.id.startsWith('concept_studio_');

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`glass-card relative group rounded-xl overflow-hidden border ${isDragging ? 'border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.4)] scale-105' : 'border-white/10 hover:border-[#bc13fe]/50 hover:shadow-[0_0_20px_rgba(188,19,254,0.2)]'} aspect-[3/4] flex flex-col transition-colors ${index === totalConcepts - 1 ? 'tour-thumbnail' : ''}`}
    >
      {/* Drag Handle */}
      <div 
        {...attributes} 
        {...listeners} 
        className="absolute top-2 left-2 z-30 p-2 bg-black/50 hover:bg-black/80 rounded flex items-center justify-center text-white/50 hover:text-white backdrop-blur-md cursor-grab active:cursor-grabbing"
      >
        <GripHorizontal className="w-4 h-4" />
      </div>

      <div className="absolute inset-0 cursor-pointer" onClick={() => {
          let slots = 1;
          if (concept.reference_image_bg) slots = 3;
          else if (concept.reference_image_split) slots = 2;
          onEdit(index, Math.max(1, slots));
      }}>
        <img src={concept.thumbnail} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
        
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

      {/* Delete Button */}
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(index); }} 
        className="absolute top-2 right-2 text-white/50 hover:text-red-500 bg-black/50 hover:bg-black/80 backdrop-blur-md transition-colors p-2 z-20 rounded-full"
        title="Delete Concept"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

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

  // Visible Reference Slots logic
  const [visibleRefSlots, setVisibleRefSlots] = useState<number>(1);

  // Create from Image State
  const [showCreateFromImageModal, setShowCreateFromImageModal] = useState(false);
  const [createFromImageName, setCreateFromImageName] = useState('');
  const [createFromImageFile, setCreateFromImageFile] = useState<File | null>(null);
  const [createFromImagePreview, setCreateFromImagePreview] = useState<string | null>(null);
  const [isCreatingFromImage, setIsCreatingFromImage] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Concept Studio Modal local state
  const [showCSModal, setShowCSModal] = useState(false);
  const [csName, setCsName] = useState('');
  const [csManOutfit, setCsManOutfit] = useState<File | null>(null);
  const [csWomanOutfit, setCsWomanOutfit] = useState<File | null>(null);
  const [csBackground, setCsBackground] = useState<File | null>(null);
  const [csStyle, setCsStyle] = useState('3D Render (recommended)');
  const [csComposition, setCsComposition] = useState('Full Body');
  const [isCsGenerating, setIsCsGenerating] = useState(false);

  // Edit Modal State
  const [editingConceptIndex, setEditingConceptIndex] = useState<number | null>(null);
  const [confirmEnhanceIndex, setConfirmEnhanceIndex] = useState<number | null>(null);

  // AI Edit Concept State
  const [showAiEdit, setShowAiEdit] = useState(false);
  const [aiEditInstruction, setAiEditInstruction] = useState('');
  const [isAiEditing, setIsAiEditing] = useState(false);

  useEffect(() => {
    setIsDirty(JSON.stringify(localConcepts) !== JSON.stringify(concepts));
  }, [localConcepts, concepts]);

  useEffect(() => {
    setShowAiEdit(false);
    setAiEditInstruction('');
    setIsAiEditing(false);
  }, [editingConceptIndex]);

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
      
      const systemInstruction = CONCEPT_DESIGNER_SYSTEM_PROMPT;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: createFromImageFile.type,
            }
          },
          "Generate a detailed photobooth concept prompt based on this image following the system instructions. Pay very close attention to the visual style of the reference image (e.g., photorealistic, cinematic, 3D render, illustration, anime, vintage, etc.). Ensure the generated prompt explicitly instructs the image generator to accurately reproduce this specific style, lighting, texture, and mood. Output ONLY the finalized prompt sections."
        ],
        config: {
          systemInstruction: systemInstruction,
        }
      });

      const generatedPrompt = (response.text || '').trim();

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

  const csStitchImages = async (img1File: File, img2File: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img1 = new Image();
      const img2 = new Image();
      let loaded = 0;

      const onload = () => {
        loaded++;
        if (loaded === 2) {
          const canvas = document.createElement('canvas');
          const targetHeight = 1024;
          const img1Width = (img1.width / img1.height) * targetHeight;
          const img2Width = (img2.width / img2.height) * targetHeight;
          
          canvas.width = img1Width + img2Width;
          canvas.height = targetHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }
          
          ctx.drawImage(img1, 0, 0, img1Width, targetHeight);
          ctx.drawImage(img2, img1Width, 0, img2Width, targetHeight);
          
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        }
      };

      img1.onload = onload;
      img2.onload = onload;
      img1.onerror = reject;
      img2.onerror = reject;

      img1.src = URL.createObjectURL(img1File);
      img2.src = URL.createObjectURL(img2File);
    });
  };

  const csResizeAndCompressImage = (file: File, maxWidth = 1024): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleCreateWithConceptStudio = async () => {
    if (!csName.trim()) {
      await showDialog('alert', 'Error', 'Please enter a concept name.');
      return;
    }
    
    if (!csBackground && (!csManOutfit && !csWomanOutfit)) {
      await showDialog('alert', 'Error', 'Please upload at least a background or an outfit.');
      return;
    }

    setIsCsGenerating(true);
    try {
      const newId = crypto.randomUUID();
      const folderName = settings.storage_folder || eventId || 'concept_studio';
      let stitchedUrl = '';
      let bgUrl = '';

      if (csManOutfit && csWomanOutfit) {
        const stitchedBase64 = await csStitchImages(csManOutfit, csWomanOutfit);
        const stFileName = `${folderName}/assets/studio-stitched-${Date.now()}.jpg`;
        const stBlob = await (await fetch(stitchedBase64)).blob();
        const { error: err1 } = await supabase.storage.from('photobooth').upload(stFileName, stBlob, { contentType: 'image/jpeg' });
        if (!err1) {
          const { data } = supabase.storage.from('photobooth').getPublicUrl(stFileName);
          stitchedUrl = data.publicUrl;
        }
      } else if (csManOutfit || csWomanOutfit) {
        // Technically concept studio wants both for stitching. If only one is provided, just compress it as the stitched url?
        // Wait, standard Concept Studio logic strictly wants either both outfits OR none.
        // If they provided only one, let's just make it a normal ref image or alert them.
        await showDialog('alert', 'Missing Inputs', 'Please upload both Man and Woman outfits for accurate gender clothing replacement.');
        setIsCsGenerating(false);
        return;
      }

      if (csBackground) {
        const bgBase64 = await csResizeAndCompressImage(csBackground);
        const bgFileName = `${folderName}/assets/studio-bg-${Date.now()}.jpg`;
        const bgBlob = await (await fetch(bgBase64)).blob();
        const { error: err2 } = await supabase.storage.from('photobooth').upload(bgFileName, bgBlob, { contentType: 'image/jpeg' });
        if (!err2) {
          const { data } = supabase.storage.from('photobooth').getPublicUrl(bgFileName);
          bgUrl = data.publicUrl;
        }
      }

      // Generate the enhanced prompt using the same structure as Concept Studio
      const { enhancedStyle, enhancedPrompt } = getEnhancedPrompt('', csStyle, csComposition);
      
      const parts = [];
      parts.push("Redraw the people in the main photo.\nCRITICAL INSTRUCTION:\n1. Analyze the people in the main photo. Count them and identify their genders.\n2. YOU MUST ONLY draw the exact number of people present in the main photo. Do not add any extra people.");
      
      if (stitchedUrl) {
         parts.push("3. Look at the provided reference images. Reference Image 1 is a split image showing a male outfit on the LEFT and a female outfit on the RIGHT.\n4. For EVERY male in the main photo, dress them in the exact outfit shown on the LEFT side of Reference Image 1.\n5. For EVERY female in the main photo, dress them in the exact outfit shown on the RIGHT side of Reference Image 1.");
      }
      if (bgUrl) {
         parts.push(`6. Place them in the exact environment shown in the background reference image (Reference Image ${stitchedUrl ? '2' : '1'}).`);
      }
      parts.push(`Style: ${enhancedStyle}.\nAdditional instructions: A ${csComposition} shot. ${enhancedPrompt}`);

      const mergedPrompt = parts.join('\n');

      const newConcept: Concept = {
        id: newId,
        concept_id: 'concept_studio_' + newId,
        name: csName,
        prompt: mergedPrompt,
        thumbnail: 'https://picsum.photos/seed/' + newId.substring(0, 8) + '/300/500',
        reference_image_split: stitchedUrl || undefined,
        reference_image_bg: bgUrl || undefined,
        style_preset: csStyle
      };

      setLocalConcepts(prev => [...prev, newConcept]);
      
      // Cleanup
      setShowCSModal(false);
      setCsName('');
      setCsManOutfit(null);
      setCsWomanOutfit(null);
      setCsBackground(null);
      setCsStyle('3D Render (recommended)');
      setCsComposition('Full Body');

      await showDialog('alert', 'Success', 'Concept Studio setup added! Please save everything and upload a preview thumbnail when you are ready.');

    } catch (e) {
      console.error("Studio concept error:", e);
    } finally {
      setIsCsGenerating(false);
    }
  };

  const handleAddConcept = () => {
    const newId = crypto.randomUUID();
    const newConcept: Concept = {
      id: newId,
      concept_id: newId,
      name: 'NEW CONCEPT',
      prompt: '',
      thumbnail: 'https://picsum.photos/seed/' + newId.substring(0, 8) + '/300/500',
      ...({ _isNew: true } as any)
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

  const [isSilentlyOptimizing, setIsSilentlyOptimizing] = useState<number | null>(null);

  const handleDoneEditing = async (index: number) => {
    const concept = localConcepts[index];
    const isTemplateOrSmart = concept.id?.startsWith('smart_') || concept.concept_id?.startsWith('smart_') || concept.id?.startsWith('template_') || concept.concept_id?.startsWith('template_') || concept.id?.startsWith('concept_studio_') || concept.concept_id?.startsWith('concept_studio_');

    // If it's a locked AI/Template concept, just close
    if (isTemplateOrSmart) {
      setEditingConceptIndex(null);
      return;
    }

    const promptText = concept.prompt?.trim() || "";
    if (promptText.length === 0) {
      // If it's completely empty, we can't optimize, just close
      setEditingConceptIndex(null);
      return;
    }

    // Always ask if the user wants to enhance the prompt for newly created concepts
    if ((concept as any)._isNew) {
      setLocalConcepts(prev => prev.map((c, i) => i === index ? { ...c, _isNew: false } : c));
      setConfirmEnhanceIndex(index);
    } else {
      setEditingConceptIndex(null);
    }
  };

  const handleSaveAsIs = () => {
    setConfirmEnhanceIndex(null);
    setEditingConceptIndex(null);
  };

  const executeEnhancePrompt = async (index: number) => {
    setConfirmEnhanceIndex(null);
    setIsSilentlyOptimizing(index);
    const originalPrompt = localConcepts[index]?.prompt || "";
    try {
      const concept = localConcepts[index];
      console.log("Enhancing prompt...");
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not configured");
      const ai = new GoogleGenAI({ apiKey });
      
      let contents: any = "Please optimize and structure this prompt perfectly. Return ONLY the final structured prompt and absolutely NOTHING else. No conversational text, no greetings, no explanations.\n\n" + originalPrompt;
      
      const hasAnyRefImage = !!concept.refImage || !!concept.reference_image_split || !!concept.reference_image_bg;
      if (hasAnyRefImage) {
        const parts: any[] = [];
        const pushImagePart = async (url: string) => {
          if (!url) return;
          try {
            const imgResponse = await fetch(url);
            const blob = await imgResponse.blob();
            const base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            parts.push({ inlineData: { data: base64Data, mimeType: blob.type || 'image/jpeg' } });
          } catch (e) {
            console.warn("Silent optimize fetch img error", e);
          }
        };

        if (concept.refImage) await pushImagePart(concept.refImage);
        if (concept.reference_image_split) await pushImagePart(concept.reference_image_split);
        if (concept.reference_image_bg) await pushImagePart(concept.reference_image_bg);
        
        parts.push({ text: originalPrompt });
        contents = { parts };
      }

      handleConceptChange(index, 'prompt', '');

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: CONCEPT_DESIGNER_SYSTEM_PROMPT,
          temperature: 0.7,
        }
      });
      
      let fullText = '';
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        handleConceptChange(index, 'prompt', fullText);
      }
    } catch (err) {
      console.error("Enhancement failed:", err);
      handleConceptChange(index, 'prompt', originalPrompt);
    } finally {
      setIsSilentlyOptimizing(null);
    }
  };

  const handleEnhancePrompt = async (index: number) => {
    const concept = localConcepts[index];
    if (!concept || !concept.prompt.trim()) return;

    setIsEnhancing(index);
    const originalPrompt = concept.prompt;
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API Key not configured");
      }
      const ai = new GoogleGenAI({ apiKey });
      const model = ai.models;
      const hasAnyRefImage = !!concept.refImage || !!concept.reference_image_split || !!concept.reference_image_bg;
      const systemInstruction = CONCEPT_DESIGNER_SYSTEM_PROMPT;

      let contents: any = "Please optimize and structure this prompt perfectly. Return ONLY the final structured prompt and absolutely NOTHING else. No conversational text, no greetings, no explanations.\n\n" + originalPrompt;
      
      if (hasAnyRefImage) {
        try {
          const parts: any[] = [];
          
          // Helper to fetch and push image part
          const pushImagePart = async (url: string) => {
            if (!url) return;
            const imgResponse = await fetch(url);
            const blob = await imgResponse.blob();
            const base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                resolve((reader.result as string).split(',')[1]);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            parts.push({
              inlineData: {
                data: base64Data,
                mimeType: blob.type || 'image/jpeg'
              }
            });
          };

          if (concept.refImage) await pushImagePart(concept.refImage);
          if (concept.reference_image_split) await pushImagePart(concept.reference_image_split);
          if (concept.reference_image_bg) await pushImagePart(concept.reference_image_bg);
          
          parts.push({ text: originalPrompt });
          
          contents = { parts };
        } catch (imgErr) {
          console.warn("Failed to fetch reference images for prompt enhancement:", imgErr);
        }
      }

      handleConceptChange(index, 'prompt', '');

      const responseStream = await model.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });
      
      let fullText = '';
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        handleConceptChange(index, 'prompt', fullText);
      }
      if (isActive && tourType === 'concept' && stepIndex === 5) {
        setTourState({ stepIndex: 6 });
      }
    } catch (err) {
      console.error("Failed to enhance prompt:", err);
      handleConceptChange(index, 'prompt', originalPrompt);
      await showDialog('alert', 'Error', 'Failed to enhance prompt. Please check your API key or try again.');
    } finally {
      setIsEnhancing(null);
    }
  };

  const handleAiEditSmartConcept = async (index: number) => {
    if (!aiEditInstruction.trim()) {
      setShowAiEdit(false);
      return;
    }
    
    setIsAiEditing(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not configured");
      const ai = new GoogleGenAI({ apiKey });
      
      const concept = localConcepts[index];
      const model = ai.models;
      
      const systemInstruction = CONCEPT_DESIGNER_SYSTEM_PROMPT;
      
      let contents: any = `Here is the current photobooth prompt:\n\n${concept.prompt}\n\nThe user wants to edit this concept with the following instruction:\n"${aiEditInstruction}"\n\nPlease rewrite the photobooth prompt applying only the edits requested by the user, while preserving the structure and the rest of the original prompt's aesthetic. Return ONLY the final structured prompt and absolutely NOTHING else. No conversational text.`;
      
      const response = await model.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });
      
      const newPrompt = response.text?.trim();
      if (newPrompt) {
        handleConceptChange(index, 'prompt', newPrompt);
      }
      setAiEditInstruction('');
      setShowAiEdit(false);
    } catch (err) {
      console.error("Failed to edit concept with AI:", err);
      await showDialog('alert', 'Error', 'Failed to edit concept. Please check your API key or try again.');
    } finally {
      setIsAiEditing(false);
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
          const { reference_image_split, ...rest } = c;
          return rest as Concept;
       }
       return c;
    }));
  };

  const handleRemoveRefImage3 = (index: number) => {
    setLocalConcepts(prev => prev.map((c, i) => {
       if (i === index) {
          const { reference_image_bg, ...rest } = c;
          return rest as Concept;
       }
       return c;
    }));
  };

  const handleUploadAsset = async (file: File, type: 'thumbnail' | 'refImage' | 'reference_image_split' | 'reference_image_bg', index: number) => {
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
        } else if (type === 'reference_image_split') {
          handleConceptChange(index, 'reference_image_split', publicUrl);
        } else if (type === 'reference_image_bg') {
          handleConceptChange(index, 'reference_image_bg', publicUrl);
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
        } else if (type === 'reference_image_split') {
          handleConceptChange(index, 'reference_image_split', reader.result as string);
        } else if (type === 'reference_image_bg') {
          handleConceptChange(index, 'reference_image_bg', reader.result as string);
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

        // Fetch the event's vendor_id to ensure concepts are saved under the correct vendor
        // even if a super admin is the one editing them.
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('vendor_id')
          .eq('id', eventId)
          .maybeSingle();
          
        const vendorId = eventData?.vendor_id || user?.id;

        if (!vendorId) {
           throw new Error("No vendor associated with this event and no cloud session active. Cloud sync skipped.");
        }

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalConcepts((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={localConcepts.map(c => c.id)}
            strategy={rectSortingStrategy}
          >
            {localConcepts.map((concept, index) => (
              <SortableConceptCard 
                key={concept.id}
                concept={concept}
                index={index}
                totalConcepts={localConcepts.length}
                onEdit={(idx, slots) => {
                  setVisibleRefSlots(slots);
                  setEditingConceptIndex(idx);
                }}
                onDelete={handleDeleteConcept}
              />
            ))}
          </SortableContext>
        </DndContext>

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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setEditingConceptIndex(null)}></div>
            <div className="relative bg-black/40 backdrop-blur-3xl border border-white/10 ring-1 ring-white/5 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(188,19,254,0.15)]">
               
               {/* Modal Header */}
               <div className="p-4 border-b border-white/5 flex justify-between items-center bg-transparent z-10 shrink-0">
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-[#bc13fe] shadow-[0_0_10px_#bc13fe animate-pulse"></div>
                     <h2 className="text-lg font-heading tracking-wider font-bold text-white/90 uppercase">Edit Concept</h2>
                  </div>
                  <button onClick={() => setEditingConceptIndex(null)} className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-all">
                     <X className="w-4 h-4" />
                  </button>
               </div>
               
               <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-6 flex-1">
                 {/* TITLE & TEXT INPUTS */}
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase">Concept Name</label>
                    <input 
                       className="bg-black/40 border border-white/10 p-3 rounded-xl font-heading text-base font-bold text-white outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe]/50 shadow-inner w-full transition-all" 
                       value={concept.name} 
                       onChange={e => handleConceptChange(index, 'name', e.target.value)} 
                       placeholder="E.g. Neon Cyberpunk"
                    />
                 </div>

                 <div className="flex flex-col sm:flex-row gap-6">
                    {/* THUMBNAIL */}
                    <div className={`flex flex-col gap-2 w-full sm:w-[100px] shrink-0 ${index === localConcepts.length - 1 ? 'tour-thumbnail' : ''}`}>
                      <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase truncate">Thumbnail</label>
                      <div className="w-full sm:w-[100px] aspect-[3/4] bg-white/5 backdrop-blur-md border border-dashed border-white/20 rounded-xl overflow-hidden relative group/thumb shadow-lg transition-all hover:border-[#bc13fe]/50">
                         {concept.thumbnail ? (
                           <img src={concept.thumbnail} className="w-full h-full object-cover" />
                         ) : (
                           <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 group-hover:text-[#bc13fe] transition-colors">
                             <Plus className="w-6 h-6 mb-1" />
                             <span className="text-[10px] tracking-wider uppercase font-bold">Upload</span>
                           </div>
                         )}
                         <label className="absolute inset-0 bg-[#bc13fe]/90 backdrop-blur-sm opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity text-center px-2">
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
                      <div className={`flex flex-col gap-2 flex-1 items-start ${index === localConcepts.length - 1 ? 'tour-reference' : ''}`}>
                         <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase truncate">References (Optional)</label>
                         <p className="text-[10px] text-white/50 leading-relaxed mb-1 max-w-sm">You can upload clothes, backgrounds, products, etc., and say what you want to create, then click optimize.</p>
                         <div className="flex flex-wrap gap-3">
                           {/* REF 1 */}
                           <div className="flex flex-col gap-1 w-[80px]">
                             <span className="text-[8px] text-gray-500 font-bold uppercase truncate tracking-wider text-center" title="Image Reference 1">Ref 1</span>
                             <div className="w-full aspect-square bg-white/5 backdrop-blur-md border border-dashed border-white/20 rounded-xl overflow-hidden relative group/ref shadow-lg flex items-center justify-center transition-all hover:border-blue-500/50">
                                {concept.refImage ? (
                                   <>
                                      <img src={concept.refImage} className="w-full h-full object-cover" />
                                      <button 
                                         onClick={() => handleRemoveRefImage(index)}
                                         className="absolute top-1 right-1 bg-red-600/90 backdrop-blur-sm rounded-full p-1 flex items-center justify-center text-white z-20 hover:scale-110 shadow-lg"
                                      >
                                         <X className="w-2 h-2" />
                                      </button>
                                   </>
                                ) : (
                                   <span className="text-[8px] text-white/30 text-center px-1 font-bold tracking-wider uppercase">Upload</span>
                                )}
                                
                                <label className="absolute inset-0 bg-blue-600/90 backdrop-blur-sm opacity-0 group-hover/ref:opacity-100 flex items-center justify-center cursor-pointer text-[8px] uppercase font-bold text-white transition-opacity text-center px-1 z-10">
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

                           {/* REF 2 */}
                           {visibleRefSlots >= 2 && (
                             <div className="flex flex-col gap-1 w-[80px]">
                               <span className="text-[8px] text-gray-500 font-bold uppercase truncate tracking-wider text-center" title="Image Reference 2">Ref 2</span>
                               <div className="w-full aspect-square bg-white/5 backdrop-blur-md border border-dashed border-white/20 rounded-xl overflow-hidden relative group/ref2 shadow-lg flex items-center justify-center transition-all hover:border-blue-500/50">
                                  {concept.reference_image_split ? (
                                     <>
                                        <img src={concept.reference_image_split} className="w-full h-full object-cover" />
                                        <button 
                                           onClick={() => handleRemoveRefImage2(index)}
                                           className="absolute top-1 right-1 bg-red-600/90 backdrop-blur-sm rounded-full p-1 flex items-center justify-center text-white z-20 hover:scale-110 shadow-lg"
                                        >
                                           <X className="w-2 h-2" />
                                        </button>
                                     </>
                                  ) : (
                                     <span className="text-[8px] text-white/30 text-center px-1 font-bold tracking-wider uppercase">Upload</span>
                                  )}
                                  
                                  <label className="absolute inset-0 bg-blue-600/90 backdrop-blur-sm opacity-0 group-hover/ref2:opacity-100 flex items-center justify-center cursor-pointer text-[8px] uppercase font-bold text-white transition-opacity text-center px-1 z-10">
                                     UPLOAD
                                     <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                           if (file.size > 2 * 1024 * 1024) {
                                              await showDialog('alert', 'Error', "File too large! Max size is 2MB.");
                                              return;
                                           }
                                           setIsSavingConcepts(true);
                                           await handleUploadAsset(file, 'reference_image_split', index);
                                           setIsSavingConcepts(false);
                                        }
                                     }} />
                                  </label>
                               </div>
                             </div>
                           )}

                           {/* REF 3 */}
                           {visibleRefSlots >= 3 && (
                             <div className="flex flex-col gap-1 w-[80px]">
                               <span className="text-[8px] text-gray-500 font-bold uppercase truncate tracking-wider text-center" title="Image Reference 3">Ref 3</span>
                               <div className="w-full aspect-square bg-white/5 backdrop-blur-md border border-dashed border-white/20 rounded-xl overflow-hidden relative group/ref3 shadow-lg flex items-center justify-center transition-all hover:border-blue-500/50">
                                  {concept.reference_image_bg ? (
                                     <>
                                        <img src={concept.reference_image_bg} className="w-full h-full object-cover" />
                                        <button 
                                           onClick={() => handleRemoveRefImage3(index)}
                                           className="absolute top-1 right-1 bg-red-600/90 backdrop-blur-sm rounded-full p-1 flex items-center justify-center text-white z-20 hover:scale-110 shadow-lg"
                                        >
                                           <X className="w-2 h-2" />
                                        </button>
                                     </>
                                  ) : (
                                     <span className="text-[8px] text-white/30 text-center px-1 font-bold tracking-wider uppercase">Upload</span>
                                  )}
                                  
                                  <label className="absolute inset-0 bg-blue-600/90 backdrop-blur-sm opacity-0 group-hover/ref3:opacity-100 flex items-center justify-center cursor-pointer text-[8px] uppercase font-bold text-white transition-opacity text-center px-1 z-10">
                                     UPLOAD
                                     <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                           if (file.size > 2 * 1024 * 1024) {
                                              await showDialog('alert', 'Error', "File too large! Max size is 2MB.");
                                              return;
                                           }
                                           setIsSavingConcepts(true);
                                           await handleUploadAsset(file, 'reference_image_bg', index);
                                           setIsSavingConcepts(false);
                                        }
                                     }} />
                                  </label>
                               </div>
                             </div>
                           )}

                           {/* PLUS BUTTON */}
                           {visibleRefSlots < 3 && (
                             <div className="flex flex-col gap-1 w-[80px]">
                               <span className="text-[8px] text-transparent text-center">Add</span>
                               <button 
                                 onClick={() => setVisibleRefSlots(prev => prev + 1)}
                                 className="w-full aspect-square border border-dashed border-white/20 hover:border-[#bc13fe] bg-white/5 hover:bg-[#bc13fe]/20 backdrop-blur-sm rounded-xl flex items-center justify-center transition-all text-white/50 hover:text-[#bc13fe] shadow-inner"
                               >
                                 <Plus className="w-6 h-6" />
                               </button>
                             </div>
                           )}
                         </div>
                       </div>
                    ) : (
                      <div className="flex-1 bg-black/40 border border-white/10 rounded-lg flex flex-col items-center justify-center p-4 text-center min-h-[140px]">
                         {!showAiEdit ? (
                            <>
                               <Sparkles className="w-8 h-8 text-[#bc13fe]/50 mb-2" />
                               <span className="text-sm font-heading font-bold uppercase tracking-widest text-white/70">
                                  {(concept.concept_id?.startsWith('smart_') || concept.id.startsWith('smart_')) ? 'AI GENERATED' : 'TEMPLATE'}
                               </span>
                               <p className="text-[10px] text-gray-500 mt-2">Locked simple prompt.</p>
                               {(concept.concept_id?.startsWith('smart_') || concept.id.startsWith('smart_') || concept.concept_id?.startsWith('concept_studio_') || concept.id.startsWith('concept_studio_')) && (
                                  <button 
                                     onClick={() => setShowAiEdit(true)}
                                     className="mt-4 text-[10px] bg-white/10 hover:bg-[#bc13fe]/20 text-white hover:text-[#bc13fe] border border-white/20 hover:border-[#bc13fe]/50 px-3 py-1.5 rounded-full uppercase font-bold tracking-wider transition-all flex items-center gap-2"
                                  >
                                     <Edit className="w-3 h-3" /> Edit this concept
                                  </button>
                               )}
                            </>
                         ) : (
                            <div className="w-full flex flex-col gap-2 animate-in fade-in zoom-in duration-300">
                               <label className="text-[10px] text-[#bc13fe] uppercase font-bold tracking-widest text-left">Instruction for AI</label>
                               <textarea 
                                  className="w-full bg-black/60 border border-white/20 focus:border-[#bc13fe] rounded-lg p-3 text-[11px] text-white resize-none outline-none custom-scrollbar transition-all"
                                  placeholder="e.g., Change the suit to red, make the background a cyberpunk city, change object holding to a sword..."
                                  rows={3}
                                  value={aiEditInstruction}
                                  onChange={e => setAiEditInstruction(e.target.value)}
                               />
                               <div className="flex justify-end gap-2 mt-1">
                                  <button 
                                     onClick={() => { setShowAiEdit(false); setAiEditInstruction(''); }}
                                     className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition-colors"
                                     disabled={isAiEditing}
                                  >
                                     Cancel
                                  </button>
                                  <button 
                                     onClick={() => handleAiEditSmartConcept(index)}
                                     disabled={isAiEditing || !aiEditInstruction.trim()}
                                     className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-lg bg-[#bc13fe] hover:bg-purple-500 text-white transition-colors disabled:opacity-50 disabled:grayscale flex items-center gap-2"
                                  >
                                     {isAiEditing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 
                                     {isAiEditing ? 'Editing...' : 'Done Editing'}
                                  </button>
                               </div>
                            </div>
                         )}
                      </div>
                    )}
                 </div>
                  
                 {/* PROMPT OR TEMPLATE PLACEHOLDER */}
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase">Prompt Instructions</label>
                    {!isTemplateOrSmart && (
                      <div className={`w-full flex flex-col gap-2 ${index === localConcepts.length - 1 ? 'tour-prompt' : ''}`}>
                        <textarea 
                           className="bg-black/40 border border-white/10 p-4 text-[11px] font-mono h-28 text-white outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe]/50 resize-y w-full rounded-xl shadow-inner custom-scrollbar transition-all" 
                           value={concept.prompt} 
                           onChange={e => handleConceptChange(index, 'prompt', e.target.value)} 
                           placeholder="Describe the aesthetic, background, mood, lighting..."
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
                          <span className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">Auto-Enhance Prompt</span>
                          <button
                            onClick={() => handleEnhancePrompt(index)}
                            disabled={isEnhancing === index || !concept.prompt.trim()}
                            className={`bg-gradient-to-r from-blue-600/80 to-[#bc13fe]/80 hover:from-blue-500 hover:to-[#bc13fe] text-white rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_15px_rgba(188,19,254,0.3)] hover:shadow-[0_0_25px_rgba(188,19,254,0.5)] border border-white/10 ${index === localConcepts.length - 1 ? 'tour-optimize-prompt' : ''}`}
                          >
                            {isEnhancing === index ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                            OPTIMIZE
                          </button>
                        </div>
                      </div>
                    )}
                 </div>

                 {/* SAVE/CLOSE MODAL ACTION */}
                 <div className="border-t border-white/5 pt-4 mt-2">
                    <button 
                       onClick={() => handleDoneEditing(index)}
                       disabled={isSilentlyOptimizing === index}
                       className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all backdrop-blur-md shadow-inner flex justify-center items-center gap-2 disabled:opacity-50"
                    >
                       {isSilentlyOptimizing === index ? (
                         <>
                           <Loader2 className="w-4 h-4 animate-spin text-[#bc13fe]" />
                           <span className="animate-pulse">Configuring AI Concept...</span>
                         </>
                       ) : (
                         "Done Editing"
                       )}
                    </button>
                 </div>
               </div>
            </div>
         </div>
        )
      })()}

      {/* ENHANCE CONFIRM MODAL */}
      {confirmEnhanceIndex !== null && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleSaveAsIs}></div>
          <div className="relative bg-black/40 backdrop-blur-3xl border border-[#bc13fe]/30 ring-1 ring-[#bc13fe]/10 rounded-3xl w-full max-w-md flex flex-col p-8 shadow-[0_0_50px_rgba(188,19,254,0.15)] animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-12 h-12 bg-[#bc13fe]/20 rounded-full flex items-center justify-center mb-6">
               <Sparkles className="w-6 h-6 text-[#bc13fe]" />
            </div>
            <h2 className="text-xl font-heading tracking-widest uppercase font-bold mb-4 text-white text-center">Enhance Your Prompt?</h2>
            <p className="text-gray-300 mb-8 text-sm text-center leading-relaxed">
              Would you like our AI to enhance your prompt for optimal photobooth results, or save it exactly as it is?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => executeEnhancePrompt(confirmEnhanceIndex)}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600/80 to-[#bc13fe]/80 hover:from-blue-500 hover:to-[#bc13fe] text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(188,19,254,0.3)] hover:shadow-[0_0_25px_rgba(188,19,254,0.5)] flex items-center justify-center gap-2 uppercase tracking-widest border border-white/10"
              >
                <Sparkles className="w-4 h-4" /> Enhance Prompt
              </button>
              <button
                onClick={handleSaveAsIs}
                className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition-all uppercase tracking-widest border border-white/10"
              >
                Save As Is
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATION SELECTION MODAL */}
      {showCreationSelectionModal && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowCreationSelectionModal(false)}></div>
          <div className="relative bg-black/40 backdrop-blur-3xl border border-white/10 ring-1 ring-white/5 rounded-3xl w-full max-w-lg flex flex-col overflow-hidden shadow-[0_0_50px_rgba(188,19,254,0.15)]">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-transparent z-10 shrink-0">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#bc13fe] shadow-[0_0_10px_#bc13fe animate-pulse"></div>
                  <h2 className="text-xl font-heading tracking-wider font-bold text-white/90 uppercase">Add Concept</h2>
               </div>
               <button onClick={() => setShowCreationSelectionModal(false)} className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-all">
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
                  className="w-full text-left bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 hover:border-[#bc13fe]/50 p-4 rounded-2xl transition-all duration-300 group flex items-start gap-4 shadow-inner"
               >
                  <div className="bg-white/5 group-hover:bg-[#bc13fe]/20 rounded-xl p-3 text-white group-hover:text-[#bc13fe] transition-all shadow-inner">
                     <Plus className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-[#bc13fe] transition-colors uppercase tracking-wide">Create Your Own Concept</h3>
                     <p className="text-xs text-white/50 mt-1">Start from scratch with your own prompt, style, and optional reference images.</p>
                  </div>
               </button>

               {/* 2. Create from AI Image */}
               <button 
                  onClick={() => {
                     setShowCreationSelectionModal(false);
                     setShowCreateFromImageModal(true);
                  }}
                  className="w-full text-left bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 hover:border-blue-500/50 p-4 rounded-2xl transition-all duration-300 group flex items-start gap-4 shadow-inner"
               >
                  <div className="bg-white/5 group-hover:bg-blue-500/20 rounded-xl p-3 text-white group-hover:text-blue-400 transition-all shadow-inner">
                     <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-blue-400 transition-colors uppercase tracking-wide">Create by AI Image</h3>
                     <p className="text-xs text-white/50 mt-1">Upload a reference, and let Coro AI write the perfect prompt for you.</p>
                  </div>
               </button>

               {/* 3. Create with Concept Studio */}
               <button 
                  onClick={() => {
                     setShowCreationSelectionModal(false);
                     setShowCSModal(true);
                  }}
                  className="w-full text-left bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 hover:border-amber-500/50 p-4 rounded-2xl transition-all duration-300 group flex items-start gap-4 shadow-inner"
               >
                  <div className="bg-white/5 group-hover:bg-amber-500/20 rounded-xl p-3 text-white group-hover:text-amber-400 transition-all shadow-inner">
                     <Edit className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-amber-400 transition-colors uppercase tracking-wide">Create with Concept Studio</h3>
                     <p className="text-xs text-white/50 mt-1">Set up man outfit, woman outfit, background, and rendering style manually.</p>
                  </div>
               </button>

               {/* 4. Select by Template */}
               <button 
                  onClick={() => {
                     setShowCreationSelectionModal(false);
                     handleOpenTemplateModal();
                  }}
                  className="w-full text-left bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 hover:border-[#bc13fe]/50 p-4 rounded-2xl transition-all duration-300 group flex items-start gap-4 shadow-inner"
               >
                  <div className="bg-white/5 group-hover:bg-[#bc13fe]/20 rounded-xl p-3 text-white group-hover:text-[#bc13fe] transition-all shadow-inner">
                     <Palette className="w-6 h-6" />
                  </div>
                  <div>
                     <h3 className="font-bold text-base text-white group-hover:text-[#bc13fe] transition-colors uppercase tracking-wide">Select by Template</h3>
                     <p className="text-xs text-white/50 mt-1">Load ready-to-use concepts from the global or your personal gallery.</p>
                  </div>
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Create From Image Modal */}
      {showCreateFromImageModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowCreateFromImageModal(false)}></div>
          <div className="relative bg-black/40 backdrop-blur-3xl border border-white/10 ring-1 ring-white/5 rounded-3xl w-full max-w-md flex flex-col overflow-hidden shadow-[0_0_50px_rgba(188,19,254,0.15)]">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-transparent z-10">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6 animate-pulse"></div>
                 <h2 className="text-xl font-heading tracking-wider font-bold text-white/90 uppercase">AI Image Concept</h2>
              </div>
              <button onClick={() => setShowCreateFromImageModal(false)} className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
              <div>
                <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-2">Concept Name</label>
                <input 
                  type="text" 
                  value={createFromImageName}
                  onChange={(e) => setCreateFromImageName(e.target.value)}
                  placeholder="E.g. Cyberpunk Neon"
                  className="w-full bg-black/40 border border-white/10 p-4 rounded-xl font-heading text-base font-bold text-white outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe]/50 shadow-inner transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold tracking-widest text-[#bc13fe] uppercase block mb-2">Upload AI Image</label>
                <div className="w-full aspect-video bg-white/5 backdrop-blur-md border border-dashed border-white/20 hover:border-blue-500/50 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden group shadow-lg transition-all">
                  {createFromImagePreview ? (
                    <>
                      <img src={createFromImagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-bold uppercase tracking-widest bg-black/50 px-4 py-2 rounded-lg backdrop-blur-md">Change Image</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-gray-400 group-hover:text-blue-400 transition-colors">
                      <Plus className="w-8 h-8 mb-2" />
                      <span className="text-[10px] tracking-widest uppercase font-bold">Click to upload</span>
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
                className="w-full py-4 bg-gradient-to-r from-blue-600/80 to-[#bc13fe]/80 hover:from-blue-500 hover:to-[#bc13fe] text-white rounded-xl text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2 mt-2 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] border border-white/10"
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

      {/* Create with Concept Studio Modal */}
      {showCSModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowCSModal(false)}></div>
          <div className="relative bg-black/40 backdrop-blur-3xl border border-white/10 ring-1 ring-white/5 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(188,19,254,0.15)] flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-transparent z-10 sticky top-0 bg-black/80 backdrop-blur-md">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b animate-pulse"></div>
                 <h2 className="text-xl font-heading tracking-wider font-bold text-white/90 uppercase">Create with Concept Studio</h2>
              </div>
              <button onClick={() => setShowCSModal(false)} className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6 w-full">
              <div>
                <label className="text-[10px] font-bold tracking-widest text-amber-400 uppercase block mb-2">Concept Name</label>
                <input 
                  type="text" 
                  value={csName}
                  onChange={(e) => setCsName(e.target.value)}
                  placeholder="E.g. Astronaut Wedding"
                  className="w-full bg-black/40 border border-white/10 p-4 rounded-xl font-heading text-base font-bold text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 shadow-inner transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* References */}
                <div className="space-y-6">
                  <div className="glass-card p-6 rounded-2xl border border-white/10">
                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-4">Reference Images</h3>
                    <p className="text-xs text-white/50 mb-4 leading-relaxed">Upload clothes or backgrounds. Outfits will be stitched together automatically.</p>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Man Outfit */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Man Outfit</label>
                        <div className="relative aspect-[3/4] bg-black/50 border-2 border-dashed border-white/20 rounded-xl overflow-hidden hover:border-amber-500/50 transition-colors group">
                          {csManOutfit ? (
                            <>
                              <img src={URL.createObjectURL(csManOutfit)} alt="Man" className="w-full h-full object-cover" />
                              <button onClick={() => setCsManOutfit(null)} className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-red-500 transition-colors backdrop-blur-sm">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                              <Upload className="w-6 h-6 text-gray-500 mb-2 group-hover:text-amber-400 transition-colors" />
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Upload</span>
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files && e.target.files[0]) setCsManOutfit(e.target.files[0]); }} />
                            </label>
                          )}
                        </div>
                      </div>
                      
                      {/* Woman Outfit */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Woman Outfit</label>
                        <div className="relative aspect-[3/4] bg-black/50 border-2 border-dashed border-white/20 rounded-xl overflow-hidden hover:border-amber-500/50 transition-colors group">
                          {csWomanOutfit ? (
                            <>
                              <img src={URL.createObjectURL(csWomanOutfit)} alt="Woman" className="w-full h-full object-cover" />
                              <button onClick={() => setCsWomanOutfit(null)} className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-red-500 transition-colors backdrop-blur-sm">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                              <Upload className="w-6 h-6 text-gray-500 mb-2 group-hover:text-amber-400 transition-colors" />
                              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Upload</span>
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files && e.target.files[0]) setCsWomanOutfit(e.target.files[0]); }} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Background Setup</label>
                      <div className="relative aspect-video bg-black/50 border-2 border-dashed border-white/20 rounded-xl overflow-hidden hover:border-amber-500/50 transition-colors group">
                        {csBackground ? (
                          <>
                            <img src={URL.createObjectURL(csBackground)} alt="Background" className="w-full h-full object-cover" />
                            <button onClick={() => setCsBackground(null)} className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-red-500 transition-colors backdrop-blur-sm">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                            <Upload className="w-8 h-8 text-gray-500 mb-2 group-hover:text-amber-400 transition-colors" />
                            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Upload Background</span>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files && e.target.files[0]) setCsBackground(e.target.files[0]); }} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Settings */}
                <div className="space-y-6">
                  <div className="glass-card p-6 rounded-2xl border border-white/10">
                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-4">Settings</h3>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Style Preset</label>
                        <select 
                          value={csStyle}
                          onChange={(e) => setCsStyle(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
                        >
                          <option value="3D Render (recommended)">3D Render (recommended)</option>
                          <option value="Photorealistic">Photorealistic</option>
                          <option value="Anime">Anime</option>
                          <option value="Cartoon Look">Cartoon Look</option>
                          <option value="Sketch Art">Sketch Art</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Composition</label>
                        <select 
                          value={csComposition}
                          onChange={(e) => setCsComposition(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
                        >
                          <option value="Full Body">Full Body</option>
                          <option value="Medium Shot">Medium Shot (Waist up)</option>
                          <option value="Close Up">Close Up (Face & Shoulders)</option>
                        </select>
                      </div>
                    </div>

                    <button 
                      onClick={handleCreateWithConceptStudio}
                      disabled={isCsGenerating || !csName.trim()}
                      className="w-full mt-6 py-4 bg-gradient-to-r from-amber-600/80 to-amber-500/80 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-white/10 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)]"
                    >
                      {isCsGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          CONFIGURING CONCEPT...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          ADD CONCEPT
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Concept Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => {
            setShowTemplateModal(false);
            if (isActive && tourType === 'concept' && stepIndex === 1) {
              setTourState({ stepIndex: 2 });
            }
          }}></div>
          <div className="relative bg-black/40 backdrop-blur-3xl border border-white/10 ring-1 ring-white/5 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(188,19,254,0.15)] tour-template-modal">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-transparent z-10 shrink-0">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-[#bc13fe] shadow-[0_0_10px_#bc13fe animate-pulse"></div>
                 <h2 className="text-xl font-heading tracking-wider font-bold text-white/90 uppercase">Load Templates</h2>
              </div>
              <button onClick={() => {
                setShowTemplateModal(false);
                if (isActive && tourType === 'concept' && stepIndex === 1) {
                  setTourState({ stepIndex: 2 });
                }
              }} className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-white/5 bg-white/5 backdrop-blur-sm">
              <button
                className={`flex-1 py-4 text-xs tracking-widest uppercase font-bold transition-all ${templateTab === 'superadmin' ? 'text-white bg-white/10 shadow-inner' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                onClick={() => setTemplateTab('superadmin')}
              >
                Global Pre-Ready Concepts
              </button>
              <button
                className={`flex-1 py-4 text-xs tracking-widest uppercase font-bold transition-all ${templateTab === 'mine' ? 'text-white bg-white/10 shadow-inner' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                onClick={() => setTemplateTab('mine')}
              >
                My Saved Concepts
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
                    className="text-center py-12 text-white/40 tour-load-template cursor-pointer"
                    onClick={() => {
                      setShowTemplateModal(false);
                      if (isActive && tourType === 'concept' && stepIndex === 1) {
                        setTourState({ stepIndex: 2 });
                      }
                    }}
                  >
                    <p className="font-heading tracking-wider uppercase text-sm">No global templates available.</p>
                    <p className="text-[10px] mt-2 uppercase tracking-widest">Super Admin can create templates in their dashboard.</p>
                    <p className="text-[10px] mt-4 text-[#bc13fe] tracking-widest font-bold">Click here to close and continue tour</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {templateConcepts.map(template => (
                      <div key={template.id} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden group hover:border-[#bc13fe]/50 transition-all flex flex-col shadow-lg">
                        <div className="aspect-square relative overflow-hidden">
                          <img src={template.thumbnail} alt={template.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          {template.ref_image && (
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-[9px] px-2 py-1 rounded-md border border-white/20 font-bold tracking-widest uppercase text-white">
                              + Ref
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="font-bold font-heading text-xs mb-1 truncate text-white" title={template.name}>{template.name}</h3>
                          <p className="text-[9px] text-[#bc13fe] mb-3 flex-1 uppercase tracking-widest font-bold">Concept</p>
                          <button
                            onClick={() => handleUseTemplate(template, 'old')}
                            className="w-full py-2 bg-white/10 hover:bg-[#bc13fe] hover:shadow-[0_0_15px_rgba(188,19,254,0.5)] border border-white/10 hover:border-transparent text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all tour-load-template"
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
                  <div className="text-center py-12 text-white/40">
                    <p className="font-heading tracking-wider uppercase text-sm">No templates found.</p>
                    <p className="text-[10px] mt-2 uppercase tracking-widest">Create your own templates in the Concept Studio.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {conceptTemplates.map(template => (
                      <div key={template.id} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden group hover:border-[#bc13fe]/50 transition-all flex flex-col shadow-lg">
                        <div className="aspect-square relative overflow-hidden">
                          <img src={template.reference_image_split || template.reference_image_bg || 'https://picsum.photos/seed/concept/300/500'} alt={template.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          {(template.reference_image_split || template.reference_image_bg) && (
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-[9px] px-2 py-1 rounded-md border border-white/20 font-bold tracking-widest uppercase text-white">
                              + Ref
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="font-bold font-heading text-xs mb-1 truncate text-white" title={template.name}>{template.name}</h3>
                          <p className="text-[9px] text-[#bc13fe] mb-3 flex-1 uppercase tracking-widest font-bold truncate">{template.style_preset || 'TEMPLATE'}</p>
                          <button
                            onClick={() => handleUseTemplate(template, 'new')}
                            className="w-full py-2 bg-white/10 hover:bg-[#bc13fe] hover:shadow-[0_0_15px_rgba(188,19,254,0.5)] border border-white/10 hover:border-transparent text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
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
