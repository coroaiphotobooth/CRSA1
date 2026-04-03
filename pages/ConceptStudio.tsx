import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload, Image as ImageIcon, Play, Save, Loader2, Trash2, Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDialog } from '../components/DialogProvider';
import { ConceptTemplate } from '../types';

interface ConceptStudioProps {
  vendorId: string;
  onClose: () => void;
}

export default function ConceptStudio({ vendorId, onClose }: ConceptStudioProps) {
  const [manOutfit, setManOutfit] = useState<File | null>(null);
  const [womanOutfit, setWomanOutfit] = useState<File | null>(null);
  const [background, setBackground] = useState<File | null>(null);
  const [dummyFace, setDummyFace] = useState<File | null>(null);
  const [stylePreset, setStylePreset] = useState('Photorealistic');
  const [composition, setComposition] = useState('Medium Shot');
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ConceptTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<ConceptTemplate | null>(null);
  const { showDialog } = useDialog();

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

  const handleTestRender = async () => {
    if (!manOutfit || !womanOutfit || !background || !dummyFace) {
      await showDialog('alert', 'Missing Inputs', 'Please upload all 4 images (Man Outfit, Woman Outfit, Background, and Dummy Face) to test render.');
      return;
    }

    const confirm = await showDialog('confirm', 'Test Render', 'This will consume 1 credit. Do you want to proceed?');
    if (!confirm) return;

    setIsRendering(true);
    try {
      // 1. Stitch man and woman outfits
      const stitchedBase64 = await stitchImages(manOutfit, womanOutfit);
      
      // 2. Convert background and dummy face to base64 (resized)
      const bgBase64 = await resizeAndCompressImage(background);
      const dummyFaceBase64 = await resizeAndCompressImage(dummyFace);

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
Look at the provided reference images.
- If a split reference image is provided (Reference Image 1), the man in the photo MUST wear the exact outfit shown on the LEFT side of Reference Image 1. The woman MUST wear the exact outfit shown on the RIGHT side of Reference Image 1. Retain the exact fabric, pattern, and design of the outfits.
- Place them in the exact environment shown in the background reference image (Reference Image 2).
Style: ${stylePreset}.
Additional instructions: A ${composition} shot. ${additionalPrompt}`
            },
            { inlineData: { data: dummyFaceBase64.split(',')[1], mimeType: dummyFace.type || 'image/jpeg' } },
            { inlineData: { data: stitchedBase64.split(',')[1], mimeType: 'image/jpeg' } },
            { inlineData: { data: bgBase64.split(',')[1], mimeType: background.type || 'image/jpeg' } }
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
      const { data: vendorData } = await supabase.from('vendors').select('credits').eq('id', vendorId).single();
      if (vendorData) {
        await supabase.from('vendors').update({ credits: Math.max(0, vendorData.credits - 1) }).eq('id', vendorId);
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

      // If new images are uploaded, process and upload them
      if (manOutfit && womanOutfit && background) {
        // 1. Stitch images
        const stitchedBase64 = await stitchImages(manOutfit, womanOutfit);
        const bgBase64 = await resizeAndCompressImage(background);

        // 2. Upload to Supabase Storage
        const stitchedFileName = `${vendorId}/${Date.now()}_split.jpg`;
        const bgFileName = `${vendorId}/${Date.now()}_bg.jpg`;
        const thumbFileName = `${vendorId}/${Date.now()}_thumb.jpg`;

        // Convert base64 to blob for upload
        const stitchedBlob = await (await fetch(stitchedBase64)).blob();
        const bgBlob = await (await fetch(bgBase64)).blob();

        const { error: uploadError1 } = await supabase.storage
          .from('concept_assets')
          .upload(stitchedFileName, stitchedBlob, { contentType: 'image/jpeg' });
        
        if (uploadError1) throw uploadError1;

        const { error: uploadError2 } = await supabase.storage
          .from('concept_assets')
          .upload(bgFileName, bgBlob, { contentType: background.type || 'image/jpeg' });

        if (uploadError2) throw uploadError2;

        if (renderResult) {
          try {
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

        const { data: url1Data } = supabase.storage.from('concept_assets').getPublicUrl(stitchedFileName);
        const { data: url2Data } = supabase.storage.from('concept_assets').getPublicUrl(bgFileName);
        url1 = url1Data.publicUrl;
        url2 = url2Data.publicUrl;
        if (!thumbUrl) thumbUrl = url1;
      }

      const templateData = {
        vendor_id: vendorId,
        name: templateName,
        prompt: `A ${composition} shot. ${additionalPrompt}`,
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
    setComposition('Medium Shot');
    setStylePreset('Photorealistic');
    setEditingTemplate(null);
  };

  const handleEditTemplate = (template: ConceptTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setStylePreset(template.style_preset || 'Photorealistic');
    
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
        <button 
          onClick={onClose}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
        >
          Back to Dashboard
        </button>
      </div>

      {editingTemplate && (
        <div className="bg-blue-900/30 border border-blue-500/50 rounded-xl p-4 flex justify-between items-center">
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
                  <option value="Photorealistic">Photorealistic</option>
                  <option value="3D Render">3D Render</option>
                  <option value="Anime">Anime</option>
                  <option value="Oil Painting">Oil Painting</option>
                  <option value="Cyberpunk">Cyberpunk</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Composition</label>
                <select 
                  value={composition}
                  onChange={(e) => setComposition(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                >
                  <option value="Medium Shot">Medium Shot (Waist up)</option>
                  <option value="Close Up">Close Up (Face & Shoulders)</option>
                  <option value="Full Body">Full Body</option>
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

      {/* My Templates Section */}
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
    </div>
  );
}
