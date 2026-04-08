import { supabase } from './supabase';

export const logVendorActivity = async (vendorId: string, action: string, details?: any) => {
  try {
    const { error } = await supabase
      .from('vendor_activities')
      .insert([
        {
          vendor_id: vendorId,
          action,
          details: details || null
        }
      ]);

    if (error) {
      console.error('Failed to log vendor activity:', error);
    }
  } catch (err) {
    console.error('Error logging vendor activity:', err);
  }
};
