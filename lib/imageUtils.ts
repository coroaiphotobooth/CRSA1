
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

export const createDoublePrintLayout = async (
  base64Image: string,
  originalWidth: number,
  originalHeight: number
): Promise<string> => {
  try {
    const img = await preloadImage(base64Image, true);
    const isPortrait = originalHeight > originalWidth;
    
    const canvas = document.createElement('canvas');
    if (isPortrait) {
      // Side-by-side
      canvas.width = originalWidth * 2;
      canvas.height = originalHeight;
    } else {
      // Top-and-bottom
      canvas.width = originalWidth;
      canvas.height = originalHeight * 2;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    // Fill white background just in case
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isPortrait) {
      ctx.drawImage(img, 0, 0, originalWidth, originalHeight);
      ctx.drawImage(img, originalWidth, 0, originalWidth, originalHeight);
    } else {
      ctx.drawImage(img, 0, 0, originalWidth, originalHeight);
      ctx.drawImage(img, 0, originalHeight, originalWidth, originalHeight);
    }

    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (err) {
    console.error("Image load error for double print:", err);
    return base64Image; // Fallback to original
  }
};
