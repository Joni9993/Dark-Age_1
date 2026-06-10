// Supabase Edge Function: notify-turn
// Triggered by a Database Webhook on UPDATE of public.games
// Set up in Supabase Dashboard > Database > Webhooks > Create new webhook
//   Table: games, Events: UPDATE
//   HTTP POST to: <project-url>/functions/v1/notify-turn
//
// Required env vars (set in Dashboard > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY  - from: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY - from: npx web-push generate-vapid-keys
//   VAPID_SUBJECT     - e.g. mailto:you@example.com
//   APP_URL           - e.g. https://yourdomain.netlify.app

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── VAPID helpers (pure Web Crypto, no npm) ───────────────────────────────────

function b64uDec(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0));
}

function b64uEnc(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const out = await hmac(prk, new Uint8Array([...info, 0x01]));
  return out.slice(0, len);
}

async function encryptPayload(payload: string, p256dh: string, authStr: string): Promise<{ body: Uint8Array; salt: Uint8Array; serverPub: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const clientPubBytes = b64uDec(p256dh);
  const authBytes = b64uDec(authStr);

  const clientPub = await crypto.subtle.importKey('raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const serverKP  = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPub = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey));
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, serverKP.privateKey, 256));

  // RFC 8291 key derivation (aesgcm scheme used by most browsers)
  const context = new Uint8Array([
    ...new TextEncoder().encode('P-256\x00'),
    0, 65, ...clientPubBytes,
    0, 65, ...serverPub,
  ]);

  const cekInfo   = new Uint8Array([...new TextEncoder().encode('Content-Encoding: aesgcm\x00'), ...context]);
  const nonceInfo = new Uint8Array([...new TextEncoder().encode('Content-Encoding: nonce\x00'), ...context]);

  // PRK = HKDF-Extract(auth, sharedBits)
  const prk = await hmac(authBytes, sharedBits);

  const cekBytes   = await hkdf(salt, prk, cekInfo, 16);
  const nonceBytes = await hkdf(salt, prk, nonceInfo, 12);

  const cek = await crypto.subtle.importKey('raw', cekBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const padded = new Uint8Array([0, 0, ...new TextEncoder().encode(payload)]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceBytes }, cek, padded));

  return { body: ciphertext, salt, serverPub };
}

async function buildVapidJwt(audience: string, subject: string, pubKeyB64u: string, privKeyB64u: string): Promise<string> {
  const pubBytes  = b64uDec(pubKeyB64u);
  const x = b64uEnc(pubBytes.slice(1, 33));
  const y = b64uEnc(pubBytes.slice(33, 65));
  const d = privKeyB64u;

  const key = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', x, y, d, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const hdr = b64uEnc(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const pay = b64uEnc(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject })));
  const msg = `${hdr}.${pay}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(msg));
  return `${msg}.${b64uEnc(sig)}`;
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string): Promise<Response> {
  const pubKey  = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const privKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const subject = Deno.env.get('VAPID_SUBJECT')!;

  const url      = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt      = await buildVapidJwt(audience, subject, pubKey, privKey);

  const { body, salt, serverPub } = await encryptPayload(payload, sub.p256dh, sub.auth);

  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${pubKey}`,
      'Content-Encoding': 'aesgcm',
      'Content-Type': 'application/octet-stream',
      'Encryption': `salt=${b64uEnc(salt)}`,
      'Crypto-Key': `dh=${b64uEnc(serverPub)}`,
      'TTL': '86400',
    },
    body,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    const webhook = await req.json();
    const oldRec  = webhook.old_record;
    const newRec  = webhook.record;

    if (!newRec || newRec.status !== 'active') {
      return new Response('skip', { status: 200 });
    }
    if (!oldRec || oldRec.current_slot === newRec.current_slot) {
      return new Response('no change', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find profile_id for the new current_slot player
    const { data: gp } = await supabase
      .from('game_players')
      .select('profile_id')
      .eq('game_id', newRec.id)
      .eq('slot', newRec.current_slot)
      .eq('eliminated', false)
      .single();

    if (!gp) return new Response('player not found', { status: 200 });

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('profile_id', gp.profile_id);

    if (!subs || subs.length === 0) return new Response('no subs', { status: 200 });

    const appUrl  = Deno.env.get('APP_URL') ?? '';
    const message = JSON.stringify({
      title: 'Dark Ages',
      body:  `Du bist dran in ${newRec.name}!`,
      url:   `${appUrl}?game=${newRec.id}`,
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        const res = await sendPush(sub, message);
        if (res.status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else if (res.ok || res.status === 201) {
          sent++;
        }
      } catch (_) { /* individual push failure is non-fatal */ }
    }

    return new Response(JSON.stringify({ sent }), { status: 200 });
  } catch (err) {
    console.error('notify-turn error:', err);
    return new Response('error', { status: 500 });
  }
});
