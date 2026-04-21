
/**
 * Mengubah URL Google Drive biasa menjadi Direct Link yang ramah CDN (lh3).
 * URL lh3 jauh lebih cepat dan tidak kena limit 403 Forbidden di tag <img>.
 */
export const getGoogleDriveDirectLink = (url: string | null): string => {
  if (!url) return '';
  if (url.startsWith('data:')) return url; // Base64 pass through
  if (url.includes('supabase.co')) return url; // Supabase pass through

  // Regex untuk menangkap ID file dari berbagai format URL Drive
  const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  
  if (match && match[1]) {
    // Format lh3.googleusercontent.com/d/{ID} memaksa download/render gambar langsung
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  
  return url;
};

export const resizeImage = (base64Str: string, maxDimension: number = 1024, quality: number = 0.9): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => reject(new Error("Image load error"));
    img.src = base64Str;
  });
};

/**
 * Memastikan gambar memiliki aspect ratio tertentu (seperti 544x736) 
 * dengan menambahkan padding hitam agar tidak di-crop oleh API Video (Seedance)
 */
export const padImageForVideo = (base64Str: string, targetW: number = 544, targetH: number = 736): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      // Fill background with black
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, targetW, targetH);

      const targetRatio = targetW / targetH;
      const imgRatio = img.width / img.height;

      let drawW, drawH, x, y;

      if (imgRatio > targetRatio) {
        // Image is wider than target
        drawW = targetW;
        drawH = targetW / imgRatio;
        x = 0;
        y = (targetH - drawH) / 2;
      } else {
        // Image is taller than target
        drawH = targetH;
        drawW = targetH * imgRatio;
        x = (targetW - drawW) / 2;
        y = 0;
      }

      // Draw the image centered
      ctx.drawImage(img, x, y, drawW, drawH);
      
      // Seedance specifically works best with JPEG or PNG without alpha
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = (e) => reject(new Error("Image load error for padding"));
    img.src = base64Str;
  });
};

// Cache for preloaded images
const imageCache: Record<string, HTMLImageElement> = {};

export const preloadImage = (src: string, isCors = false): Promise<HTMLImageElement> => {
  if (imageCache[src]) return Promise.resolve(imageCache[src]);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (isCors) img.crossOrigin = "Anonymous";
    img.referrerPolicy = "no-referrer"; 
    img.onload = () => {
      imageCache[src] = img;
      resolve(img);
    };
    img.onerror = (e) => reject(new Error("Image load error"));
    img.src = src;
  });
};

export const applyOverlay = async (
    base64AI: string, 
    overlayUrl: string | null, 
    targetWidth: number, 
    targetHeight: number
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context unavailable");
  
    const loadImg = (src: string, isCors = false): Promise<HTMLImageElement> => {
      if (imageCache[src]) return Promise.resolve(imageCache[src]);
      return new Promise((resolve, reject) => {
        const img = new Image();
        if (isCors) img.crossOrigin = "Anonymous";
        img.referrerPolicy = "no-referrer"; 
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error("Image load error"));
        img.src = src;
      });
    };
  
    try {
      const baseImg = await loadImg(base64AI);
      const scale = Math.max(targetWidth / baseImg.width, targetHeight / baseImg.height);
      const x = (targetWidth / 2) - (baseImg.width / 2) * scale;
      const y = (targetHeight / 2) - (baseImg.height / 2) * scale;
      ctx.drawImage(baseImg, x, y, baseImg.width * scale, baseImg.height * scale);
  
      if (overlayUrl && overlayUrl.trim() !== '') {
        // Gunakan helper baru untuk memastikan link stabil
        const directUrl = getGoogleDriveDirectLink(overlayUrl);
        
        // Coba load dengan CORS anonymous (untuk lh3 link)
        try {
            const ovrImg = await loadImg(directUrl, true);
            ctx.drawImage(ovrImg, 0, 0, targetWidth, targetHeight);
        } catch (e) {
            console.warn("Direct overlay load failed, trying standard fetch...");
            // Fallback: Fetch blob manual jika CORS image load gagal
            const resp = await fetch(directUrl);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const ovrImg = await loadImg(blobUrl);
            ctx.drawImage(ovrImg, 0, 0, targetWidth, targetHeight);
            URL.revokeObjectURL(blobUrl);
        }
      }
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (err) {
      console.error("Canvas composition error:", err);
      return base64AI;
    }
  };

export const applyPrintOrientation = (canvas: HTMLCanvasElement, orientation?: 'auto' | 'portrait' | 'landscape'): HTMLCanvasElement => {
  if (!orientation || orientation === 'auto') return canvas;
  const isLandscape = canvas.width > canvas.height;
  
  if (orientation === 'portrait' && isLandscape) {
    const rotated = document.createElement('canvas');
    rotated.width = canvas.height;
    rotated.height = canvas.width;
    const ctx = rotated.getContext('2d');
    if (ctx) {
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate(90 * Math.PI / 180);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    }
    return rotated;
  } else if (orientation === 'landscape' && !isLandscape) {
    const rotated = document.createElement('canvas');
    rotated.width = canvas.height;
    rotated.height = canvas.width;
    const ctx = rotated.getContext('2d');
    if (ctx) {
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate(-90 * Math.PI / 180);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    }
    return rotated;
  }
  return canvas;
};

export const processPrintOrientation = async (base64Image: string, orientation?: 'auto' | 'portrait' | 'landscape'): Promise<string> => {
  if (!orientation || orientation === 'auto') return base64Image;
  try {
      const img = await preloadImage(base64Image, true);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return base64Image;
      ctx.drawImage(img, 0, 0);
      
      const rotated = applyPrintOrientation(canvas, orientation);
      if (rotated === canvas) return base64Image;
      return rotated.toDataURL('image/jpeg', 0.95);
  } catch (err) {
      console.error("Orientation error:", err);
      return base64Image;
  }
};

export const applyPrintAdjustments = async (
  base64Image: string,
  brightness: number = 0,
  transparency: number = 0
): Promise<string> => {
  if (brightness === 0 && transparency === 0) return base64Image;
  
  try {
    const img = await preloadImage(base64Image, true);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return base64Image;

    // Fill white background to blend transparency
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Transparency logic: 
    // Positive transparency fades image to white (reduces alpha). 
    // e.g., +1 = 95% alpha (5% white).
    const alpha = transparency > 0 ? Math.max(0.05, 1.0 - (transparency * 0.05)) : 1.0;
    ctx.globalAlpha = alpha;

    // Negative transparency boosts contrast (makes blacks blacker). e.g., -1 = 105% contrast.
    const contrastFilter = transparency < 0 ? 100 + (Math.abs(transparency) * 5) : 100;
    
    // Brightness logic: +1 = 105% brightness
    const brightnessFilter = 100 + (brightness * 5);
    
    ctx.filter = `brightness(${brightnessFilter}%) contrast(${contrastFilter}%)`;

    ctx.drawImage(img, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (e) {
    console.error("Print adjustments failed", e);
    return base64Image;
  }
};

export const createMergedPrintLayout = async (
  base64Image1: string,
  base64Image2: string,
  originalWidth: number,
  originalHeight: number,
  orientation: 'auto' | 'portrait' | 'landscape' = 'auto'
): Promise<string> => {
  try {
    const img1 = await preloadImage(base64Image1, true);
    const img2 = await preloadImage(base64Image2, true);
    
    const canvas = document.createElement('canvas');
    
    // Use Landscape 4R (3:2) layout for side-by-side base
    const longestSide = Math.max(originalWidth, originalHeight);
    canvas.width = longestSide;
    canvas.height = Math.round(longestSide * (2 / 3));
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale1 = Math.min(canvas.height / img1.height, (canvas.width / 2) / img1.width);
    const scale2 = Math.min(canvas.height / img2.height, (canvas.width / 2) / img2.width);
    
    const scaledWidth1 = img1.width * scale1;
    const scaledHeight1 = img1.height * scale1;
    
    const scaledWidth2 = img2.width * scale2;
    const scaledHeight2 = img2.height * scale2;
    
    const startY1 = (canvas.height - scaledHeight1) / 2;
    const startY2 = (canvas.height - scaledHeight2) / 2;
    
    ctx.drawImage(img1, 0, startY1, scaledWidth1, scaledHeight1);
    ctx.drawImage(img2, scaledWidth1, startY2, scaledWidth2, scaledHeight2);

    const finalCanvas = applyPrintOrientation(canvas, orientation);
    return finalCanvas.toDataURL('image/jpeg', 0.95);
  } catch (error) {
    console.error("Failed to create merged print layout", error);
    return base64Image2;
  }
};

export const createDoublePrintLayout = async (
  base64Image: string,
  originalWidth: number,
  originalHeight: number,
  mode: 'duplicate' | 'single_2r' = 'duplicate',
  orientation: 'auto' | 'portrait' | 'landscape' = 'auto'
): Promise<string> => {
  try {
    const img = await preloadImage(base64Image, true);
    
    const canvas = document.createElement('canvas');
    
    // Use Landscape 4R (3:2) layout for base
    const longestSide = Math.max(originalWidth, originalHeight);
    canvas.width = longestSide;
    canvas.height = Math.round(longestSide * (2 / 3));
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.height / img.height, (canvas.width / 2) / img.width);
    
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;
    
    const startY = (canvas.height - scaledHeight) / 2;
    
    // Draw first image mepet kiri
    ctx.drawImage(img, 0, startY, scaledWidth, scaledHeight);
    
    if (mode === 'duplicate') {
       ctx.drawImage(img, scaledWidth, startY, scaledWidth, scaledHeight);
    }

    const finalCanvas = applyPrintOrientation(canvas, orientation);
    return finalCanvas.toDataURL('image/jpeg', 0.95);
  } catch (err) {
    console.error("Image load error for print layout:", err);
    return base64Image;
  }
};
