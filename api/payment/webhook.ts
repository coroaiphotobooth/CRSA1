import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Catat semua request mentah di Log Vercel (Paling Krusial)
    console.log('WEBHOOK HIT', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
    });

    // 2. CORS Preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Gunakan Try-Catch yang diakhiri dengan status 200 agar DOKU tidak "Ngangbek"/gagal
    try {
        const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        if (!payload?.transaction || payload.transaction.status !== 'SUCCESS') {
            console.log('Ignoring webhook (not SUCCESS or no transaction object):', payload);
            return res.status(200).json({ message: 'Acknowledged non-success' });
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL; 
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase env');
            // Tetap berikan 200 agar DOKU berhenti retry
            return res.status(200).json({ message: 'Acknowledged with config error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const invoiceNumber = payload?.order?.invoice_number;

        if (!invoiceNumber) {
            console.error('No invoice number in payload');
            return res.status(200).json({ message: 'Acknowledged without invoice' });
        }

        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('doku_invoice_id', invoiceNumber)
            .maybeSingle();

        if (txError) {
            console.error('Transaction query error:', txError);
            return res.status(200).json({ message: 'Acknowledged with query error' });
        }

        if (!transaction) {
            console.error('Transaction not found for invoice:', invoiceNumber);
            return res.status(200).json({ message: 'Acknowledged but transaction missing' });
        }

        if (transaction.status === 'PAID') {
            console.log('Already processed:', invoiceNumber);
            return res.status(200).json({ message: 'Already processed' });
        }

        const { error: updateTxError } = await supabase
            .from('transactions')
            .update({ status: 'PAID' })
            .eq('id', transaction.id);

        if (updateTxError) {
            console.error('Update transaction error:', updateTxError);
            return res.status(200).json({ message: 'Acknowledged with update error' });
        }

        const { data: vendor, error: vendorError } = await supabase
            .from('vendors')
            .select('*')
            .eq('id', transaction.vendor_id)
            .single();

        if (vendorError || !vendor) {
            console.error('Vendor fetch error:', vendorError);
            return res.status(200).json({ message: 'Acknowledged with vendor fetch error' });
        }

        if (transaction.type === 'CREDIT') {
            const newCredits = (vendor.credits || 0) + transaction.quantity;

            const { error: creditError } = await supabase
                .from('vendors')
                .update({ credits: newCredits })
                .eq('id', vendor.id);

            if (creditError) {
                console.error('Credit update error:', creditError);
                return res.status(200).json({ message: 'Acknowledged with credit update error' });
            }
        } else if (transaction.type === 'UNLIMITED') {
            const hoursToAdd = transaction.quantity;
            const now = new Date();
            let currentExpiry = vendor.unlimited_expires_at ? new Date(vendor.unlimited_expires_at) : now;
            
            if (currentExpiry.getTime() < now.getTime()) {
                currentExpiry = now;
            }
            
            currentExpiry.setHours(currentExpiry.getHours() + hoursToAdd);
            
            const { error: unlimitedError } = await supabase
                .from('vendors')
                .update({ 
                    unlimited_expires_at: currentExpiry.toISOString(),
                    unlimited_seconds_left: Math.floor((currentExpiry.getTime() - now.getTime()) / 1000)
                })
                .eq('id', vendor.id);

            if (unlimitedError) {
                console.error('Unlimited update error:', unlimitedError);
                return res.status(200).json({ message: 'Acknowledged with unlimited update error' });
            }
        }

        console.log('Webhook processed successfully:', invoiceNumber);
        return res.status(200).json({ message: 'Success' });
        
    } catch (err) {
        console.error('Webhook async processing error:', err);
        // Selalu balas 200 OK ke DOKU dalam kondisi apapun agar tidak nyangkut FAILED
        return res.status(200).json({ message: 'Acknowledged with internal error' });
    }
}
