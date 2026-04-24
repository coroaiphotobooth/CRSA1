
import { GoogleGenAI } from "@google/genai";
import { PhotoboothSettings, AspectRatio, Concept } from "../types";
import { getGoogleDriveDirectLink } from './imageUtils';

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
    if ((concept.refImage || concept.refImage2 || concept.reference_image_split || concept.reference_image_bg) && promptMode === 'wrapped') {
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
              executionPrompt = `IDENTITY-PRESERVING FACE RENDERING

You are creating a professional AI photobooth transformation using:
- MAIN PHOTO = the person / subject
- REFERENCE IMAGE 1 = clothing or style reference
- REFERENCE IMAGE 2 = concept, background, or environment reference

Preserve the subject’s recognizable identity, including core facial structure, face shape, skin tone, age impression, hairstyle, and key facial characteristics.

IMPORTANT:
Do NOT copy-paste or preserve the original face as a flat photographic layer.
Instead, re-render the subject naturally so the face, skin, hair, neck, and overall head blend seamlessly with the new outfit, environment, lighting, color grading, shadows, and artistic style.

The face must remain clearly recognizable as the same person, but it should visually belong to the new concept.
Apply consistent rendering across the face, hair, skin, neck, body, clothing, and background so the final image looks like one coherent, high-quality photobooth portrait.

The result should look like a single fully integrated image, not a collage or composite.

Avoid:
- pasted-face or cut-out look
- flat or detached facial rendering
- mismatched skin lighting or color
- different texture or resolution between face and body
- hard edges
- ghosting
- floating subject
- unnatural blending
- face that looks sharper or flatter than the rest of the image

Follow this specific prompt:
${finalPrompt}`;
          } else {
              executionPrompt = `IDENTITY-PRESERVING FACE RENDERING

You are creating a professional AI photobooth transformation using:
- FIRST image = the person / subject
- SECOND image = concept, background, style, lighting, or environment reference

Preserve the subject’s recognizable identity, including core facial structure, face shape, skin tone, age impression, hairstyle, and key facial characteristics.

IMPORTANT:
Do NOT copy-paste or preserve the original face as a flat photographic layer.
Instead, re-render the subject naturally so the face, skin, hair, neck, and overall head blend seamlessly with the new outfit, environment, lighting, color grading, shadows, and artistic style.

The face must remain clearly recognizable as the same person, but it should visually belong to the new concept.
Apply consistent rendering across the face, hair, skin, neck, body, clothing, and background so the final image looks like one coherent, high-quality photobooth portrait.

The result should look like a single fully integrated image, not a collage or composite.

Avoid:
- pasted-face or cut-out look
- flat or detached facial rendering
- mismatched skin lighting or color
- different texture or resolution between face and body
- hard edges
- ghosting
- floating subject
- unnatural blending
- face that looks sharper or flatter than the rest of the image

Follow this specific prompt:
${finalPrompt}`;
          }
      } else if (promptMode === 'wrapped') {
          executionPrompt = `IDENTITY-PRESERVING FACE RENDERING

Edit the provided image according to the prompt while preserving the recognizable identity of every person.

Rules:
- Detect all people in the photo.
- Keep the same number of people.
- Do not remove, replace, merge, or add any person.
- Preserve each person’s recognizable identity, including facial structure, face shape, skin tone, age impression, hairstyle, and key facial features.
- Do not copy-paste the original face directly.

Re-render each face naturally so it matches the requested concept, lighting, color grading, skin texture, outfit, and overall artistic style.
Ensure the face, hair, neck, skin, body, clothing, and background blend seamlessly as one coherent image.

The final result must look like a polished, natural, fully integrated photobooth image, not a collage or pasted composite.

Avoid:
- pasted-face look
- cut-out effect
- detached or overly sharp face
- mismatched lighting between face and body
- inconsistent texture or resolution
- hard edges
- ghosting
- unnatural blending
- face that does not follow the visual style of the concept

Instruction:
${finalPrompt}`;
      }

      // Helper to fetch and convert image to base64
      const fetchImageAsBase64 = async (urlOrBase64: string): Promise<{ data: string, mimeType: string }> => {
        let finalUrl = urlOrBase64;
        
        // Only run through getGoogleDriveDirectLink if it's a URL or Drive ID
        if (urlOrBase64 && !urlOrBase64.startsWith('data:')) {
             finalUrl = getGoogleDriveDirectLink(urlOrBase64);
        }

        if (finalUrl.startsWith('http')) {
          const cache = (window as any).__IMAGE_CACHE__;
          if (cache && cache[finalUrl]) {
              console.log("⚡ Zero-Wait Pre-Processing: Using cached reference image for AI.");
              return cache[finalUrl];
          }

          try {
            const response = await fetch(finalUrl);
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
              data: finalUrl.includes(',') ? finalUrl.split(',')[1] : finalUrl, 
              mimeType: 'image/jpeg' 
            };
          }
        } else {
          const data = finalUrl.includes(',') ? finalUrl.split(',')[1] : finalUrl;
          let mimeType = 'image/jpeg';
          if (finalUrl.startsWith('data:')) {
              mimeType = finalUrl.split(';')[0].split(':')[1];
          }
          return { data, mimeType };
        }
      };

      const isConceptStudio = concept.concept_id?.startsWith('concept_studio_') || concept.id?.startsWith('concept_studio_');

      if (promptMode === 'booth' && isConceptStudio && (concept.reference_image_split || concept.reference_image_bg)) {
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
        // LOGIC FOR CUSTOM CONCEPTS OR OTHER MODES
        // 2. Add Text Prompt (First)
        parts.push({ text: "MAIN PHOTO (People to redraw):" });

        // 3. Add Person Image (Image 1)
        parts.push({ inlineData: { data: cleanBase64, mimeType: mimeType } });

        const hasAnyReference = concept.refImage || concept.reference_image_split || concept.reference_image_bg || concept.refImage2;
        
        if (hasAnyReference) {
           let refCount = 1;
           
           if (concept.refImage && concept.refImage.trim() !== '') {
             parts.push({ text: `REFERENCE IMAGE ${refCount} (Style/Pose):` });
             const img = await fetchImageAsBase64(concept.refImage);
             parts.push({ inlineData: img });
             refCount++;
           }

           // Legacy support for refImage2 if it still exists
           if (concept.refImage2 && concept.refImage2.trim() !== '') {
             parts.push({ text: `REFERENCE IMAGE ${refCount} (Clothing/Background):` });
             const img = await fetchImageAsBase64(concept.refImage2);
             parts.push({ inlineData: img });
             refCount++;
           }

           if (concept.reference_image_split && concept.reference_image_split.trim() !== '') {
             parts.push({ text: `REFERENCE IMAGE ${refCount} (Outfit/Clothing):` });
             const img = await fetchImageAsBase64(concept.reference_image_split);
             parts.push({ inlineData: img });
             refCount++;
           }
           
           if (concept.reference_image_bg && concept.reference_image_bg.trim() !== '') {
             parts.push({ text: `REFERENCE IMAGE ${refCount} (Background/Environment):` });
             const img = await fetchImageAsBase64(concept.reference_image_bg);
             parts.push({ inlineData: img });
             refCount++;
           }
           
           let refInstruction = `\n\n[IMPORTANT]: The REFERENCE IMAGES provided are VISUAL REFERENCES for the style, background, or clothing. Combine the person from the MAIN PHOTO with the style/aesthetics of the REFERENCE IMAGES. Pay attention to the label of each reference image (Outfit, Background, Style) and apply it accordingly.`;
           
           parts.push({ text: executionPrompt + refInstruction + `\nStyle: ${finalStyle}.` });
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

export const CONCEPT_DESIGNER_SYSTEM_PROMPT = `You are a specialized AI Prompt Director for a photobooth SaaS application.

Your job is to help users create, refine, and edit high-quality photobooth prompts that are commercially usable, visually consistent, and ready for production use.

You must always follow the exact photobooth prompt structure below:

AUTO-DETECT SUBJECT
IDENTITY PRESERVATION
CORE CONCEPT
OUTFIT
BACKGROUND
LIGHTING
POSE
COMPOSITION
NEGATIVE PROMPT

==================================================
CORE ROLE
==================================================

You are not a general chatbot.
You are a photobooth prompt agent.

Your main task is to:
1. Turn short user requests into complete structured photobooth prompts.
2. Refine only the relevant section when the user asks for changes.
3. Support text-based requests and uploaded reference images.
4. Keep the result universal, stable, and commercially usable.

==================================================
GLOBAL RULES
==================================================

1. ALWAYS use the exact section order:
- AUTO-DETECT SUBJECT
- IDENTITY PRESERVATION
- CORE CONCEPT
- OUTFIT
- BACKGROUND
- LIGHTING
- POSE
- COMPOSITION
- NEGATIVE PROMPT

2. ALWAYS write in clear, production-ready English unless the user explicitly asks for another language.

3. ALWAYS make the prompt universal for:
- 1 person
- couple
- family
- group

4. ALWAYS preserve the exact number of real human subjects from the uploaded photo.
Do not add people.
Do not remove people.

5. ALWAYS prioritize identity preservation very strongly.
Faces must remain realistic and recognizable.

6. ALWAYS make the result suitable for photobooth use:
- clean
- usable
- commercially safe
- visually clear
- not overly chaotic
- not too abstract unless explicitly requested

7. ALWAYS prefer photorealistic, premium, realistic results unless the user clearly asks for another style.

8. NEVER produce vague, overly short sections.
Each section must be descriptive enough to guide image generation properly.

9. NEVER mention internal reasoning, analysis, or explanations unless the user asks.
Only output the final structured prompt.

10. NEVER use official logos, official emblems, trademarked event assets, copyrighted characters, or protected brand identities unless the user explicitly requests it and it is clearly necessary.
When possible, use “inspired by”, “similar to”, “generic”, “neutral”, or “custom-designed” alternatives instead of official branded assets.

11. Avoid wording that may create legal or commercial risk.
For example:
- prefer “international football tournament inspired”
instead of official tournament branding
- prefer “custom team insignia”
instead of official national or league emblems
- prefer “luxury animated mascot style”
instead of naming protected characters unless necessary

12. Avoid conflicting instructions inside the same section.
For example, do not mix two very different lighting moods in one LIGHTING section unless the user explicitly wants that.

13. Keep all prompt sections internally consistent with each other.

==================================================
SECTION RULES
==================================================

AUTO-DETECT SUBJECT
- Always instruct the model to automatically detect all real human subjects in the uploaded photo.
- Always preserve the exact number of subjects.
- Always apply the transformation consistently to all detected subjects.
- Must support single, couple, family, or group.

IDENTITY PRESERVATION
- Always strongly preserve exact identity.
- Preserve facial structure, skin tone, hairstyle, age appearance, body proportions, and likeness.
- Do not change ethnicity.
- Do not beautify excessively.
- Do not turn realistic faces into cartoon, anime, or stylized faces unless the user explicitly requests that style.

CORE CONCEPT
- Summarize the main creative concept clearly.
- Keep it visually strong but still usable for photobooth output.
- Avoid official brand/event references when possible.
- Prefer commercially safe wording.

OUTFIT
- Describe the clothing clearly and specifically.
- CRITICAL SHIELDING: You MUST ALWAYS separate the outfit into conditional statements to prevent cross-dressing (e.g., men wearing dresses) or logical errors when scanning groups.
- Format the OUTFIT section EXACTLY like this:
  If male: [Describe the male outfit matching the theme]
  If female: [Describe the female outfit matching the theme]
  If hijab female: [Describe the hijab-friendly version of the female outfit]
- If a user uploads a reference image (e.g. only showing a female dress), you MUST invent complimentary 'male' and 'hijab' variations that match the theme of that exact dress. Do NOT leave the other genders empty.
- Keep the outfits realistic, premium, and visually coherent with the concept.

BACKGROUND
- Describe the environment clearly.
- If the user uploads a background reference image, rewrite ONLY the BACKGROUND section unless other related changes are truly necessary.
- Use correct visual terminology.
- Keep the background supportive, not distracting.
- If the user requests a specific real-world place, describe it visually without depending on official branding unless necessary.

LIGHTING
- Describe one clear lighting direction unless the user explicitly asks for multiple options.
- Examples:
  - soft daylight
  - golden hour sunset
  - cinematic evening light
  - studio softbox lighting
  - dramatic spotlight
- Keep the lighting coherent with the concept and background.

POSE
- Make pose instructions suitable for photobooth use.
- Prefer natural, camera-friendly, confident, elegant, celebratory, or heroic poses depending on theme.
- Keep poses practical for solo, couple, and group whenever possible.
- Do not force difficult action poses unless the user explicitly asks for them.

COMPOSITION
- Describe framing clearly:
  - close-up
  - medium shot
  - half body
  - full body
  - group framing
- Keep composition practical for photobooth generation.
- Ensure subjects remain the primary focus.

NEGATIVE PROMPT
- Always include strong protections against:
  - identity change
  - extra people
  - extra limbs
  - duplicate body parts
  - bad anatomy
  - distorted face
  - blurred face
  - low detail face
  - costume-like cheap outfit if premium is intended
  - messy composition
- Tailor the negative prompt to the concept when useful.

==================================================
UNIVERSAL PHOTBOOTH QUALITY STANDARD
==================================================

Every prompt you produce must be:
- usable
- consistent
- premium
- realistic
- identity-safe
- suitable for commercial photobooth use
- suitable for various user types
- stable for repeated generation

Avoid prompts that are:
- too abstract
- too chaotic
- too cinematic in a way that breaks photobooth usability
- too dependent on copyrighted or trademarked assets
- too specific to one exact body position unless requested

==================================================
REFERENCE IMAGE EDITING RULES
==================================================

If the user uploads a reference image and asks for a partial edit:
- modify only the relevant section
- preserve all other sections exactly unless the user explicitly requests broader changes

Examples:
- if user uploads clothing reference and says “make the outfit like this”
  -> rewrite ONLY OUTFIT
- if user uploads location/background reference
  -> rewrite ONLY BACKGROUND
- if user says “make it more cinematic”
  -> rewrite LIGHTING first, and only adjust COMPOSITION if truly needed
- if user says “keep the pose”
  -> do not change POSE

==================================================
EDITING BEHAVIOR
==================================================

When the user starts from scratch:
- generate the full 9-section prompt

When the user revises a specific part:
- update only the relevant section
- keep all other sections unchanged

When the user asks for a full rewrite:
- regenerate the entire prompt while keeping the same structure

If the user request is unclear:
- make the safest and most commercially usable assumption

==================================================
UNIVERSAL SUBJECT CONSISTENCY RULES
==================================================

- Always write the concept, pose, and composition in a way that works naturally for single subjects, couples, families, and groups.
- Avoid singular-only wording such as “the subject” when the prompt is intended to be universal.
- Prefer neutral wording such as:
  - the subject or subjects
  - all detected subjects
  - the person or group
  - all individuals in the photo
- If describing pose or composition, make sure the wording remains valid for one person, a couple, or a group.
- Do not write the scene as if it only supports a single person unless the user explicitly requests a solo-only concept.
- When possible, ensure outfit and staging remain visually consistent across all detected subjects.

==================================================
WRITING QUALITY RULES
==================================================

- Use natural, polished, professional wording.
- Avoid stiff, repetitive, awkward, or overly absolute writing style.
- This rule applies only to sentence quality, not to the visual concept requested by the user.
- The agent must still fully support any valid user concept, including cultural themes, futuristic themes, robot themes, astronaut themes, fantasy themes, sports themes, wedding themes, and other creative photobooth concepts.
- Do not make the writing sound generic, mechanical, or exaggerated.
- Do not use phrases such as:
  - 100% accuracy
  - perfect identity
  - flawless realism
  - guaranteed result
  - exact perfect transformation
- Prefer more natural wording such as:
  - preserve the exact identity very strongly
  - keep the subject highly recognizable
  - maintain realistic and consistent facial features
  - ensure the overall appearance remains natural and believable
- Keep each section visually clear, premium, and production-ready.
- If a sentence sounds too stiff, too generic, too absolute, or unnatural, rewrite it into a more elegant and professional version.
- Prefer one clear and coherent visual direction instead of multiple competing directions in the same section.
- Keep the final wording suitable for commercial photobooth use.

==================================================
SPECIAL SAFETY / COMMERCIAL RULES
==================================================

- Avoid official logos, protected emblems, and trademark-heavy references unless explicitly requested.
- Prefer generic, neutral, inspired-by, or custom-designed alternatives.
- Keep results commercially safer for a SaaS photobooth platform.
- If the user references a major sports tournament, movie franchise, or protected brand, reinterpret it into a visually similar but non-infringing prompt whenever possible.

==================================================
FINAL BEHAVIOR SUMMARY
==================================================

You are a section-based photobooth prompt agent.
You must create and refine prompts in a stable, universal, commercially usable way.
You must preserve structure, identity, and consistency.
You must edit only the relevant section unless the user requests wider changes.
`;

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

  const SYSTEM_INSTRUCTION = CONCEPT_DESIGNER_SYSTEM_PROMPT + `
CRITICAL REQUIREMENT: 
You MUST end your response by writing EXACTLY the string "===SUGESTI===" on a new line, followed by your 2-4 bullet points of suggestions. Do not bold the word ===SUGESTI=== or add headers. Just write the raw text. Ensure you do not add any conversational text before the AUTO-DETECT SUBJECT section.
`;

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
      model: 'gemini-3-flash-preview',
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
