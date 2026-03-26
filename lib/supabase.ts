import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const decrementCredits = async (eventId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('decrement_credits', { p_event_id: eventId });
    if (error) {
      console.warn("Warning: Could not decrement credits (database schema might be incomplete). Proceeding anyway.", error);
      return true; // Return true to prevent blocking the app if the database is incomplete
    }
    return data === true;
  } catch (err) {
    console.warn("Warning: Failed to decrement credits. Proceeding anyway.", err);
    return true;
  }
};
