import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload, Image as ImageIcon, Play, Save, Loader2, Trash2, Edit2, MessageSquare, ArrowLeft, Send, Paperclip, X, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDialog } from '../../components/DialogProvider';
import { ConceptTemplate } from '../../types';
import { getEnhancedPrompt } from '../../lib/promptEnhancer';
import { chatWithConceptDesigner, ConceptChatMessage } from '../../lib/gemini';

interface ConceptStudioProps {
  vendorId: string;
  onClose: () => void;
}

export default function ConceptStudio({ vendorId, onClose }: ConceptStudioProps) {
  const [creationMode, setCreationMode] = useState<'selection' | 'chat' | 'manual'>('selection');
  const [manOutfit, setManOutfit] = useState<File | null>(null);
  const [womanOutfit, setWomanOutfit] = useState<File | null>(null);
  const [background, setBackground] = useState<File | null>(null);
  const [dummyFace, setDummyFace] = useState<File | null>(null);
  const [stylePreset, setStylePreset] = useState('3D Render (recommended)');
  const [composition, setComposition] = useState('Full Body');
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ConceptTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<ConceptTemplate | null>(null);
  const { showDialog } = useDialog();

  const [chatMessages, setChatMessages] = useState<ConceptChatMessage[]>([
    { role: 'model', text: 'Halo! Saya AI Concept Designer dari CoroAI. Ceritakan konsep photobooth seperti apa yang ingin Anda buat, atau upload gambar referensinya!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState<File[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatting]);

  useEffect(() => {
    fetchTemplates();
  }, [vendorId]);

  const fetchTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from('concept_templates')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>) => {
    if (e.target.files && e.target.files[0]) {
      setter(e.target.files[0]);
    }
  };

  const stitchImages = async (img1File: File, img2File: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img1 = new Image();
      const img2 = new Image();
      let loaded = 0;

      const onload = () => {
        loaded++;
        if (loaded === 2) {
          const canvas = document.createElement('canvas');
          // Set canvas size to fit both images side by side
          // Let's normalize height to 1024
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

  const resizeAndCompressImage = (file: File, maxWidth = 1024): Promise<string> => {
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

  const fetchImageAsBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Failed to fetch image URL:", err);
      return url;
    }
  };

  const handleTestRender = async () => {
    if (!dummyFace) {
      await showDialog('alert', 'Missing Inputs', 'Please upload a Dummy Face to test render.');
      return;
    }

    let stitchedBase64 = '';
    if (manOutfit && womanOutfit) {
      stitchedBase64 = await stitchImages(manOutfit, womanOutfit);
    } else if ((manOutfit && !womanOutfit) || (!manOutfit && womanOutfit)) {
      await showDialog('alert', 'Missing Inputs', 'Please upload both Man and Woman outfits to test the new clothing reference.');
      return;
    } else if (editingTemplate?.reference_image_split) {
      stitchedBase64 = await fetchImageAsBase64(editingTemplate.reference_image_split);
    } else {
      await showDialog('alert', 'Missing Inputs', 'Please upload Man and Woman outfits.');
      return;
    }

    let bgBase64 = '';
    if (background) {
      bgBase64 = await resizeAndCompressImage(background);
    } else if (editingTemplate?.reference_image_bg) {
      bgBase64 = await fetchImageAsBase64(editingTemplate.reference_image_bg);
    } else {
      await showDialog('alert', 'Missing Inputs', 'Please upload Background image.');
      return;
    }

    const confirm = await showDialog('confirm', 'Test Render', 'This will consume 1 credit. Do you want to proceed?');
    if (!confirm) return;

    setIsRendering(true);
    try {
      const dummyFaceBase64 = await resizeAndCompressImage(dummyFace);

      const { enhancedStyle, enhancedPrompt } = getEnhancedPrompt(additionalPrompt, stylePreset, composition);

      // 3. Call Gemini API
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.1-flash-image-preview',
          aspectRatio: '9:16',
          parts: [
            {
              text: `Redraw the people in the main photo.
CRITICAL INSTRUCTION:
1. Analyze the people in the main photo. Count them and identify their genders.
2. YOU MUST ONLY draw the exact number of people present in the main photo. Do not add any extra people.
3. Look at the provided reference images. Reference Image 1 is a split image showing a male outfit on the LEFT and a female outfit on the RIGHT.
4. For EVERY male in the main photo, dress them in the exact outfit shown on the LEFT side of Reference Image 1.
5. For EVERY female in the main photo, dress them in the exact outfit shown on the RIGHT side of Reference Image 1.
6. Place them in the exact environment shown in the background reference image (Reference Image 2).
Style: ${enhancedStyle}.
Additional instructions: A ${composition} shot. ${enhancedPrompt}`
            },
            { inlineData: { data: dummyFaceBase64.split(',')[1], mimeType: dummyFace.type || 'image/jpeg' } },
            { inlineData: { data: stitchedBase64.split(',')[1] || stitchedBase64, mimeType: 'image/jpeg' } },
            { inlineData: { data: bgBase64.split(',')[1] || bgBase64, mimeType: background?.type || 'image/jpeg' } }
          ]
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Generation Failed");
      }

      const data = await response.json();
      setRenderResult(`data:image/png;base64,${data.imageBase64}`);
      
      // Deduct credit
      const { data: vendorData } = await supabase.from('vendors').select('credits, credits_used, is_timer_running, timer_last_started_at, unlimited_seconds_left, unlimited_expires_at').eq('id', vendorId).single();
      if (vendorData) {
        let isUnlimitedActive = false;
        
        let isExpired = false;
        if (vendorData.unlimited_expires_at && new Date(vendorData.unlimited_expires_at).getTime() < Date.now()) {
          isExpired = true;
        }

        if (isExpired) {
          if (vendorData.is_timer_running) {
            await supabase.from('vendors').update({
              is_timer_running: false,
              timer_last_started_at: null,
              unlimited_seconds_left: 0,
              unlimited_expires_at: null
            }).eq('id', vendorId);
          }
        } else if (vendorData.is_timer_running && vendorData.timer_last_started_at) {
          const elapsed = Math.floor((Date.now() - new Date(vendorData.timer_last_started_at).getTime()) / 1000);
          const remaining = Math.max(0, (vendorData.unlimited_seconds_left || 0) - elapsed);
          if (remaining > 0) {
            isUnlimitedActive = true;
          } else {
            // Timer expired, auto-pause
            await supabase.from('vendors').update({
              is_timer_running: false,
              timer_last_started_at: null,
              unlimited_seconds_left: 0
            }).eq('id', vendorId);
          }
        }
        
        if (!isUnlimitedActive) {
          await supabase.from('vendors').update({ 
            credits: Math.max(0, vendorData.credits - 1),
            credits_used: (vendorData.credits_used || 0) + 1
          }).eq('id', vendorId);
        }
      }

    } catch (error: any) {
      console.error('Render error:', error);
      await showDialog('alert', 'Error', `Failed to render: ${error.message}`);
    } finally {
      setIsRendering(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      await showDialog('alert', 'Missing Name', 'Please enter a name for your template.');
      return;
    }

    if (!editingTemplate && (!manOutfit || !womanOutfit || !background)) {
      await showDialog('alert', 'Missing Inputs', 'Please upload Man Outfit, Woman Outfit, and Background images to save the template.');
      return;
    }

    setIsSaving(true);
    try {
      let url1 = editingTemplate?.reference_image_split || '';
      let url2 = editingTemplate?.reference_image_bg || '';
      let thumbUrl = editingTemplate?.thumbnail || '';

      // If new man/woman outfits are uploaded, stitch and upload
      if (manOutfit && womanOutfit) {
        const stitchedBase64 = await stitchImages(manOutfit, womanOutfit);
        const stitchedFileName = `${vendorId}/${Date.now()}_split.jpg`;
        const stitchedBlob = await (await fetch(stitchedBase64)).blob();
        const { error: uploadError1 } = await supabase.storage
          .from('concept_assets')
          .upload(stitchedFileName, stitchedBlob, { contentType: 'image/jpeg' });
        
        if (uploadError1) throw uploadError1;
        const { data: url1Data } = supabase.storage.from('concept_assets').getPublicUrl(stitchedFileName);
        url1 = url1Data.publicUrl;
      } else if ((manOutfit && !womanOutfit) || (!manOutfit && womanOutfit)) {
        await showDialog('alert', 'Missing Inputs', 'Please upload both Man and Woman outfits to update the clothing reference.');
        setIsSaving(false);
        return;
      }

      // If new background is uploaded, compress and upload
      if (background) {
        const bgBase64 = await resizeAndCompressImage(background);
        const bgFileName = `${vendorId}/${Date.now()}_bg.jpg`;
        const bgBlob = await (await fetch(bgBase64)).blob();
        const { error: uploadError2 } = await supabase.storage
          .from('concept_assets')
          .upload(bgFileName, bgBlob, { contentType: background.type || 'image/jpeg' });

        if (uploadError2) throw uploadError2;
        const { data: url2Data } = supabase.storage.from('concept_assets').getPublicUrl(bgFileName);
        url2 = url2Data.publicUrl;
      }

      // If there's a new render result, upload it as thumbnail
      if (renderResult) {
        try {
          const thumbFileName = `${vendorId}/${Date.now()}_thumb.jpg`;
          const thumbBlob = await (await fetch(renderResult)).blob();
          await supabase.storage
            .from('concept_assets')
            .upload(thumbFileName, thumbBlob, { contentType: 'image/jpeg' });
          const { data } = supabase.storage.from('concept_assets').getPublicUrl(thumbFileName);
          thumbUrl = data.publicUrl;
        } catch (e) {
          console.error("Failed to upload thumbnail", e);
        }
      }

      if (!thumbUrl) thumbUrl = url1;

      const { enhancedPrompt } = getEnhancedPrompt(additionalPrompt, stylePreset, composition);
      const finalPrompt = `A ${composition} shot. ${enhancedPrompt}`;

      const templateData = {
        vendor_id: vendorId,
        name: templateName,
        prompt: finalPrompt,
        thumbnail: thumbUrl,
        reference_image_split: url1,
        reference_image_bg: url2,
        style_preset: stylePreset,
      };

      // 3. Save to database
      if (editingTemplate) {
        const { error } = await supabase.from('concept_templates').update(templateData).eq('id', editingTemplate.id);
        if (error) throw error;
        await showDialog('alert', 'Success', 'Template updated successfully!');
      } else {
        const { error } = await supabase.from('concept_templates').insert([templateData]);
        if (error) throw error;
        await showDialog('alert', 'Success', 'Template saved successfully!');
      }
      
      fetchTemplates();
      handleReset();
    } catch (error: any) {
      console.error('Save error:', error);
      await showDialog('alert', 'Error', `Failed to save template: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setManOutfit(null);
    setWomanOutfit(null);
    setBackground(null);
    setDummyFace(null);
    setRenderResult(null);
    setTemplateName('');
    setAdditionalPrompt('');
    setComposition('Full Body');
    setStylePreset('3D Render (recommended)');
    setEditingTemplate(null);
  };

  const handleEditTemplate = (template: ConceptTemplate) => {
    setCreationMode('manual');
    setEditingTemplate(template);
    setTemplateName(template.name);
    setStylePreset(template.style_preset || '3D Render (recommended)');
    
    // Parse prompt
    let comp = 'Medium Shot';
    let addPrompt = template.prompt;
    const match = template.prompt.match(/^A (.*?) shot\.\s*(.*)/);
    if (match) {
      comp = match[1];
      addPrompt = match[2];
    }
    setComposition(comp);
    setAdditionalPrompt(addPrompt);
    
    // Reset files
    setManOutfit(null);
    setWomanOutfit(null);
    setBackground(null);
    setDummyFace(null);
    setRenderResult(null);
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() && chatImages.length === 0) return;

    setIsChatting(true);
    const base64Images: string[] = [];
    try {
      for (const file of chatImages) {
          const b64 = await resizeAndCompressImage(file);
          base64Images.push(b64);
      }
      
      const newUserMsg: ConceptChatMessage = { 
          role: 'user', 
          text: chatInput,
          images: base64Images.length > 0 ? base64Images : undefined
      };

      const newHistory = [...chatMessages, newUserMsg];
      setChatMessages(newHistory);
      setChatInput('');
      setChatImages([]);

      const responseText = await chatWithConceptDesigner(newHistory);
      setChatMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (err: any) {
      console.error(err);
      await showDialog('alert', 'Chat Error', `Gagal mengirim pesan: ${err.message}`);
    } finally {
      setIsChatting(false);
    }
  };

  const handleSaveFromChat = async () => {
    if (!templateName.trim()) {
        await showDialog('alert', 'Missing Name', 'Tolong ketik nama template sebelum menyimpannya.');
        return;
    }
    const modelMessages = chatMessages.filter(m => m.role === 'model' && m.text.includes('AUTO-DETECT SUBJECT'));
    if (modelMessages.length === 0) {
        await showDialog('alert', 'Concept NotFound', 'Silakan ngobrol dulu dengan AI Concept Designer untuk generate struktur promtnya, sebelum menyimpan.');
        return;
    }
    const lastPrompt = modelMessages[modelMessages.length - 1].text;
    
    setIsSaving(true);
    try {
        const templateData = {
          vendor_id: vendorId,
          name: templateName,
          prompt: lastPrompt,
          style_preset: '3D Render (recommended)',
        };
        const { error } = await supabase.from('concept_templates').insert([templateData]);
        if (error) throw error;
        await showDialog('alert', 'Success', 'Template Concept AI berhasil disimpan!');
        fetchTemplates();
        setTemplateName('');
        setCreationMode('selection');
    } catch(err: any) {
        console.error(err);
        await showDialog('alert', 'Error', `Failed to save template: ${err.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const confirm = await showDialog('confirm', 'Delete Template', 'Are you sure you want to delete this template? This action cannot be undone.');
    if (!confirm) return;

    try {
      const { error } = await supabase.from('concept_templates').delete().eq('id', id);
      if (error) throw error;
      
      if (editingTemplate?.id === id) {
        handleReset();
      }
      fetchTemplates();
    } catch (error: any) {
      console.error("Failed to delete template:", error);
      await showDialog('alert', 'Error', `Failed to delete template: ${error.message}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-heading font-bold">Concept Studio</h2>
          <p className="text-gray-400">Create and test your visual concepts</p>
        </div>
        <div className="flex gap-3">
          {creationMode !== 'selection' && (
            <button 
              onClick={() => { setCreationMode('selection'); handleReset(); }}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Modes
            </button>
          )}
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors"
          >
            Close Studio
          </button>
        </div>
      </div>

      {creationMode === 'selection' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-12 mb-16">
          <div 
            onClick={() => setCreationMode('chat')}
            className="glass-card p-10 rounded-3xl border border-[#bc13fe]/30 hover:border-[#bc13fe] cursor-pointer transition-all hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(188,19,254,0.2)] group text-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <MessageSquare className="w-32 h-32" />
            </div>
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#bc13fe]/40 to-purple-900/40 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative z-10 border border-[#bc13fe]/50">
              <MessageSquare className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-heading font-bold mb-4 text-white relative z-10">Create with Chat Agent</h3>
            <p className="text-gray-400 relative z-10">Describe your ideas and let our AI Concept Designer formulate the perfect structured prompt for you.</p>
            <div className="mt-6 flex justify-center relative z-10">
              <span className="text-xs font-bold bg-[#bc13fe] text-white px-3 py-1 rounded-full uppercase tracking-wider">Recommended</span>
            </div>
          </div>

          <div 
            onClick={() => setCreationMode('manual')}
            className="glass-card p-10 rounded-3xl border border-white/10 hover:border-white/30 cursor-pointer transition-all hover:-translate-y-2 group text-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <ImageIcon className="w-32 h-32" />
            </div>
            <div className="w-20 h-20 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative z-10 border border-white/10">
              <ImageIcon className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-2xl font-heading font-bold mb-4 text-white relative z-10">Create with Reference Image</h3>
            <p className="text-gray-400 relative z-10">Manually upload reference images for outfits and backgrounds, and set up your prompt manually.</p>
          </div>
        </div>
      )}

      {creationMode === 'manual' && (
        <div className="animate-[fadeIn_0.3s_ease-out]">
          {editingTemplate && (
            <div className="bg-blue-900/30 border border-blue-500/50 rounded-xl p-4 flex justify-between items-center mb-6">
              <div>
                <h3 className="font-bold text-blue-400">Editing Template: {editingTemplate.name}</h3>
                <p className="text-sm text-blue-200/70">You can update the settings below. To change the images, please upload new ones.</p>
              </div>
              <button onClick={handleReset} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition-colors">
                Cancel Edit
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Inputs */}
            <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4">1. Reference Images</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Man Outfit */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Man Outfit</label>
                <div className="relative aspect-[3/4] bg-black/50 border-2 border-dashed border-white/20 rounded-xl overflow-hidden hover:border-[#bc13fe]/50 transition-colors group">
                  {manOutfit ? (
                    <img src={URL.createObjectURL(manOutfit)} alt="Man Outfit" className="w-full h-full object-cover" />
                  ) : editingTemplate?.reference_image_split ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                      <img src={editingTemplate.reference_image_split} alt="Existing Split" className="w-full h-full object-cover opacity-50" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <span className="text-xs font-bold bg-black/50 px-2 py-1 rounded">Existing Image</span>
                        <span className="text-[10px] text-gray-300 mt-1">Upload to replace</span>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-[#bc13fe]">
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-xs">Upload</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setManOutfit)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              {/* Woman Outfit */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Woman Outfit</label>
                <div className="relative aspect-[3/4] bg-black/50 border-2 border-dashed border-white/20 rounded-xl overflow-hidden hover:border-[#bc13fe]/50 transition-colors group">
                  {womanOutfit ? (
                    <img src={URL.createObjectURL(womanOutfit)} alt="Woman Outfit" className="w-full h-full object-cover" />
                  ) : editingTemplate?.reference_image_split ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                      <img src={editingTemplate.reference_image_split} alt="Existing Split" className="w-full h-full object-cover opacity-50" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <span className="text-xs font-bold bg-black/50 px-2 py-1 rounded">Existing Image</span>
                        <span className="text-[10px] text-gray-300 mt-1">Upload to replace</span>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-[#bc13fe]">
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-xs">Upload</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setWomanOutfit)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              {/* Background */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Background</label>
                <div className="relative aspect-[3/4] bg-black/50 border-2 border-dashed border-white/20 rounded-xl overflow-hidden hover:border-[#bc13fe]/50 transition-colors group">
                  {background ? (
                    <img src={URL.createObjectURL(background)} alt="Background" className="w-full h-full object-cover" />
                  ) : editingTemplate?.reference_image_bg ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                      <img src={editingTemplate.reference_image_bg} alt="Existing BG" className="w-full h-full object-cover opacity-50" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <span className="text-xs font-bold bg-black/50 px-2 py-1 rounded">Existing Image</span>
                        <span className="text-[10px] text-gray-300 mt-1">Upload to replace</span>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-[#bc13fe]">
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-xs">Upload</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setBackground)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4">2. Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Style Preset</label>
                <select 
                  value={stylePreset}
                  onChange={(e) => setStylePreset(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                >
                  <option value="3D Render (recommended)">3D Render (recommended)</option>
                  <option value="Photorealistic">Photorealistic</option>
                  <option value="Anime">Anime</option>
                  <option value="Cartoon Look">Cartoon Look</option>
                  <option value="Sketch Art">Sketch Art</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Composition</label>
                <select 
                  value={composition}
                  onChange={(e) => setComposition(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                >
                  <option value="Full Body">Full Body</option>
                  <option value="Medium Shot">Medium Shot (Waist up)</option>
                  <option value="Close Up">Close Up (Face & Shoulders)</option>
                  <option value="Wide Angle">Wide Angle (Show environment)</option>
                </select>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-400">Additional Prompt (Optional)</label>
              <textarea
                value={additionalPrompt}
                onChange={(e) => setAdditionalPrompt(e.target.value)}
                placeholder="e.g. The man is wearing a hat, the woman is holding a flower bouquet..."
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe] h-24 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Test & Save */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4">3. Test Render</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Dummy Guest Photo</label>
                <div className="relative h-32 bg-black/50 border-2 border-dashed border-white/20 rounded-xl overflow-hidden hover:border-[#bc13fe]/50 transition-colors group">
                  {dummyFace ? (
                    <img src={URL.createObjectURL(dummyFace)} alt="Dummy Face" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-[#bc13fe]">
                      <Upload className="w-6 h-6 mb-2" />
                      <span className="text-xs">Upload Face</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setDummyFace)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              <button 
                onClick={handleTestRender}
                disabled={isRendering}
                className="w-full py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRendering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                {isRendering ? 'Rendering...' : 'Test Render (1 Credit)'}
              </button>
            </div>

            {renderResult && (
              <div className="mt-6 space-y-4">
                <h4 className="font-medium text-gray-300">Result:</h4>
                <div className="aspect-[3/4] rounded-xl overflow-hidden border border-white/10">
                  <img src={renderResult} alt="Render Result" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4">4. Save Template</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Template Name</label>
                <input 
                  type="text" 
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Wedding Jawa Premium"
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                />
              </div>
              <button 
                onClick={handleSaveTemplate}
                disabled={isSaving}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {isSaving ? 'Saving...' : (editingTemplate ? 'Update Template' : 'Save as My Template')}
              </button>
            </div>
          </div>
        </div>
        </div>
        </div>
      )}

      {creationMode === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-[fadeIn_0.3s_ease-out]">
          <div className="lg:col-span-2 flex flex-col h-[700px] glass-card rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-black/40 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#bc13fe]/20 rounded-full flex items-center justify-center border border-[#bc13fe]/50">
                <MessageSquare className="w-5 h-5 text-[#bc13fe]" />
              </div>
              <div>
                <h3 className="font-bold">AI Concept Designer</h3>
                <p className="text-xs text-gray-400">CoroAI Assistant</p>
              </div>
            </div>
            
            <div 
              ref={chatScrollRef}
              className="flex-1 p-6 overflow-y-auto space-y-6"
            >
              {chatMessages.map((msg, i) => {
                if (msg.role === 'model') {
                  let mainText = msg.text;
                  let suggestionText = '';
                  
                  // Regex to detect either the new strict divider or the old variations of "Sugesti Tambahan"
                  const splitMatch = msg.text.match(/(?:===SUGESTI===|(?:\*\*|#|\s)*Sugesti Tambahan(?:\*\*|:|\s)*)/i);
                  
                  if (splitMatch && splitMatch.index !== undefined) {
                    mainText = msg.text.substring(0, splitMatch.index).trim();
                    let rawSuggestion = msg.text.substring(splitMatch.index + splitMatch[0].length).trim();
                    // Clean up any stray markdown formatting at the start of the suggestion text
                    rawSuggestion = rawSuggestion.replace(/^(\*|:|-|#|\s)+/, '');
                    suggestionText = "Sugesti Tambahan:\n\n" + rawSuggestion;
                  }

                  return (
                    <React.Fragment key={i}>
                      {mainText && (
                        <div className="flex justify-start mb-4">
                          <div className="max-w-[85%] rounded-2xl p-4 bg-white/10 text-gray-100 rounded-bl-none border border-white/5 whitespace-pre-wrap relative group">
                            <span className="leading-relaxed text-sm md:text-base">{mainText}</span>
                            <button 
                              onClick={() => navigator.clipboard.writeText(mainText)}
                              className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-[#bc13fe] text-white rounded opacity-0 group-hover:opacity-100 transition-all text-[10px] uppercase font-bold tracking-wider flex items-center gap-1"
                              title="Copy Prompt"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                        </div>
                      )}
                      {suggestionText && (
                        <div className="flex justify-start mt-2">
                          <div className="max-w-[85%] rounded-2xl p-4 bg-[#bc13fe]/10 text-[#f5d0fe] rounded-bl-none border border-[#bc13fe]/30 whitespace-pre-wrap">
                            <span className="leading-relaxed text-sm md:text-base">{suggestionText}</span>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                }

                return (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-[#bc13fe] text-white rounded-br-none' : 'bg-white/10 text-gray-100 rounded-bl-none border border-white/5 whitespace-pre-wrap'}`}>
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex gap-2 flex-wrap mb-3">
                          {msg.images.map((img, idx) => (
                             <img key={idx} src={img} alt="Uploaded ref" className="w-24 h-24 object-cover rounded-lg border border-white/20" />
                          ))}
                        </div>
                      )}
                      <span className="leading-relaxed text-sm md:text-base">{msg.text}</span>
                    </div>
                  </div>
                );
              })}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-white/10 text-gray-100 rounded-2xl rounded-bl-none p-4 flex gap-2 items-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">AI is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-black/40">
              {chatImages.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                  {chatImages.map((file, idx) => (
                    <div key={idx} className="relative shrink-0">
                      <img src={URL.createObjectURL(file)} alt="preview" className="w-16 h-16 object-cover rounded-md border border-white/20" />
                      <button 
                        onClick={() => setChatImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 border border-black hover:scale-110 transition-transform"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <label className="shrink-0 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl cursor-pointer transition-colors group">
                  <Paperclip className="w-5 h-5 text-gray-400 group-hover:text-white" />
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    className="hidden" 
                    onChange={e => {
                      if (e.target.files) {
                        setChatImages(prev => [...prev, ...Array.from(e.target.files || [])]);
                        e.target.value = '';
                      }
                    }} 
                  />
                </label>
                <textarea 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder="Deskripsikan konsep atau tekan paperclip untuk upload referensi..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] resize-none h-[50px] min-h-[50px] max-h-[120px]"
                />
                <button 
                  onClick={handleSendChat}
                  disabled={isChatting || (!chatInput.trim() && chatImages.length === 0)}
                  className="shrink-0 p-3 bg-[#bc13fe] hover:bg-[#a010d8] disabled:bg-gray-600 disabled:opacity-50 text-white rounded-xl transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="glass-card p-6 rounded-2xl border border-white/10 sticky top-6">
              <h3 className="text-lg font-bold mb-4">Save Template</h3>
              <p className="text-sm text-gray-400 mb-6">Minta AI membuat struktur concept prompt sampai Anda puas, lalu simpan dengan nama di bawah ini.</p>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-400">Template Name</label>
                  <input 
                    type="text" 
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Cyberpunk Jakarta"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                  />
                </div>
                <button 
                  onClick={handleSaveFromChat}
                  disabled={isSaving}
                  className="w-full py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {isSaving ? 'Menyimpan...' : 'Save AI Concept'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My Templates Section (Visible in Selection Mode or Manual Mode) */}
      {(creationMode === 'selection' || creationMode === 'manual') && (
        <div className="mt-12">
          <h3 className="text-xl font-heading font-bold mb-6 border-b border-white/10 pb-4">My Templates</h3>
          {isLoadingTemplates ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-black/20 rounded-xl border border-white/5">
            You haven't created any templates yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {templates.map(template => (
              <div key={template.id} className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group relative">
                <div className="aspect-[3/4] relative">
                  <img 
                    src={template.thumbnail || template.reference_image_split || template.reference_image_bg || 'https://picsum.photos/seed/concept/300/400'} 
                    alt={template.name} 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />
                  
                  {/* Actions overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                    <button 
                      onClick={() => handleEditTemplate(template)}
                      className="p-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 rounded-full transition-colors"
                      title="Edit Template"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full transition-colors"
                      title="Delete Template"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="font-bold text-sm truncate">{template.name}</h4>
                  <p className="text-[10px] text-gray-400 mt-1 truncate">{template.style_preset}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      )}
    </div>
  );
}
