import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { model, parts, aspectRatio } = req.body;

  if (!model || !parts || !aspectRatio) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key not configured on server' });
  }

  const ai = new GoogleGenAI({ apiKey });
  const startTime = Date.now();
  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: { parts: parts },
        config: { 
          imageConfig: { aspectRatio } 
          // imageSize: '1K' is NOT set by default as per request
        }
      });

      const durationMs = Date.now() - startTime;
      
      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        const candidate = candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData) {
              return res.status(200).json({
                imageBase64: part.inlineData.data,
                durationMs
              });
            }
          }
          
          // Handle text-only response (refusal)
          for (const part of candidate.content.parts) {
            if (part.text) {
              return res.status(400).json({ error: `AI Refused: ${part.text}` });
            }
          }
        }
        
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          return res.status(400).json({ error: `Generation blocked: ${candidate.finishReason}` });
        }
      }

      throw new Error("No image data returned from Gemini");

    } catch (err: any) {
      const errorMsg = err.message || "";
      const isOverload = errorMsg.includes("503") || 
                        errorMsg.includes("UNAVAILABLE") || 
                        errorMsg.includes("RESOURCE_EXHAUSTED") ||
                        errorMsg.includes("HIGH_DEMAND") ||
                        errorMsg.includes("overloaded");

      if (isOverload && attempt < maxRetries) {
        attempt++;
        const backoff = attempt * 1000;
        console.log(`[API] Overload attempt ${attempt}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      console.error("[API] Gemini Error:", errorMsg);
      return res.status(err.status || 500).json({ error: errorMsg });
    }
  }

  return res.status(503).json({ error: 'Service Unavailable after retries' });
}
