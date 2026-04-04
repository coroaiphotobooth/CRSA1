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
    
    // 1. Check if the vendor has an active unlimited timer
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('vendor_id, vendors(credits, credits_used, is_timer_running, timer_last_started_at, unlimited_seconds_left, unlimited_expires_at)')
      .eq('id', eventId)
      .single();
      
    if (!eventError && eventData) {
      const vendor = Array.isArray(eventData.vendors) ? eventData.vendors[0] : eventData.vendors as any;
      
      let isExpired = false;
      if (vendor?.unlimited_expires_at && new Date(vendor.unlimited_expires_at).getTime() < Date.now()) {
        isExpired = true;
      }

      if (isExpired) {
        if (vendor?.is_timer_running) {
          await supabase.from('vendors').update({
            is_timer_running: false,
            timer_last_started_at: null,
            unlimited_seconds_left: 0,
            unlimited_expires_at: null
          }).eq('id', eventData.vendor_id);
        }
      } else if (vendor?.is_timer_running && vendor?.timer_last_started_at) {
        const elapsed = Math.floor((Date.now() - new Date(vendor.timer_last_started_at).getTime()) / 1000);
        const remaining = Math.max(0, (vendor.unlimited_seconds_left || 0) - elapsed);
        if (remaining > 0) {
          console.log(`[decrementCredits] Unlimited timer active. Remaining seconds: ${remaining}. Skipping deduction.`);
          return true;
        } else {
          // Timer expired, auto-pause
          await supabase.from('vendors').update({
            is_timer_running: false,
            timer_last_started_at: null,
            unlimited_seconds_left: 0
          }).eq('id', eventData.vendor_id);
        }
      }
    }

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
    if (eventError || !eventData) {
      console.warn("Warning: Could not fetch event/vendor for credits. Proceeding anyway.", eventError);
      return true;
    }

    const vendorId = eventData.vendor_id;
    const vendor = Array.isArray(eventData.vendors) ? eventData.vendors[0] : eventData.vendors as any;
    const currentCredits = vendor?.credits;
    const currentCreditsUsed = vendor?.credits_used;
    
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
