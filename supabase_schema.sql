-- Supabase Schema for CoroAI Photobooth SaaS

-- 1. Vendors Table
CREATE TABLE vendors (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  credits INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS for vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors can view their own profile" ON vendors FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Vendors can update their own profile" ON vendors FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Vendors can insert their own profile" ON vendors FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger to automatically create a vendor profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_default_credits INTEGER;
BEGIN
  -- Get default credits from global_settings, fallback to 100
  SELECT default_free_credits INTO v_default_credits FROM public.global_settings WHERE id = 'default';
  IF v_default_credits IS NULL THEN
    v_default_credits := 100;
  END IF;

  INSERT INTO public.vendors (id, email, name, credits)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', 'Vendor'), v_default_credits);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. Events Table
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  storage_folder TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS for events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors can manage their own events" ON events FOR ALL USING (auth.uid() = vendor_id);
CREATE POLICY "Vendors can insert their own events" ON events FOR INSERT WITH CHECK (auth.uid() = vendor_id);
-- Allow public read access to events (so the photobooth app can load settings without auth)
CREATE POLICY "Anyone can view events" ON events FOR SELECT USING (true);


-- 3. Concepts Table
CREATE TABLE concepts (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  thumbnail TEXT,
  "refImage" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS for concepts
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors can manage concepts for their events" ON concepts FOR ALL USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = concepts.event_id AND events.vendor_id = auth.uid())
);
-- Allow public read access to concepts
CREATE POLICY "Anyone can view concepts" ON concepts FOR SELECT USING (true);


-- 4. Sessions Table (For Guest Results)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  result_image_url TEXT,
  result_video_url TEXT,
  status TEXT DEFAULT 'processing',
  video_status TEXT DEFAULT 'idle',
  video_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS for sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON sessions FOR UPDATE USING (true);

-- 6. Storage Buckets
-- Create a bucket for photobooth images and videos
INSERT INTO storage.buckets (id, name, public) VALUES ('photobooth', 'photobooth', true) ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'photobooth');
CREATE POLICY "Anyone can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'photobooth');
CREATE POLICY "Anyone can update" ON storage.objects FOR UPDATE USING (bucket_id = 'photobooth');
CREATE POLICY "Anyone can delete" ON storage.objects FOR DELETE USING (bucket_id = 'photobooth');
-- 7. Global Settings Table (For Super Admin)
CREATE TABLE global_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  default_free_credits INTEGER DEFAULT 100,
  system_status TEXT DEFAULT 'active' CHECK (system_status IN ('active', 'maintenance')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Insert default settings
INSERT INTO global_settings (id, default_free_credits, system_status) VALUES ('default', 100, 'active') ON CONFLICT (id) DO NOTHING;

-- Enable RLS for global_settings
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read global settings" ON global_settings FOR SELECT USING (true);
CREATE POLICY "Super admin can update global settings" ON global_settings FOR UPDATE USING (auth.jwt() ->> 'email' = 'coroaiphotobooth@gmail.com');
CREATE OR REPLACE FUNCTION decrement_credits(p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_vendor_id UUID;
  v_credits INTEGER;
BEGIN
  -- Get the vendor ID and current credits for the event
  SELECT v.id, v.credits INTO v_vendor_id, v_credits
  FROM events e
  JOIN vendors v ON e.vendor_id = v.id
  WHERE e.id = p_event_id AND e.is_active = true;

  -- If event not found or inactive, return false
  IF v_vendor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if vendor has enough credits
  IF v_credits <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Deduct credit
  UPDATE vendors
  SET credits = credits - 1
  WHERE id = v_vendor_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement credits by a specific amount
CREATE OR REPLACE FUNCTION decrement_credits_by_amount(p_event_id UUID, p_amount INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_vendor_id UUID;
  v_credits INTEGER;
BEGIN
  -- Get the vendor ID and current credits for the event
  SELECT v.id, v.credits INTO v_vendor_id, v_credits
  FROM events e
  JOIN vendors v ON e.vendor_id = v.id
  WHERE e.id = p_event_id AND e.is_active = true;

  -- If event not found or inactive, return false
  IF v_vendor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if vendor has enough credits
  IF v_credits < p_amount THEN
    RETURN FALSE;
  END IF;

  -- Deduct credit
  UPDATE vendors
  SET credits = credits - p_amount
  WHERE id = v_vendor_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
