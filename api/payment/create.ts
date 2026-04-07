import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function generateDokuSignature(clientId: string, secretKey: string, requestId: string, requestTimestamp: string, requestTarget: string, body: any) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(body)).digest('base64');
    const signatureComponent = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
    const hmac = crypto.createHmac('sha256', secretKey).update(signatureComponent).digest('base64');
    return `HMACSHA256=${hmac}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { vendor_id, type, amount, quantity } = req.body;

    if (!vendor_id || !type || !amount || !quantity) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need Service Role to bypass RLS if needed, or we can use the user's JWT
    
    // We will use the user's JWT from the Authorization header to insert the transaction securely
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    // Create Supabase client with the user's JWT
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: authHeader,
            },
        },
    });

    try {
        // 1. Insert Transaction into Supabase
        const { data: transaction, error: insertError } = await supabase
            .from('transactions')
            .insert([{
                vendor_id,
                type,
                amount,
                quantity,
                status: 'PENDING'
            }])
            .select()
            .single();

        if (insertError || !transaction) {
            console.error("Error inserting transaction:", insertError);
            return res.status(500).json({ error: 'Failed to create transaction record' });
        }

        // 2. Prepare DOKU Checkout Request
        const dokuClientId = process.env.DOKU_CLIENT_ID;
        const dokuSecretKey = process.env.DOKU_SECRET_KEY;
        // Use Sandbox URL by default unless DOKU_IS_PRODUCTION is set
        const isProduction = process.env.DOKU_IS_PRODUCTION === 'true';
        const dokuBaseUrl = isProduction ? 'https://api.doku.com' : 'https://api-sandbox.doku.com';
        const requestTarget = '/checkout/v1/payment';

        if (!dokuClientId || !dokuSecretKey) {
            return res.status(500).json({ error: 'DOKU configuration missing on server' });
        }

        const requestId = crypto.randomUUID();
        const requestTimestamp = new Date().toISOString().split('.')[0] + 'Z'; // Format: 2020-10-21T01:20:00Z
        
        const invoiceNumber = `INV-${transaction.id.substring(0, 8).toUpperCase()}-${Date.now()}`;

        const dokuPayload = {
            order: {
                invoice_number: invoiceNumber,
                amount: amount
            },
            payment: {
                payment_due_date: 60 // 60 minutes
            }
        };

        const signature = generateDokuSignature(dokuClientId, dokuSecretKey, requestId, requestTimestamp, requestTarget, dokuPayload);

        // 3. Send Request to DOKU
        const dokuResponse = await fetch(`${dokuBaseUrl}${requestTarget}`, {
            method: 'POST',
            headers: {
                'Client-Id': dokuClientId,
                'Request-Id': requestId,
                'Request-Timestamp': requestTimestamp,
                'Signature': signature,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dokuPayload)
        });

        const dokuData = await dokuResponse.json();

        if (!dokuResponse.ok || !dokuData.response || !dokuData.response.payment || !dokuData.response.payment.url) {
            console.error("DOKU API Error:", dokuData);
            // Optionally update transaction status to FAILED
            return res.status(500).json({ error: 'Failed to generate DOKU payment URL', details: dokuData });
        }

        // 4. Update transaction with DOKU Invoice ID
        await supabase
            .from('transactions')
            .update({ doku_invoice_id: invoiceNumber })
            .eq('id', transaction.id);

        // 5. Return the payment URL to the frontend
        return res.status(200).json({ 
            payment_url: dokuData.response.payment.url,
            transaction_id: transaction.id
        });

    } catch (error: any) {
        console.error("Payment Create Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
