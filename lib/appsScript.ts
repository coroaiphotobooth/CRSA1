
import { GalleryItem, PhotoboothSettings, Concept, EventRecord } from '../types';
import { DEFAULT_GAS_URL } from '../constants';
import { supabase } from './supabase';

const getGasUrl = () => {
  const url = localStorage.getItem('APPS_SCRIPT_BASE_URL') || DEFAULT_GAS_URL;
  return url.trim();
};

// HELPER: Robust Fetch with CORS handling & Logging
export const robustFetch = async (url: string, options: RequestInit = {}) => {
    try {
        if (options.method === 'POST') {
             if (!options.headers) {
                 options.headers = {};
             }
             (options.headers as any)['Content-Type'] = 'text/plain;charset=utf-8';
        }

        const res = await fetch(url, options);
        
        if (!res.ok) {
            console.error(`GAS Fetch Error ${res.status}:`, await res.text());
            throw new Error(`Server Error: ${res.status}`);
        }
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
             return await res.json();
        } else {
             const text = await res.text();
             try {
                return JSON.parse(text);
             } catch (e) {
                console.error("GAS returned non-JSON:", text.substring(0, 500));
                throw new Error("Invalid response from server (Not JSON)");
             }
        }
    } catch (e: any) {
        console.error("FETCH FAILED:", e.message);
        throw e;
    }
}

export const fetchSettings = async () => {
  const url = getGasUrl();
  return await robustFetch(`${url}?action=getSettings&t=${Date.now()}`);
};

export const fetchEvents = async (): Promise<EventRecord[]> => {
  const url = getGasUrl();
  try {
    const data = await robustFetch(`${url}?action=getEvents&t=${Date.now()}`);
    return data.events || [];
  } catch (error) {
    console.error("Failed to fetch events:", error);
    return [];
  }
};

export const fetchImageBase64 = async (fileIdOrUrl: string): Promise<string | null> => {
  if (fileIdOrUrl.startsWith('http')) {
    try {
      const res = await fetch(fileIdOrUrl);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to fetch image as base64:", e);
      return null;
    }
  }

  const url = getGasUrl();
  try {
    const data = await robustFetch(`${url}?action=getBase64&id=${fileIdOrUrl}`);
    return data.ok ? data.base64 : null;
  } catch (error) { return null; }
};

export const saveSessionToCloud = async (sessionData: any): Promise<{success: boolean}> => {
  if (sessionData.eventId) {
    try {
      const { error } = await supabase
        .from('sessions')
        .upsert({
          id: sessionData.sessionId,
          event_id: sessionData.eventId,
          result_image_url: sessionData.resultImageUrl,
          result_video_url: sessionData.resultVideoUrl,
          status: sessionData.isVideoRequested ? 'processing' : 'completed',
          video_status: sessionData.isVideoRequested ? 'pending' : 'idle',
          video_prompt: sessionData.videoPrompt || '',
          ...(sessionData.originalImageUrl && { original_image_url: sessionData.originalImageUrl })
        }, { onConflict: 'id' });
        
      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error("Supabase Save Session Failed:", e);
      return { success: false };
    }
  }

  const url = getGasUrl();
  try {
    const data = await robustFetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveSession', ...sessionData })
    });
    return { success: data.ok };
  } catch (e) {
    console.error("Save Session Failed:", e);
    return { success: false };
  }
};

export const fetchSessionFromCloud = async (sessionId: string, eventId?: string): Promise<{success: boolean, data?: any}> => {
  try {
    let query = supabase.from('sessions').select('*, events(name, description)').eq('id', sessionId);
    if (eventId) {
      query = query.eq('event_id', eventId);
    }
    
    const { data, error } = await query.single();
      
    if (!error && data) {
      return { 
        success: true, 
        data: {
          sessionId: data.id,
          resultImageUrl: data.result_image_url,
          resultVideoUrl: data.result_video_url,
          isVideoRequested: data.status === 'processing',
          eventName: data.events?.name || 'YOUR DIGITAL ART',
          eventDescription: data.events?.description || 'COROAI PHOTOBOOTH'
        }
      };
    }
  } catch (e) {
    console.error("Supabase Fetch Session Failed:", e);
  }

  const url = getGasUrl();
  try {
    const data = await robustFetch(`${url}?action=getSession&sessionId=${sessionId}&t=${Date.now()}`);
    if (data.ok) {
        return { success: true, data: data.session };
    }
    return { success: false };
  } catch (e) {
    console.error("Fetch Session Failed:", e);
    return { success: false };
  }
};

export const createSessionFolder = async (eventId?: string): Promise<{ok: boolean, folderId?: string, folderUrl?: string}> => {
  if (eventId) {
    const fakeId = `session_${Date.now()}`;
    return { ok: true, folderId: fakeId, folderUrl: `supabase://${fakeId}` };
  }
  const url = getGasUrl();
  try {
    return await robustFetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'createSession' })
    });
  } catch (e) {
    console.error("Create Session Failed:", e);
    return { ok: false };
  }
};

export const queueVideoTask = async (photoId: string, options?: any): Promise<{ok: boolean}> => {
  if (options?.eventId) {
    try {
      const sessionId = options?.sessionId || photoId;
      const { error } = await supabase
        .from('sessions')
        .update({ 
          status: 'processing',
          video_status: 'pending',
          video_prompt: options?.prompt || ''
        })
        .eq('id', sessionId);
        
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.error("Supabase Queue Video Failed:", e);
      return { ok: false };
    }
  }

  const url = getGasUrl();
  try {
    return await robustFetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'queueVideo', photoId, ...options })
    });
  } catch (e) { return { ok: false }; }
};

export const updateVideoStatusInGas = async (photoId: string, status: string, taskId?: string, providerUrl?: string): Promise<{ok: boolean}> => {
  const url = getGasUrl();
  try {
    return await robustFetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'updateVideoStatus', photoId, status, taskId, providerUrl })
    });
  } catch (e) { return { ok: false }; }
};

export const uploadToDrive = async (base64Image: string, metadata: any) => {
  if (metadata.eventId) {
    try {
      // Convert base64 to blob
      const res = await fetch(base64Image);
      const blob = await res.blob();
      
      let folderPath = metadata.eventId; // fallback
      if (metadata.storage_folder) {
        const subfolder = metadata.conceptName === "ORIGINAL_CAPTURE" ? "original" : "result";
        folderPath = `${metadata.storage_folder}/${subfolder}`;
      }
      
      const fileName = `${folderPath}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      
      const { data, error } = await supabase.storage
        .from('photobooth')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });
        
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('photobooth')
        .getPublicUrl(fileName);
        
      return { ok: true, id: publicUrl };
    } catch (error: any) {
      console.error("Supabase Upload Failed:", error);
      return { ok: false, error: error.message || "UPLOAD_FAILED" };
    }
  }

  const url = getGasUrl();
  try {
    return await robustFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        action: 'uploadGenerated',
        image: base64Image,
        ...metadata
      })
    });
  } catch (error: any) {
    console.error("Upload Failed:", error);
    return { ok: false, error: error.message || "FETCH_FAILED" };
  }
};

export const uploadVideoToDrive = async (videoBlob: Blob, metadata: any) => {
  if (metadata.eventId) {
    try {
      const fileName = `${metadata.eventId}/${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
      
      const { data, error } = await supabase.storage
        .from('photobooth')
        .upload(fileName, videoBlob, {
          contentType: 'video/mp4',
          upsert: false
        });
        
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('photobooth')
        .getPublicUrl(fileName);
        
      return { ok: true, id: publicUrl };
    } catch (error: any) {
      console.error("Supabase Video Upload Failed:", error);
      return { ok: false, error: error.message || "UPLOAD_FAILED" };
    }
  }

  const url = getGasUrl();
  const reader = new FileReader();
  return new Promise<any>((resolve) => {
    reader.onloadend = async () => {
      const base64Video = reader.result as string;
      try {
        const res = await robustFetch(url, {
          method: 'POST',
          body: JSON.stringify({
            action: 'uploadGeneratedVideo', 
            image: base64Video,
            mimeType: 'video/mp4',
            ...metadata
          })
        });
        resolve(res);
      } catch (e) {
        resolve({ ok: false, error: "Video Upload Failed" });
      }
    };
    reader.readAsDataURL(videoBlob);
  });
};

// UPDATED: Supports delta sync with 'since'
export const fetchGallery = async (eventId?: string, since?: number): Promise<{ items: GalleryItem[], nextCursor: number, isDelta?: boolean }> => {
  if (eventId) {
    try {
      let query = supabase
        .from('sessions')
        .select('*')
        .eq('event_id', eventId)
        .not('result_image_url', 'is', null)
        .order('created_at', { ascending: false });
        
      if (since && since > 0) {
        query = query.gt('created_at', new Date(since).toISOString());
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const items: GalleryItem[] = (data || []).map(session => ({
        id: session.id,
        imageUrl: session.result_image_url,
        downloadUrl: session.result_image_url,
        createdAt: session.created_at,
        token: session.id,
        conceptName: 'AI Photo',
        videoStatus: session.video_status || 'idle',
        providerUrl: session.result_video_url,
        originalId: session.original_image_url,
        sessionFolderId: session.id // Map sessionFolderId to id for Supabase compatibility
      }));
      
      return {
        items,
        nextCursor: Date.now(),
        isDelta: !!since
      };
    } catch (e) {
      console.error("Supabase Fetch Gallery Failed:", e);
      return { items: [], nextCursor: 0 };
    }
  }

  const url = getGasUrl();
  let query = `?action=gallery&t=${Date.now()}`;
  if (eventId) query += `&eventId=${eventId}`;
  if (since && since > 0) query += `&since=${since}`; // Append cursor

  const data = await robustFetch(`${url}${query}`);
  
  // Backward compatibility check
  if (Array.isArray(data.items)) {
      return {
          items: data.items,
          nextCursor: data.nextCursor || 0,
          isDelta: data.isDelta
      };
  }
  return { items: [], nextCursor: 0 };
};

export const deletePhotoFromGas = async (id: string, pin: string) => {
    // Check if ID is a UUID or starts with 'session_' (Supabase session ID)
    const isSupabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || id.startsWith('session_');
    
    if (isSupabaseId) {
      try {
        // We use count: 'exact' to verify if a row was actually deleted.
        // If count is 0, it means RLS blocked it or the ID doesn't exist.
        const { error, count } = await supabase.from('sessions').delete({ count: 'exact' }).eq('id', id);
        
        if (error) throw error;
        
        if (count === 0) {
            throw new Error("Foto tidak terhapus. Ini biasanya karena aturan keamanan (RLS) di Supabase belum mengizinkan penghapusan sesi. Silakan jalankan perintah SQL ini di Supabase SQL Editor: CREATE POLICY \"Anyone can delete sessions\" ON sessions FOR DELETE USING (true);");
        }
        
        return { ok: true };
      } catch (e: any) {
        console.error("Supabase Delete Failed:", e);
        return { ok: false, error: e.message };
      }
    }

    const url = getGasUrl();
    return await robustFetch(url, { method: 'POST', body: JSON.stringify({ action: 'deletePhoto', pin, id }) });
};

export const deleteAllPhotosFromGas = async (pin: string, eventId?: string) => {
    if (eventId) {
      try {
        const { error, count } = await supabase.from('sessions').delete({ count: 'exact' }).eq('event_id', eventId);
        if (error) throw error;
        
        // If count is 0, it might mean there were no photos, or RLS blocked it.
        // We can't be 100% sure it's RLS if the gallery was empty, but if they clicked "Delete All"
        // there were probably photos. We'll add a warning if count is 0.
        if (count === 0) {
            console.warn("No photos deleted. If photos exist, RLS might be blocking deletion.");
            // Don't throw here because they might just be deleting an empty gallery
        }
        
        return { ok: true, count };
      } catch (e: any) {
        console.error("Supabase Delete All Failed:", e);
        return { ok: false, error: e.message };
      }
    }

    const url = getGasUrl();
    return await robustFetch(url, { method: 'POST', body: JSON.stringify({ action: 'deleteAllPhotos', pin }) });
};

export const saveSettingsToGas = async (settings: PhotoboothSettings, pin: string) => {
    const url = getGasUrl();
    try {
        const data = await robustFetch(url, { method: 'POST', body: JSON.stringify({ action: 'updateSettings', pin, settings }) });
        return data.ok;
    } catch (e) { return false; }
};

export const saveConceptsToGas = async (concepts: Concept[], pin: string) => {
    const url = getGasUrl();
    try {
        const data = await robustFetch(url, { method: 'POST', body: JSON.stringify({ action: 'updateConcepts', pin, concepts }) });
        return data.ok;
    } catch (e) { return false; }
};

export const uploadOverlayToGas = async (base64Image: string, pin: string) => {
    const url = getGasUrl();
    try {
        return await robustFetch(url, { method: 'POST', body: JSON.stringify({ action: 'uploadOverlay', pin, image: base64Image }) });
    } catch (e) { return { ok: false }; }
};

export const uploadBackgroundToGas = async (base64Image: string, pin: string) => {
    const url = getGasUrl();
    try {
        return await robustFetch(url, { method: 'POST', body: JSON.stringify({ action: 'uploadBackground', pin, image: base64Image }) });
    } catch (e) { return { ok: false }; }
};
