import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Upload, Image as ImageIcon, Play, Save, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDialog } from '../components/DialogProvider';

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
  const { showDialog } = useDialog();

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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
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
      
      // 2. Convert background and dummy face to base64
      const bgBase64 = await fileToBase64(background);
      const dummyFaceBase64 = await fileToBase64(dummyFace);

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

    if (!manOutfit || !womanOutfit || !background) {
      await showDialog('alert', 'Missing Inputs', 'Please upload Man Outfit, Woman Outfit, and Background images to save the template.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Stitch images
      const stitchedBase64 = await stitchImages(manOutfit, womanOutfit);
      const bgBase64 = await fileToBase64(background);

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

      let thumbUrl = '';
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

      const { data: url1 } = supabase.storage.from('concept_assets').getPublicUrl(stitchedFileName);
      const { data: url2 } = supabase.storage.from('concept_assets').getPublicUrl(bgFileName);

      // 3. Save to database
      const { error } = await supabase.from('concept_templates').insert([
        {
          vendor_id: vendorId,
          name: templateName,
          prompt: `A ${composition} shot. ${additionalPrompt}`,
          thumbnail: thumbUrl || url1.publicUrl,
          reference_image_split: url1.publicUrl,
          reference_image_bg: url2.publicUrl,
          style_preset: stylePreset,
        }
      ]);

      if (error) throw error;

      await showDialog('alert', 'Success', 'Template saved successfully!');
      onClose();
    } catch (error: any) {
      console.error('Save error:', error);
      await showDialog('alert', 'Error', `Failed to save template: ${error.message}`);
    } finally {
      setIsSaving(false);
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
                {isSaving ? 'Saving...' : 'Save as My Template'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
