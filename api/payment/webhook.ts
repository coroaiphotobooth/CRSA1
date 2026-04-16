import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function verifyDokuSignature(clientId: string, secretKey: string, requestId: string, requestTimestamp: string, requestTarget: string, body: any, signatureToVerify: string) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(body)).digest('base64');
    const signatureComponent = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
    const hmac = crypto.createHmac('sha256', secretKey).update(signatureComponent).digest('base64');
    const expectedSignature = `HMACSHA256=${hmac}`;
    return expectedSignature === signatureToVerify;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const dokuClientId = process.env.DOKU_CLIENT_ID;
    const dokuSecretKey = process.env.DOKU_SECRET_KEY;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!dokuClientId || !dokuSecretKey || !supabaseUrl || !supabaseServiceKey) {
        console.error("Webhook Error: Missing environment variables");
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Extract headers for optional checks (we will log them but not fail if missing for now)
    const clientId = req.headers['client-id'] as string;
    const requestId = req.headers['request-id'] as string;
    const requestTimestamp = req.headers['request-timestamp'] as string;
    const signature = req.headers['signature'] as string;

    console.log("Incoming Webhook Headers:", { clientId, requestId, requestTimestamp });

    let payload = req.body;
    
    // Safety check: if payload is a string, parse it. Sometimes Vercel receives raw text depending on content-type
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (e) {
            console.error("Failed to parse string payload", e);
            return res.status(400).json({ error: 'Invalid JSON payload' });
        }
    }

    console.log("Incoming Webhook Payload:", JSON.stringify(payload));

    if (!payload || !payload.transaction) {
         console.log("Ignoring non-transaction payload from webhook.");
         return res.status(200).json({ message: 'Acknowledged' });
    }

    // We only process SUCCESS transactions
    if (payload.transaction.status === 'SUCCESS') {
        const invoiceNumber = payload.order.invoice_number;

        // Use Service Role Key to bypass RLS for webhook operations
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        try {
            // 1. Find the transaction
            const { data: transaction, error: fetchError } = await supabase
                .from('transactions')
                .select('*')
                .eq('doku_invoice_id', invoiceNumber)
                .single();

            if (fetchError || !transaction) {
                console.error("Webhook Error: Transaction not found", invoiceNumber);
                return res.status(404).json({ error: 'Transaction not found' });
            }

            // If already paid, just return 200 to acknowledge
            if (transaction.status === 'PAID') {
                return res.status(200).json({ message: 'Already processed' });
            }

            // 2. Update transaction status to PAID
            const { error: updateTxError } = await supabase
                .from('transactions')
                .update({ status: 'PAID' })
                .eq('id', transaction.id);

            if (updateTxError) {
                throw updateTxError;
            }

            // 3. Fulfill the order (Add Credits or Unlimited Time)
            const { data: vendor, error: vendorFetchError } = await supabase
                .from('vendors')
                .select('*')
                .eq('id', transaction.vendor_id)
                .single();

            if (vendorFetchError || !vendor) {
                throw new Error('Vendor not found');
            }

            if (transaction.type === 'CREDIT') {
                const newCredits = (vendor.credits || 0) + transaction.quantity;
                await supabase
                    .from('vendors')
                    .update({ credits: newCredits })
                    .eq('id', vendor.id);
            } else if (transaction.type === 'UNLIMITED') {
                // quantity is in hours
                const hoursToAdd = transaction.quantity;
                const now = new Date();
                
                let currentExpiry = vendor.unlimited_expires_at ? new Date(vendor.unlimited_expires_at) : now;
                
                // If expired, start from now. If still active, add to existing expiry.
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
                    .eq('id', vendor.id);
            }

            console.log(`Successfully processed payment for invoice ${invoiceNumber}`);
            return res.status(200).json({ message: 'Success' });

        } catch (error: any) {
            console.error("Webhook Processing Error:", error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Acknowledge other statuses without processing
    return res.status(200).json({ message: 'Acknowledged' });
}
