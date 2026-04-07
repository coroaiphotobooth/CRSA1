-- 1. Mengatasi Query: SELECT ... FROM sessions LEFT JOIN events ... WHERE sessions.video_status = ANY (...)
CREATE INDEX IF NOT EXISTS idx_sessions_video_status_event_id 
ON public.sessions(video_status, event_id);

-- 2. Mengatasi Query: SELECT ... FROM sessions WHERE event_id = $1 AND result_image_url IS NOT NULL ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_sessions_gallery_lookup 
ON public.sessions(event_id, created_at DESC) 
WHERE result_image_url IS NOT NULL;

-- 3. Mengatasi Query: SELECT ... FROM events WHERE vendor_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_events_vendor_lookup 
ON public.events(vendor_id, created_at DESC);
