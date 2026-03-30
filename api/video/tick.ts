
// This endpoint is polled by the App (Global) to process the queue
export const config = {
  maxDuration: 60, 
};

// Helper: Robust Fetch for GAS with Retry
const fetchGasWithRetry = async (url: string, payload: any, retries = 2) => {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); 

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' }, 
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            if (res.ok) return await res.json();
            throw new Error(`Status: ${res.status}`);
        } catch (e: any) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 500));
        }
    }
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL;
  const gasUrl = process.env.APPS_SCRIPT_BASE_URL;
  const defaultModelId = process.env.SEEDANCE_MODEL_ID || 'seedance-1-0-pro-fast-251015';

  if (!apiKey || !baseUrl) return res.status(500).json({ error: 'Config missing' });

  try {
    let items: any[] = [];
    
    // 1. Fetch from GAS if configured
    if (gasUrl) {
        try {
            const sheetRes = await fetch(`${gasUrl}?action=gallery&t=${Date.now()}`);
            if (sheetRes.ok) {
                const sheetData = await sheetRes.json();
                items = [...items, ...(sheetData.items || [])];
            } else {
                console.error(`Failed to fetch Gallery from GAS: ${sheetRes.status}`);
            }
        } catch (e) {
            console.error("Error fetching from GAS:", e);
        }
    }
    
    // 2. Fetch from Supabase if configured
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data, error } = await supabase
                .from('sessions')
                .select('id, result_image_url, video_status, video_prompt, video_task_id, events(storage_folder)')
                .in('video_status', ['processing', 'pending', 'queued']);
                
            if (error) throw error;
            const supabaseItems = (data || []).map(session => ({
                id: session.id,
                imageUrl: session.result_image_url,
                videoStatus: session.video_status,
                videoPrompt: session.video_prompt,
                videoTaskId: session.video_task_id,
                sessionFolderId: session.id,
                storageFolder: (session.events as any)?.storage_folder,
                source: 'supabase' // Mark source to know where to update
            }));
            items = [...items, ...supabaseItems];
        } catch (e) {
            console.error("Error fetching from Supabase:", e);
        }
    }

    const processingTasks = items.filter(i => i.videoStatus === 'processing');
    const queuedTasks = items.filter(i => i.videoStatus === 'queued' || i.videoStatus === 'pending');
    const activeCount = processingTasks.length + queuedTasks.length;

    const report = { processed: 0, started: 0, rescued: 0, errors: [] as string[] };

    // 1. CHECK PROCESSING TASKS (Cek status yang sedang berjalan)
    for (const task of processingTasks) {
       if (!task.videoTaskId) continue;
       const statusUrl = `${baseUrl.replace(/\/$/, '')}/contents/generations/tasks/${task.videoTaskId}`;
       const sRes = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
       
       if (sRes.ok) {
           const sData = await sRes.json();
           const resultObj = sData.Result || sData.data || sData;
           const status = (resultObj.status || 'processing').toLowerCase();
           
           if (status === 'succeeded' || status === 'success') {
               let videoUrl = resultObj.content?.video_url || resultObj.output?.video_url || resultObj.video_url;
               if (videoUrl) {
                   // [CRITICAL FIX] ATOMIC LOCK with RETRY
                   console.log(`[TICK] Attempting lock for ${task.id}...`);
                   
                   try {
                       let lockOk = false;
                       if (task.source !== 'supabase' && gasUrl) {
                           const lockJson = await fetchGasWithRetry(gasUrl, { 
                               action: 'updateVideoStatus', 
                               photoId: task.id, 
                               status: 'uploading', // Intermediate Lock State
                               providerUrl: videoUrl,
                               requireStatus: 'processing' // Optimistic Locking Requirement
                           });
                           lockOk = lockJson?.ok;
                       } else if (supabaseUrl && supabaseKey) {
                           // Fallback to Supabase
                           const { createClient } = await import('@supabase/supabase-js');
                           const supabase = createClient(supabaseUrl, supabaseKey);
                           const { data, error } = await supabase
                               .from('sessions')
                               .update({
                                   video_status: 'uploading',
                                   result_video_url: videoUrl
                               })
                               .eq('id', task.id)
                               .eq('video_status', 'processing')
                               .select();
                               
                           lockOk = !error && data && data.length > 0;
                       }

                       if (lockOk) {
                           console.log(`[TICK] Lock acquired for ${task.id}. Triggering Finalize.`);
                           
                           // Trigger background upload to Drive
                           // We use fire-and-forget logic here but with retry wrapper if needed, 
                           // though `finalizeVideoUpload` is server-to-server and might be long running.
                           if (task.source !== 'supabase' && gasUrl) {
                               fetch(gasUrl, {
                                   method: 'POST',
                                   headers: { "Content-Type": "text/plain" }, 
                                   body: JSON.stringify({ 
                                       action: 'finalizeVideoUpload', 
                                       photoId: task.id, 
                                       videoUrl: videoUrl, 
                                       sessionFolderId: task.sessionFolderId 
                                   })
                               }).catch(e => console.error(`[TICK] Finalize trigger failed for ${task.id}`, e));
                           } else if (supabaseUrl && supabaseKey) {
                               // Fallback to Supabase
                               const { createClient } = await import('@supabase/supabase-js');
                               const supabase = createClient(supabaseUrl, supabaseKey);
                               
                               let finalVideoUrl = videoUrl;
                               try {
                                   const videoRes = await fetch(videoUrl);
                                   if (!videoRes.ok) throw new Error("Failed to fetch video");
                                   const videoBlob = await videoRes.blob();
                                   let folderPath = task.storageFolder ? `${task.storageFolder}/result` : task.id;
                                   const fileName = `${folderPath}/${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
                                   const { error: uploadError } = await supabase.storage.from('photobooth').upload(fileName, videoBlob, { contentType: 'video/mp4', upsert: false });
                                   if (!uploadError) {
                                       const { data: { publicUrl } } = supabase.storage.from('photobooth').getPublicUrl(fileName);
                                       finalVideoUrl = publicUrl;
                                   } else {
                                       console.error(`[TICK] Failed to upload video to Supabase Storage for ${task.id}`, uploadError);
                                   }
                               } catch (e) {
                                   console.error(`[TICK] Failed to process video for Supabase Storage for ${task.id}`, e);
                               }

                               const { error } = await supabase
                                   .from('sessions')
                                   .update({
                                       result_video_url: finalVideoUrl,
                                       video_status: 'done',
                                       status: 'completed'
                                   })
                                   .eq('id', task.id);
                                   
                               if (error) console.error(`[TICK] Supabase finalize failed for ${task.id}`, error);
                           }
                           
                           report.processed++;
                       } else {
                           console.warn(`[TICK] Race condition detected for ${task.id}. Skipping duplicate upload.`);
                       }
                   } catch(lockErr: any) {
                       console.error(`[TICK] Lock failed for ${task.id}:`, lockErr.message);
                   }
               }
           } else if (status === 'failed' || status === 'error') {
               if (task.source !== 'supabase' && gasUrl) {
                   await fetchGasWithRetry(gasUrl, { action: 'updateVideoStatus', photoId: task.id, status: 'failed' }).catch(e => console.error("Fail update error", e));
               } else if (supabaseUrl && supabaseKey) {
                   const { createClient } = await import('@supabase/supabase-js');
                   const supabase = createClient(supabaseUrl, supabaseKey);
                   await supabase.from('sessions').update({ video_status: 'failed' }).eq('id', task.id);
               }
           }
       }
    }

    // 2. START QUEUED TASKS (Mulai render untuk antrian baru)
    const MAX_CONCURRENT = 3;
    const availableSlots = MAX_CONCURRENT - processingTasks.length;

    if (availableSlots > 0 && queuedTasks.length > 0) {
        for (const task of queuedTasks.slice(0, availableSlots)) {
             // PATCH: NATIVE RESOLUTION HANDLING
             let finalRes = task.videoResolution || '480p'; 
             if (finalRes !== '720p' && finalRes !== '480p') finalRes = '480p';
             
             // PATCH A: Use Thumbnail URL for smaller input
             const sizeParam = finalRes === '720p' ? 'w720' : 'w480';
             let driveInputUrl = task.imageUrl;
             if (!driveInputUrl) {
                 driveInputUrl = `https://drive.google.com/thumbnail?id=${task.id}&sz=${sizeParam}`;
             }
             console.log(`[TICK] Starting task ${task.id} with input URL`);

             // PATCH B: FORCE PROMPT FLAGS
             const duration = 5;
             const basePrompt = task.videoPrompt || "Animate the image with very subtle and natural motion. Keep the subject stable and realistic. Add minimal camera movement and gentle breathing or blinking. Avoid any distortion, fast motion, or unrealistic effects. Preserve the original look and details.";
             const forcedPrompt = `${basePrompt} --rs ${finalRes} --dur ${duration}`;

             const payload = {
                model: task.videoModel || defaultModelId,
                content: [
                    { type: "text", text: forcedPrompt },
                    { type: "image_url", image_url: { url: driveInputUrl } }
                ],
                parameters: { duration: duration, resolution: finalRes, audio: false }
             };

             const startRes = await fetch(`${baseUrl.replace(/\/$/, '')}/contents/generations/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(payload)
             });
             
             if (startRes.ok) {
                 const startData = await startRes.json();
                 const taskId = startData.id || startData.Result?.id;
                 if (taskId) {
                     try {
                         if (task.source !== 'supabase' && gasUrl) {
                             await fetchGasWithRetry(gasUrl, { 
                                 action: 'updateVideoStatus', 
                                 photoId: task.id, 
                                 status: 'processing', 
                                 taskId: taskId 
                             });
                         } else if (supabaseUrl && supabaseKey) {
                             const { createClient } = await import('@supabase/supabase-js');
                             const supabase = createClient(supabaseUrl, supabaseKey);
                             await supabase.from('sessions').update({ video_status: 'processing', video_task_id: taskId }).eq('id', task.id);
                         }
                         report.started++;
                     } catch(e) {
                         console.error(`[TICK] Failed to update start status for ${task.id}`, e);
                     }
                 }
             }
        }
    }

    return res.status(200).json({ ok: true, report, activeCount });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
