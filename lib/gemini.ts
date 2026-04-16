
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
    let finalStyle = concept.style_preset || 'Photorealistic';

    if (finalStyle === 'Photorealistic') {
      finalStyle = '3D Render (recommended)';
      const photorealisticSuffix = "Render only the person or people present in the uploaded test photo. Any human figure appearing in the male outfit reference, female outfit reference, or background reference is for style and clothing guidance only, and must not appear as an additional subject in the final image. Style: ultra realistic premium portrait, natural skin texture, professional editorial finish, soft cinematic light, lifelike hair detail, elegant and polished commercial-quality rendering.";
      if (!finalPrompt?.includes("Render only the person or people present in the uploaded test photo")) {
        finalPrompt = finalPrompt ? `${finalPrompt} ${photorealisticSuffix}` : photorealisticSuffix;
      }
    }

    // Default to 'booth' mode if a reference image is provided and mode is 'wrapped' (default)
    if ((concept.refImage || concept.reference_image_split || concept.reference_image_bg) && promptMode === 'wrapped') {
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
          if (concept.reference_image_split || concept.reference_image_bg) {
              executionPrompt = `[SYSTEM INSTRUCTION]
You are a professional photobooth AI. Your task is to redraw the people from the MAIN PHOTO using the provided REFERENCE IMAGES and THEME INSTRUCTION.

[CRITICAL RULES]
1. FACE IDENTITY LOCK: The face from the MAIN PHOTO must be preserved with high fidelity. Do not change facial features, age, or expression.
2. CLOTHING TRANSFORMATION: If REFERENCE IMAGE 1 (Clothing) is provided, you MUST change the person's clothing to match it exactly.
3. BACKGROUND: If REFERENCE IMAGE 2 (Background) is provided, place them in that exact environment.
4. NO MERGING/GHOSTING: The person must be clearly separated from the background. Enforce depth separation (air gap). No "pasted" look.
5. LIGHTING & SHADOWS: Apply realistic ground shadows and rim lighting to match the reference environment.

[THEME INSTRUCTION]
${finalPrompt}`;
          } else {
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
          }
      } else if (promptMode === 'wrapped') {
          executionPrompt = `Edit the provided photo.
Rules:
- Detect ALL people in the photo and keep the SAME number of people.
- Preserve each person’s identity (face, skin tone, age, gender, expression).
- Do not remove, merge, replace, or add any person.
Instruction: ${finalPrompt}`;
      }

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

      if (promptMode === 'booth' && (concept.reference_image_split || concept.reference_image_bg)) {
        // MATCH CONCEPT STUDIO EXACTLY
        const textPrompt = `Redraw the people in the main photo.
CRITICAL INSTRUCTION:
1. Analyze the people in the main photo. Count them and identify their genders.
2. YOU MUST ONLY draw the exact number of people present in the main photo. Do not add any extra people.
3. Look at the provided reference images. Reference Image 1 is a split image showing a male outfit on the LEFT and a female outfit on the RIGHT.
4. For EVERY male in the main photo, dress them in the exact outfit shown on the LEFT side of Reference Image 1.
5. For EVERY female in the main photo, dress them in the exact outfit shown on the RIGHT side of Reference Image 1.
6. Place them in the exact environment shown in the background reference image (Reference Image 2).
Style: ${finalStyle}.
Additional instructions: ${finalPrompt}`;

        parts.push({ text: textPrompt });
        parts.push({ inlineData: { data: cleanBase64, mimeType: mimeType } });

        if (concept.reference_image_split) {
          const img = await fetchImageAsBase64(concept.reference_image_split);
          parts.push({ inlineData: img });
        }
        if (concept.reference_image_bg) {
          const img = await fetchImageAsBase64(concept.reference_image_bg);
          parts.push({ inlineData: img });
        }
      } else {
        // OLD LOGIC FOR OTHER MODES
        // 2. Add Text Prompt (First)
        parts.push({ text: "MAIN PHOTO (People to redraw):" });

        // 3. Add Person Image (Image 1)
        parts.push({ inlineData: { data: cleanBase64, mimeType: mimeType } });

        if (concept.refImage && concept.refImage.trim() !== '') {
           parts.push({ text: "REFERENCE IMAGE (Style/Background/Clothing):" });
           const img = await fetchImageAsBase64(concept.refImage);
           parts.push({ inlineData: img });
           
           parts.push({ text: executionPrompt + `\n\n[IMPORTANT]: The REFERENCE IMAGE provided is a VISUAL REFERENCE for the style, background, or clothing. Combine the person from the MAIN PHOTO with the style/aesthetics of the REFERENCE IMAGE.\nStyle: ${finalStyle}.` });
        } else {
           parts.push({ text: executionPrompt + `\nStyle: ${finalStyle}.` });
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

export type ConceptChatMessage = {
  role: 'user' | 'model';
  text: string;
  images?: string[]; // array of base64 strings
};

export const chatWithConceptDesigner = async (
  messages: ConceptChatMessage[]
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
      console.error("CRITICAL: No API Key found");
      throw new Error("API Key not configured");
  }
  const ai = new GoogleGenAI({ apiKey });

  const SYSTEM_INSTRUCTION = `Kamu adalah AI Concept Designer ahli untuk Photobooth CoroAI. Tugasmu adalah mengubah permintaan kasar pengguna menjadi struktur prompt gambar profesional yang presisi.

KAMU HARUS SELALU merespons dengan format standar ini secara utuh:
AUTO-DETECT SUBJECT
[Teks di sini]

IDENTITY PRESERVATION
[Teks di sini]

CORE CONCEPT
[Teks di sini]

OUTFIT
[Teks di sini]

BACKGROUND
[Teks di sini]

LIGHTING
[Teks di sini]

POSE
[Teks di sini]

COMPOSITION
[Teks di sini]

NEGATIVE PROMPT
[Teks di sini]

ATURAN PENTING:
1. Jika user meminta perubahan spesifik (misal: ganti latar), KAMU HANYA BOLEH MENGUBAH bagian yang sesuai (misal: BACKGROUND). Biarkan bagian lain SAMA PERSIS seperti sebelumnya.
2. Namun, kamu HARUS SELALU membalas dengan KESELURUHAN STRUKTUR (semua 9 kategori) agar user bisa melihat hasil akhirnya secara utuh. Jangan pernah hanya membalas bagian yang diubah.
3. Setelah mencetak struktur prompt secara utuh, berikan 2-4 bullet point berupa "Sugesti Tambahan" (ide/variasi menarik) untuk vendor.
4. Jika user mengupload gambar, analisis gambar tersebut (misal pakaian adat, wajah, atau latar belakang kota/alam) dan langsung Deskripsikan sedetail mungkin sebagai teks visual yang kuat ke dalam kategori yang tepat (misal OUTFIT atau BACKGROUND).

CONTOH DEFAULT UNTUK BAGIAN TETAP (Selalu gunakan ini kecuali user meminta lain):
AUTO-DETECT SUBJECT:
Detect all real human subjects in the uploaded photo automatically. Preserve the exact number of people exactly as in the original image. Apply the transformation consistently to all detected subjects.

IDENTITY PRESERVATION:
Preserve the exact identity of every subject very strongly. Keep the original facial structure, skin tone, hairstyle, age appearance, and body proportions. Do not change the person's identity.

NEGATIVE PROMPT:
Do not change the subject's identity, face, skin tone, or age. Do not make the outfit look like generic costume cosplay. Avoid extra people, extra limbs, duplicate body parts, blurred face, distorted body.`;

  const contents = messages.map(msg => {
    const parts: any[] = [];
    if (msg.images && msg.images.length > 0) {
      msg.images.forEach(img => {
        parts.push({
          inlineData: {
            mimeType: img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
            data: img.split(',')[1]
          }
        });
      });
    }
    parts.push({ text: msg.text });
    return {
      role: msg.role === 'model' ? 'model' : 'user',
      parts
    };
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7 
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
          return candidate.content.parts.map((p: any) => p.text).join('').trim();
      }
    }
    throw new Error("Empty response from AI Concept Designer.");
  } catch (error) {
    console.error("AI Concept Designer Error:", error);
    throw error;
  }
};
