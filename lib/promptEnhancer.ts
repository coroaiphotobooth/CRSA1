export const getEnhancedPrompt = (
  basePrompt: string, 
  stylePreset: string, 
  composition: string
): { enhancedStyle: string, enhancedPrompt: string } => {
  
  let enhancedStyle = stylePreset;
  
  // 1. Base Instruction (Anti-Ghosting)
  const baseInstruction = "Render only the person or people present in the uploaded test photo. Any human figure appearing in the male outfit reference, female outfit reference, or background reference is for style and clothing guidance only, and must not appear as an additional subject in the final image.";

  // 2. Composition Enhancer
  let compositionPrompt = "";
  if (composition.includes('Full Body')) {
     compositionPrompt = "Camera: 35mm lens, cinematic wide shot. Ensure the subject's feet are naturally grounded with realistic floor shadows. Deep depth of field with a cohesive atmospheric background.";
  } else if (composition.includes('Half Body') || composition.includes('Medium')) {
     compositionPrompt = "Camera: 50mm lens, portrait photography. Moderate depth of field with a beautifully blurred background (bokeh) to make the subject pop, while keeping the environment recognizable.";
  } else if (composition.includes('Close Up')) {
     compositionPrompt = "Camera: 85mm macro portrait lens. Very shallow depth of field, stunning creamy background bokeh, hyper-detailed facial features, sharp focus on the eyes.";
  }

  // 3. Style Enhancer
  let stylePrompt = "";
  if (stylePreset === 'Photorealistic') {
     enhancedStyle = '3D Render (recommended)'; // Gemini handles photorealism better with this base style
     stylePrompt = "CRITICAL: Seamlessly integrate the subject into the background. Match the environmental lighting, color grading, and atmospheric perspective perfectly. Add realistic contact shadows on the ground and ambient occlusion. The final image MUST look like a single, cohesive, unedited photograph shot on location, with absolutely no cut-and-paste or green-screen artifacts. Shot on medium format camera, 8k resolution, award-winning photography.";
  } else if (stylePreset.includes('3D Render')) {
     stylePrompt = "Style: Premium 3D render, Pixar/Disney style, Unreal Engine 5 quality, octane render, global illumination, ray tracing, smooth stylized textures, vibrant colors, flawless 3D character design.";
  } else if (stylePreset === 'Cartoon Look') {
     stylePrompt = "Style: High quality 2D cartoon animation style, Studio Ghibli or modern anime aesthetic, clean cel shading, expressive features, vibrant flat colors, beautifully illustrated background.";
  } else if (stylePreset === 'Sketch Art') {
     stylePrompt = "Style: Detailed pencil sketch art, charcoal drawing, monochromatic or subtle watercolor washes, artistic strokes, expressive lines, hand-drawn masterpiece, architectural sketch background.";
  }

  let finalPrompt = basePrompt || "";
  
  if (!finalPrompt.includes("Render only the person or people present")) {
      finalPrompt = `${finalPrompt} ${baseInstruction}`;
  }
  if (compositionPrompt && !finalPrompt.includes("Camera:")) {
      finalPrompt = `${finalPrompt} ${compositionPrompt}`;
  }
  if (stylePrompt && !finalPrompt.includes("CRITICAL: Seamlessly integrate") && !finalPrompt.includes("Style: Premium 3D render") && !finalPrompt.includes("Style: High quality 2D cartoon") && !finalPrompt.includes("Style: Detailed pencil sketch")) {
      finalPrompt = `${finalPrompt} ${stylePrompt}`;
  }

  return { enhancedStyle, enhancedPrompt: finalPrompt.trim() };
};
