-- Supabase Schema for CoroAI Photobooth SaaS

-- 1. Vendors Table
CREATE TABLE vendors (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  country TEXT,
  phone TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pay_as_you_go', 'rent')),
  credits INTEGER DEFAULT 10,
  credits_used INTEGER DEFAULT 0,
  is_blocked BOOLEAN DEFAULT false,
  admin_message TEXT,
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
  -- Get default credits from global_settings, fallback to 10
  SELECT default_free_credits INTO v_default_credits FROM public.global_settings WHERE id = '1' LIMIT 1;
  IF v_default_credits IS NULL THEN
    v_default_credits := 10;
  END IF;

  INSERT INTO public.vendors (id, email, name, credits)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', 'Vendor'), v_default_credits);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- Create a secure function to check if a user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() ->> 'email') = 'admin@coroai.app';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
-- Restrict read access to events (only owner or superadmin)
DROP POLICY IF EXISTS "Anyone can view events" ON events;
CREATE POLICY "Vendors can view their own events" ON events FOR SELECT USING (auth.uid() = vendor_id OR is_superadmin());

-- Create a secure function to get the superadmin ID
CREATE OR REPLACE FUNCTION get_superadmin_id()
RETURNS UUID AS $$
  SELECT id FROM vendors WHERE email = 'admin@coroai.app' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Anyone (including vendors) can see ALL events created by the Super Admin (these act as templates)
DROP POLICY IF EXISTS "Anyone can view superadmin events" ON events;
CREATE POLICY "Anyone can view superadmin events" ON events FOR SELECT USING (vendor_id = get_superadmin_id());


-- 3. Concepts Table
CREATE TABLE concepts (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  thumbnail TEXT,
  ref_image TEXT,
  concept_id TEXT,
  reference_image_split TEXT,
  reference_image_bg TEXT,
  style_preset TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS for concepts
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors can manage concepts for their events" ON concepts FOR ALL USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = concepts.event_id AND events.vendor_id = auth.uid())
);
-- Restrict read access to concepts (only owner or superadmin)
DROP POLICY IF EXISTS "Anyone can view concepts" ON concepts;
CREATE POLICY "Vendors can view concepts for their events" ON concepts FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = concepts.event_id AND (events.vendor_id = auth.uid() OR is_superadmin()))
);

-- Anyone (including vendors) can see ALL concepts created by the Super Admin (these act as templates)
DROP POLICY IF EXISTS "Anyone can view superadmin concepts" ON concepts;
CREATE POLICY "Anyone can view superadmin concepts" ON concepts FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = concepts.event_id AND events.vendor_id = get_superadmin_id())
);


-- 4. Sessions Table (For Guest Results)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  result_image_url TEXT,
  result_video_url TEXT,
  status TEXT DEFAULT 'processing',
  video_status TEXT DEFAULT 'idle',
  video_prompt TEXT,
  original_image_url TEXT,
  guest_name TEXT,
  guest_message TEXT,
  is_posted_to_wall BOOLEAN DEFAULT false,
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
  default_free_credits INTEGER DEFAULT 10,
  system_status TEXT DEFAULT 'active' CHECK (system_status IN ('active', 'maintenance')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Insert default settings
INSERT INTO global_settings (id, default_free_credits, system_status) VALUES ('default', 10, 'active') ON CONFLICT (id) DO NOTHING;

-- Enable RLS for global_settings
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read global settings" ON global_settings FOR SELECT USING (true);
CREATE POLICY "Super admin can update global settings" ON global_settings FOR UPDATE USING (auth.jwt() ->> 'email' = 'admin@coroai.app');
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
  SET credits = credits - 1,
      credits_used = COALESCE(credits_used, 0) + 1
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
  SET credits = credits - p_amount,
      credits_used = COALESCE(credits_used, 0) + p_amount
  WHERE id = v_vendor_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to manually confirm a vendor's email
CREATE OR REPLACE FUNCTION confirm_vendor_email(vendor_id UUID)
RETURNS void AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'admin@coroai.app' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = vendor_id;
  UPDATE public.vendors SET email_confirmed = true WHERE id = vendor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Template Concepts Table (For Super Admin)
CREATE TABLE template_concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  ref_image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS for template_concepts
ALTER TABLE template_concepts ENABLE ROW LEVEL SECURITY;

-- Allow public read access to template concepts (so vendors can view them)
CREATE POLICY "Anyone can view template concepts" ON template_concepts FOR SELECT USING (true);

-- Allow super admin to manage template concepts
CREATE POLICY "Super admin can manage template concepts" ON template_concepts FOR ALL USING (auth.jwt() ->> 'email' = 'admin@coroai.app');

-- Insert storage bucket for concept assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('concept_assets', 'concept_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for concept_assets
CREATE POLICY "Public Access concept_assets"
ON storage.objects FOR SELECT
USING ( bucket_id = 'concept_assets' );

CREATE POLICY "Authenticated users can upload concept_assets"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'concept_assets' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can update own concept_assets"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'concept_assets' AND auth.uid() = owner );

CREATE POLICY "Users can delete own concept_assets"
ON storage.objects FOR DELETE
USING ( bucket_id = 'concept_assets' AND auth.uid() = owner );

-- Enable Realtime for sessions table
-- Note: Supabase creates the 'supabase_realtime' publication by default.
-- We just need to add our table to it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
END
$$;

-- 9. Concept Templates Table (For Concept Studio)
CREATE TABLE concept_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE, -- NULL means Superadmin template
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  thumbnail TEXT,
  reference_image_split TEXT,
  reference_image_bg TEXT,
  style_preset TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS for concept_templates
ALTER TABLE concept_templates ENABLE ROW LEVEL SECURITY;

-- Vendors can view superadmin templates (vendor_id IS NULL) OR their own templates
CREATE POLICY "Vendors can view templates" ON concept_templates 
FOR SELECT USING (vendor_id IS NULL OR vendor_id = auth.uid() OR is_superadmin());

-- Vendors can insert their own templates
CREATE POLICY "Vendors can insert their own templates" ON concept_templates 
FOR INSERT WITH CHECK (vendor_id = auth.uid() OR is_superadmin());

-- Vendors can update their own templates
CREATE POLICY "Vendors can update their own templates" ON concept_templates 
FOR UPDATE USING (vendor_id = auth.uid() OR is_superadmin());

-- Vendors can delete their own templates
CREATE POLICY "Vendors can delete their own templates" ON concept_templates 
FOR DELETE USING (vendor_id = auth.uid() OR is_superadmin());
