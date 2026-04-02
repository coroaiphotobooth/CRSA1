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
    console.log(`[decrementCredits] Start. eventId: ${eventId}, amount: ${amount}`);
    // Try the new RPC first
    const { data, error } = await supabase.rpc('decrement_credits_by_amount', { p_event_id: eventId, p_amount: amount });
    
    if (!error) {
      console.log(`[decrementCredits] RPC decrement_credits_by_amount returned:`, data);
      if (data === true) return true;
      // If data is false, it might mean insufficient credits, or it might mean the event wasn't found.
      // Let's fallback to manual check to be sure, instead of returning false immediately.
    } else {
      console.log(`[decrementCredits] RPC decrement_credits_by_amount error:`, error);
    }

    // If the RPC doesn't exist yet, fallback to the old one if amount is 1, or manual select+update
    if (amount === 1) {
      const { data: oldData, error: oldError } = await supabase.rpc('decrement_credits', { p_event_id: eventId });
      if (!oldError) {
        console.log(`[decrementCredits] RPC decrement_credits returned:`, oldData);
        if (oldData === true) return true;
      } else {
        console.log(`[decrementCredits] RPC decrement_credits error:`, oldError);
      }
    }

    console.log(`[decrementCredits] Falling back to manual check for eventId: ${eventId}`);
    // Manual fallback (subject to race conditions, but works if RPC is missing)
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('vendor_id, vendors(credits, credits_used)')
      .eq('id', eventId)
      .single();
      
    if (eventError || !eventData) {
      console.warn("Warning: Could not fetch event/vendor for credits. Proceeding anyway.", eventError);
      return true;
    }

    const vendorId = eventData.vendor_id;
    // Handle array or object return from join
    const currentCredits = Array.isArray(eventData.vendors) ? eventData.vendors[0]?.credits : (eventData.vendors as any)?.credits;
    const currentCreditsUsed = Array.isArray(eventData.vendors) ? eventData.vendors[0]?.credits_used : (eventData.vendors as any)?.credits_used;
    
    console.log(`[decrementCredits] Manual check. vendorId: ${vendorId}, currentCredits: ${currentCredits}, amount: ${amount}`);

    if (currentCredits === undefined || currentCredits === null) {
       console.warn(`[decrementCredits] Could not read credits (possibly due to RLS). Failing open to not block the event.`);
       return true;
    }

    if (currentCredits < amount) {
       console.log(`[decrementCredits] Insufficient credits in manual check.`);
       return false;
    }
    
    const { error: updateError } = await supabase
      .from('vendors')
      .update({ 
        credits: currentCredits - amount,
        credits_used: (currentCreditsUsed || 0) + amount
      })
      .eq('id', vendorId);
      
    if (updateError) {
      console.warn("Warning: Could not update credits. Proceeding anyway.", updateError);
      return true;
    }

    console.log(`[decrementCredits] Manual check success.`);
    return true;
  } catch (err) {
    console.warn("Warning: Failed to decrement credits. Proceeding anyway.", err);
    return true;
  }
};
