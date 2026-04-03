
import { GoogleGenAI } from "@google/genai";
import { PhotoboothSettings, AspectRatio, Concept } from "../types";

// --- OPENAI HELPER FUNCTIONS ---

// 1. Prepare: Resize Fit to 512 -> Pad to Square -> Return Base64 & Crop Info
const prepareOpenAIInput = async (base64Str: string, targetSize: number = 512): Promise<{ image: string, mask: string, cropInfo: { x: number, y: number, w: number, h: number } }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("No Canvas Context");

      ctx.clearRect(0, 0, targetSize, targetSize);

      const ratio = img.width / img.height;
      let drawW = targetSize;
      let drawH = targetSize;
      let offsetX = 0;
      let offsetY = 0;

      if (img.width > img.height) {
        drawW = targetSize;
        drawH = drawW / ratio;
        offsetY = (targetSize - drawH) / 2;
      } else {
        drawH = targetSize;
        drawW = drawH * ratio;
        offsetX = (targetSize - drawW) / 2;
      }

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
      const preparedImage = canvas.toDataURL('image/png');

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = targetSize;
      maskCanvas.height = targetSize;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return reject("No Mask Context");
      
      maskCtx.clearRect(0, 0, targetSize, targetSize);
      const preparedMask = maskCanvas.toDataURL('image/png');

      resolve({ 
        image: preparedImage, 
        mask: preparedMask,
        cropInfo: { x: offsetX, y: offsetY, w: drawW, h: drawH }
      });
    };
    img.onerror = reject;
    img.src = base64Str;
  });
};

const cropOpenAIResult = async (base64Result: string, cropInfo: { x: number, y: number, w: number, h: number }): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = cropInfo.w;
      canvas.height = cropInfo.h;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("No Context");

      ctx.drawImage(
        img, 
        cropInfo.x, cropInfo.y, cropInfo.w, cropInfo.h, 
        0, 0, cropInfo.w, cropInfo.h 
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = base64Result;
  });
};

// --- GEMINI & MAIN LOGIC ---

let isGeneratingGlobal = false;

export const generateAIImage = async (base64Source: string, concept: Concept, outputRatio: AspectRatio = '9:16', forceUltraQuality: boolean = false) => {
  if (isGeneratingGlobal && forceUltraQuality) {
    console.warn("🚫 [ULTRA] Request ignored: Another generation is already in progress.");
    throw new Error("A generation is already in progress. Please wait.");
  }
  
  if (forceUltraQuality) isGeneratingGlobal = true;

  try {
    const prompt = concept.prompt;
    const storedSettings = localStorage.getItem('pb_settings');
    let selectedModel = 'gemini-3.1-flash-image-preview';
    let promptMode = 'wrapped'; 

    if (storedSettings) {
      const parsedSettings: PhotoboothSettings = JSON.parse(storedSettings);
      if (parsedSettings.selectedModel) selectedModel = parsedSettings.selectedModel;
      if (parsedSettings.promptMode) promptMode = parsedSettings.promptMode;
    }
    
    let finalPrompt = prompt;

    // Default to 'booth' mode if a reference image is provided and mode is 'wrapped' (default)
    if (concept.refImage && promptMode === 'wrapped') {
        promptMode = 'booth';
        console.log("Auto-switching to BOOTH mode for Reference Image workflow");
    }

    if (forceUltraQuality) {
        selectedModel = 'gemini-3-pro-image-preview';
        console.log("⚡ FORCE ULTRA QUALITY: Using gemini-3-pro-image-preview");
    }

    // --- SEEDREAM (BYTEPLUS) FLOW ---
    if (selectedModel.startsWith('seedream-') && !forceUltraQuality) {
        console.log(`Using Seedream (BytePlus) | Model: ${selectedModel}`);
        
        let finalSeedreamPrompt = finalPrompt;
        if (promptMode === 'wrapped') {
             finalSeedreamPrompt = `Consistent character, high quality, photorealistic. ${finalPrompt}`;
        }

        try {
            // CALL NEW ENDPOINT
            const response = await fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: selectedModel, // Sends 'seedream-...' which is valid for /api/image/
                    prompt: finalSeedreamPrompt,
                    imageBase64: base64Source,
                    refImageBase64: concept.refImage || null
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Seedream Generation Failed");
            }

            const data = await response.json();
            return data.imageBase64; 
            
        } catch (err: any) {
             console.warn("Seedream Failed. Falling back to Gemini 3.1.", err);
             selectedModel = 'gemini-3.1-flash-image-preview';
        }
    }

    // --- OPENAI FLOW (GPT-IMAGE) ---
    if ((selectedModel === 'gpt-image-1.5' || selectedModel.startsWith('gpt-')) && !forceUltraQuality) {
       const GPT_WORKFLOW_SIZE = 512;
       console.log(`Using OpenAI Provider | Size: ${GPT_WORKFLOW_SIZE}px`);
       try {
         const { image: preparedBase64, mask: maskBase64, cropInfo } = await prepareOpenAIInput(base64Source, GPT_WORKFLOW_SIZE);
         
         let finalOpenAIPrompt = prompt;
         if (promptMode === 'wrapped') {
            finalOpenAIPrompt = `Strictly preserve the exact pose, facial structure, and composition. ${prompt} . Photorealistic, high fidelity, do not crop, do not zoom.`;
         }

         // CALL NEW ENDPOINT (Supports gpt- prefix via guard)
         const response = await fetch('/api/image/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               model: 'gpt-image-1.5', // or selectedModel
               prompt: finalOpenAIPrompt,
               imageBase64: preparedBase64,
               maskBase64: maskBase64,
               size: GPT_WORKFLOW_SIZE 
            })
         });
         
         if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "OpenAI Generation Failed");
         }
         
         const data = await response.json();
         const rawResult = data.imageBase64;
         return await cropOpenAIResult(rawResult, cropInfo);
         
       } catch (err: any) {
         console.warn("OpenAI Failed. Falling back to Gemini 3.1.", err);
         selectedModel = 'gemini-3.1-flash-image-preview';
       }
    }

    // --- GEMINI FLOW ---
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: No API Key found (checked GEMINI_API_KEY and API_KEY)");
        throw new Error("API Key not configured");
    }
    const ai = new GoogleGenAI({ apiKey });
    const mimeType = base64Source.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    const cleanBase64 = base64Source.split(',')[1];

    if (selectedModel === 'auto' && !forceUltraQuality) {
       // Auto mode defaults to Flash for speed (1x call only)
       // Admin should explicitly select Ultra/Pro if high quality is needed
       selectedModel = 'gemini-3.1-flash-image-preview';
    }

    let apiAspectRatio = '9:16';
    if (outputRatio === '16:9') apiAspectRatio = '16:9';
    if (outputRatio === '9:16') apiAspectRatio = '9:16';
    if (outputRatio === '3:2') apiAspectRatio = '4:3';
    if (outputRatio === '2:3') apiAspectRatio = '3:4';

    const executeGenAI = async (model: string, useProConfig: boolean) => {
      // A. imageConfig optimization: No imageSize for Ultra unless explicitly requested (not in UI)
      const imageConfig: any = { aspectRatio: apiAspectRatio };

      let executionPrompt = finalPrompt;
      const parts: any[] = [];

      // 1. Construct Prompt based on Mode
      if (promptMode === 'booth') {
          executionPrompt = `[SYSTEM INSTRUCTION]
You are a professional photobooth AI. Your task is to place the person from the FIRST image into the background/environment of the SECOND image (Reference), while changing their clothing based on the THEME INSTRUCTION.

[CRITICAL RULES]
1. FACE IDENTITY LOCK: The face from the FIRST image (Person) must be preserved with high fidelity. Do not change facial features, age, or expression.
2. CLOTHING TRANSFORMATION: You MUST change the person's clothing based on the [THEME INSTRUCTION] provided below. Do NOT use the clothing from the Reference image unless it matches the theme.
3. BODY TRANSFORMATION: You may adapt the body pose to fit the new environment naturally.
4. NO MERGING/GHOSTING: The person must be clearly separated from the background. Enforce depth separation (air gap). No "pasted" look.
5. LIGHTING & SHADOWS: Apply realistic ground shadows and rim lighting to match the reference environment.
6. BACKGROUND: Use the SECOND image as the environment reference for the background. Keep it slightly softer focus to make the person pop.

[IMAGE ROLES]
- IMAGE 1: THE PERSON (Source of Face and Identity)
- IMAGE 2: THE REFERENCE (Source of Background and Environment)

[THEME INSTRUCTION]
${finalPrompt}`;
      } else if (promptMode === 'wrapped') {
          executionPrompt = `Edit the provided photo.
Rules:
- Detect ALL people in the photo and keep the SAME number of people.
- Preserve each person’s identity (face, skin tone, age, gender, expression).
- Do not remove, merge, replace, or add any person.
Instruction: ${finalPrompt}`;
      }

      // 2. Add Text Prompt (First)
      parts.push({ text: executionPrompt });

      // 3. Add Person Image (Image 1)
      parts.push({ inlineData: { data: cleanBase64, mimeType: mimeType } });

      // Helper to fetch and convert image to base64
      const fetchImageAsBase64 = async (urlOrBase64: string): Promise<{ data: string, mimeType: string }> => {
        if (urlOrBase64.startsWith('http')) {
          try {
            const response = await fetch(urlOrBase64);
            const blob = await response.blob();
            const mimeType = blob.type || 'image/jpeg';
            const base64data = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
            return { data: base64data.split(',')[1], mimeType };
          } catch (err) {
            console.error("Failed to fetch image URL:", err);
            return { 
              data: urlOrBase64.includes(',') ? urlOrBase64.split(',')[1] : urlOrBase64, 
              mimeType: 'image/jpeg' 
            };
          }
        } else {
          const data = urlOrBase64.includes(',') ? urlOrBase64.split(',')[1] : urlOrBase64;
          let mimeType = 'image/jpeg';
          if (urlOrBase64.startsWith('data:')) {
              mimeType = urlOrBase64.split(';')[0].split(':')[1];
          }
          return { data, mimeType };
        }
      };

      // 4. Add Concept Studio References (Split & BG)
      if (concept.reference_image_split || concept.reference_image_bg) {
        if (concept.reference_image_split) {
          const img = await fetchImageAsBase64(concept.reference_image_split);
          parts.push({ inlineData: img });
        }
        if (concept.reference_image_bg) {
          const img = await fetchImageAsBase64(concept.reference_image_bg);
          parts.push({ inlineData: img });
        }

        // Update prompt to instruct Gemini on how to use these new references
        parts[0].text = `Redraw the people in the main photo.
CRITICAL INSTRUCTION:
Look at the provided reference images.
- If a split reference image is provided (Reference Image 1), the man in the photo MUST wear the exact outfit shown on the LEFT side of Reference Image 1. The woman MUST wear the exact outfit shown on the RIGHT side of Reference Image 1. Retain the exact fabric, pattern, and design of the outfits.
- Place them in the exact environment shown in the background reference image (Reference Image 2).
Style: ${concept.style_preset || 'Photorealistic'}.
Additional instructions: ${finalPrompt}`;

      } else if (concept.refImage && concept.refImage.trim() !== '') {
         // Fallback to old refImage logic
         const img = await fetchImageAsBase64(concept.refImage);
         parts.push({ inlineData: img });
         
         if (promptMode === 'wrapped') {
             parts[0].text += `\n\n[IMPORTANT]: The SECOND image provided is a VISUAL REFERENCE for the style, background, or clothing. Combine the person from the FIRST image with the style/aesthetics of the SECOND image.`;
         }
      }

      // E. Logging Debug (Before Request)
      if (useProConfig) {
          const totalPayloadLength = parts.reduce((acc, p) => acc + (p.inlineData?.data?.length || 0), 0);
          console.log("🚀 [ULTRA DEBUG] Starting Request via Serverless Function:", {
              modelName: model,
              imageConfig,
              imageParts: parts.filter(p => p.inlineData).length,
              payloadSizeMB: `${(totalPayloadLength / 1024 / 1024).toFixed(2)} MB`
          });
      }

      const startTime = Date.now();

      // --- ULTRA MODE (SERVERLESS) ---
      if (useProConfig) {
        try {
          const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              parts,
              aspectRatio: apiAspectRatio
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Serverless Generation Failed");
          }

          const data = await response.json();
          console.log(`✅ [ULTRA DEBUG] Serverless Success in ${data.durationMs}ms (Total: ${Date.now() - startTime}ms)`);
          
          // Return a mock response object that matches the structure expected by the rest of the code
          return {
            candidates: [{
              content: {
                parts: [{
                  inlineData: {
                    data: data.imageBase64,
                    mimeType: 'image/png'
                  }
                }]
              },
              finishReason: 'STOP'
            }]
          } as any;
        } catch (err: any) {
          console.error("❌ [ULTRA DEBUG] Serverless Error:", err.message);
          throw err;
        }
      }

      // --- NORMAL MODE (CLIENT-SIDE SDK) ---
      return await ai.models.generateContent({
        model: model,
        contents: { parts: parts },
        config: { imageConfig: imageConfig }
      });
    };

    let response;
    try {
      const usePro = selectedModel.includes('pro') || selectedModel === 'gemini-3-pro-image-preview';
      response = await executeGenAI(usePro ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview', usePro);
    } catch (err: any) {
      console.warn(`Model ${selectedModel} failed. Reason:`, err.message);
      
      // Only fallback if NOT forcing ultra quality. 
      // If user forced Ultra, they likely prefer an error over a downgraded/slow result.
      if (!forceUltraQuality && (selectedModel.includes('pro'))) {
         console.log("Falling back to gemini-3.1-flash-image-preview...");
         response = await executeGenAI('gemini-3.1-flash-image-preview', false);
      } else {
        throw err;
      }
    }

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const candidate = candidates[0];
      if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData) {
              const mt = part.inlineData.mimeType || 'image/png';
              return `data:${mt};base64,${part.inlineData.data}`;
            }
          }
          for (const part of candidate.content.parts) {
             if (part.text) {
                 console.warn("Gemini returned text only:", part.text);
                 throw new Error(`AI Generation Refused: ${part.text}`);
             }
          }
      }
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          throw new Error(`Generation blocked. Reason: ${candidate.finishReason}`);
      }
    }
    throw new Error("No image data returned from Gemini (Empty Response)");
  } catch (error: any) {
    console.error("Gemini Generation Final Error:", error);
    throw error;
  } finally {
    if (forceUltraQuality) isGeneratingGlobal = false;
  }
};
