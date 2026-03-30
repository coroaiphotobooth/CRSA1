import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: (...args) => {
      return fetch(...args).catch(err => {
        console.error('Supabase fetch error:', err);
        throw err;
      });
    }
  }
});

export const decrementCredits = async (eventId: string, amount: number = 1): Promise<boolean> => {
  try {
    // Try the new RPC first
    const { data, error } = await supabase.rpc('decrement_credits_by_amount', { p_event_id: eventId, p_amount: amount });
    
    if (!error) {
      return data === true;
    }

    // If the RPC doesn't exist yet, fallback to the old one if amount is 1, or manual select+update
    if (amount === 1) {
      const { data: oldData, error: oldError } = await supabase.rpc('decrement_credits', { p_event_id: eventId });
      if (!oldError) return oldData === true;
    }

    // Manual fallback (subject to race conditions, but works if RPC is missing)
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('vendor_id, vendors(credits)')
      .eq('id', eventId)
      .single();
      
    if (eventError || !eventData) {
      console.warn("Warning: Could not fetch event/vendor for credits. Proceeding anyway.", eventError);
      return true;
    }

    const vendorId = eventData.vendor_id;
    // Handle array or object return from join
    const currentCredits = Array.isArray(eventData.vendors) ? eventData.vendors[0]?.credits : (eventData.vendors as any)?.credits;
    
    if (currentCredits === undefined || currentCredits < amount) {
       return false;
    }
    
    const { error: updateError } = await supabase
      .from('vendors')
      .update({ credits: currentCredits - amount })
      .eq('id', vendorId);
      
    if (updateError) {
      console.warn("Warning: Could not update credits. Proceeding anyway.", updateError);
      return true;
    }

    return true;
  } catch (err) {
    console.warn("Warning: Failed to decrement credits. Proceeding anyway.", err);
    return true;
  }
};
