import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const body = req.body;
        
        // Ensure this is a capture completed event
        if (body.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
            return res.status(200).json({ status: 'Ignored, not a capture completed event' });
        }

        const resource = body.resource;
        
        // Find custom_id string which contains the Supabase transaction ID
        const customId = resource.custom_id;
        
        if (!customId) {
            console.error("PayPal Webhook: No custom_id found in resource", resource.id);
            return res.status(200).json({ status: 'No custom_id, ignored' });
        }

        const paypalCaptureId = resource.id; // PayPal Capture ID

        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Supabase config missing');
            return res.status(500).json({ error: 'Server configuration missing' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch transaction
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', customId)
            .single();

        if (txError || !transaction) {
            console.error("Transaction not found:", customId);
            return res.status(200).json({ status: 'Transaction not found' });
        }

        if (transaction.status === 'PAID') {
            console.log(`Transaction ${customId} already processed`);
            return res.status(200).json({ status: 'Already processed' });
        }

        const vendor_id = transaction.vendor_id;
        const quantity = transaction.quantity;
        const type = transaction.type;

        // Processing based on type
        if (type === 'CREDIT') {
            // First fetch current vendor
            const { data: vendor, error: vendorError } = await supabase
                .from('vendors')
                .select('credits')
                .eq('id', vendor_id)
                .single();

            if (vendorError || !vendor) {
                console.error("Vendor not found:", vendor_id);
                return res.status(200).json({ error: 'Vendor not found' });
            }

            const newCredits = (vendor.credits || 0) + quantity;

            // Update vendor
            await supabase
                .from('vendors')
                .update({ credits: newCredits })
                .eq('id', vendor_id);

        } else if (type === 'UNLIMITED') {
            const { data: vendor, error: vendorError } = await supabase
                .from('vendors')
                .select('unlimited_expires_at, is_timer_running, timer_last_started_at, unlimited_seconds_left')
                .eq('id', vendor_id)
                .single();

            if (vendorError || !vendor) {
                console.error("Vendor not found:", vendor_id);
                return res.status(200).json({ error: 'Vendor not found' });
            }

            const hoursToAdd = quantity;
            const now = new Date();
            let currentExpiry = vendor.unlimited_expires_at ? new Date(vendor.unlimited_expires_at) : now;
            
            if (currentExpiry.getTime() < now.getTime()) {
                currentExpiry = now;
            }
            
            currentExpiry.setHours(currentExpiry.getHours() + hoursToAdd);

            await supabase
                .from('vendors')
                .update({
                    unlimited_expires_at: currentExpiry.toISOString(),
                    unlimited_seconds_left: Math.floor((currentExpiry.getTime() - now.getTime()) / 1000)
                })
                .eq('id', vendor_id);
        } else {
             return res.status(200).json({ error: 'Invalid transaction type' });
        }

        // Update 'PENDING' transaction record to 'PAID' so the UI Realtime observer catches it (UPDATE event)
        await supabase
             .from('transactions')
             .update({
                 status: 'PAID',
                 doku_invoice_id: paypalCaptureId // using this column to store the PayPal Capture ID
             })
             .eq('id', transaction.id);

        return res.status(200).json({ status: 'Success' });

    } catch (error: any) {
        console.error("PayPal Webhook processing error:", error);
        return res.status(200).json({ status: 'Error', message: error.message });
    }
}
