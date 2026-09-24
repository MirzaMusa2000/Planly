// Planly push worker (Cloudflare Workers, free plan).
//
// POST /notify  { type: 'signup' }                        -> admins
//               { type: 'proposal', eventId }             -> everyone else approved
//               { type: 'chat', messageId }               -> everyone else approved
//
// Called by the browser right after it creates the thing, with its Firebase ID
// token. The worker re-reads the document from Firestore and only notifies if
// the caller really created it moments ago, once per document (a lock in
// pushLog/), so it can't be used to send arbitrary or repeated pushes.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { firestore } from './firestore.js';
import { sendPush } from './webpush.js';

const GOOGLE_JWKS = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

const FRESH_MS = 10 * 60 * 1000; // only things created in the last 10 minutes
const MAX_DEVICES = 40; // the free plan allows 50 outgoing requests per call
const ID = /^[A-Za-z0-9_-]{1,64}$/;

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const json = (data, status, headers) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function isAllowedOrigin(origin, env) {
    if (!origin) return false;
    if (env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).includes(origin)) return true;
    // Hosting preview channels, e.g. https://planly-794a5--staging-abc123.web.app
    return new RegExp(`^https://${env.PROJECT_ID}--[a-z0-9-]+\\.web\\.app$`).test(origin);
}

async function verifyIdToken(request, env) {
    const header = request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new HttpError(401, 'Sign in first.');
    try {
        const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
            issuer: `https://securetoken.google.com/${env.PROJECT_ID}`,
            audience: env.PROJECT_ID,
            algorithms: ['RS256'],
        });
        if (!payload.sub) throw new Error('no subject');
        return payload.sub;
    } catch {
        throw new HttpError(401, 'Invalid sign-in token.');
    }
}

const isFresh = (date) => date instanceof Date && Date.now() - date.getTime() < FRESH_MS;
const truncate = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** What to send, and to whom, for a request from `uid`. */
async function plan(db, body, uid) {
    const caller = await db.get(`users/${uid}`);
    if (!caller) throw new HttpError(403, 'No Planly account.');
    const approved = () => db.query('users', { where: ['status', 'approved'] });

    switch (body.type) {
        case 'signup': {
            if (caller.status !== 'pending' || !isFresh(caller.createdAt)) throw new HttpError(409, 'Nothing new.');
            const admins = (await approved()).filter((u) => u.role === 'admin');
            return {
                lock: `signup-${uid}`,
                recipients: admins.map((u) => u.id),
                message: {
                    title: 'New member waiting for approval',
                    body: `${caller.displayName || caller.email} (${caller.email}) wants to join Planly.`,
                    url: '/members',
                    tag: 'planly-signup',
                },
            };
        }

        case 'proposal': {
            if (caller.status !== 'approved') throw new HttpError(403, 'Not approved.');
            if (!ID.test(body.eventId ?? '')) throw new HttpError(400, 'Bad event id.');
            const event = await db.get(`events/${body.eventId}`);
            if (!event || event.proposedBy !== uid || event.status !== 'proposed' || !isFresh(event.createdAt)) {
                throw new HttpError(409, 'Nothing new.');
            }
            const dates = event.candidateDates?.length ?? 0;
            return {
                lock: `proposal-${body.eventId}`,
                recipients: (await approved()).map((u) => u.id).filter((id) => id !== uid),
                message: {
                    title: `New proposal: ${truncate(event.title, 80)}`,
                    body: `${event.proposedByName || caller.displayName} suggested ${dates} ${dates === 1 ? 'date' : 'dates'}. Tap to vote.`,
                    url: `/#event=${body.eventId}`,
                    tag: `planly-event-${body.eventId}`,
                },
            };
        }

        case 'chat': {
            if (caller.status !== 'approved') throw new HttpError(403, 'Not approved.');
            if (!ID.test(body.messageId ?? '')) throw new HttpError(400, 'Bad message id.');
            const message = await db.get(`chats/main/messages/${body.messageId}`);
            if (!message || message.senderId !== uid || !isFresh(message.createdAt)) throw new HttpError(409, 'Nothing new.');
            return {
                lock: `chat-${body.messageId}`,
                recipients: (await approved()).map((u) => u.id).filter((id) => id !== uid),
                message: {
                    title: message.senderName || 'New message',
                    body: truncate(message.text, 140),
                    url: '/#chat',
                    tag: 'planly-chat', // newer chat notifications replace older ones
                },
            };
        }

        default:
            throw new HttpError(400, 'Unknown notification type.');
    }
}

async function deliver(db, env, recipients, message) {
    const wanted = new Set(recipients);
    if (wanted.size === 0) return { devices: 0, sent: 0, removed: 0 };

    // users/{uid}/pushSubscriptions/{id}. A device used by several accounts
    // belongs to whoever turned notifications on last; older copies are removed.
    const subscriptions = await db.query('pushSubscriptions', { allDescendants: true });
    const byEndpoint = new Map();
    const stale = [];
    for (const s of subscriptions) {
        s.uid = s.path.split('/')[1];
        const previous = byEndpoint.get(s.endpoint);
        if (!previous || s.createdAt > previous.createdAt) {
            if (previous) stale.push(previous);
            byEndpoint.set(s.endpoint, s);
        } else {
            stale.push(s);
        }
    }

    const targets = [...byEndpoint.values()].filter((s) => wanted.has(s.uid)).slice(0, MAX_DEVICES);
    const vapid = {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK),
        subject: env.VAPID_SUBJECT,
    };

    const results = await Promise.allSettled(targets.map(async (s) => {
        const result = await sendPush(s, message, vapid);
        if (result.gone) await db.delete(s.path);
        else if (!result.ok) console.warn(`Push to ${new URL(s.endpoint).host} failed: ${result.status}`);
        return result;
    }));
    await Promise.allSettled(stale.slice(0, 5).map((s) => db.delete(s.path)));

    const done = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    return {
        devices: targets.length,
        sent: done.filter((r) => r.ok).length,
        removed: done.filter((r) => r.gone).length,
    };
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin');
        const allowed = isAllowedOrigin(origin, env);
        const cors = allowed
            ? {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '86400',
                Vary: 'Origin',
            }
            : { Vary: 'Origin' };

        if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
        if (new URL(request.url).pathname !== '/notify' || request.method !== 'POST') return json({ error: 'Not found' }, 404, cors);
        if (!allowed) return json({ error: 'Origin not allowed' }, 403, cors);

        try {
            const uid = await verifyIdToken(request, env);
            const body = await request.json().catch(() => ({}));
            const db = env.FIRESTORE_EMULATOR_HOST // tests only; never set in production
                ? firestore({ projectId: env.PROJECT_ID, emulatorHost: env.FIRESTORE_EMULATOR_HOST })
                : firestore({ projectId: env.PROJECT_ID, serviceAccount: JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) });

            const { lock, recipients, message } = await plan(db, body, uid);
            if (!(await db.createOnce('pushLog', lock, { type: body.type, by: uid, at: new Date().toISOString() }))) {
                return json({ skipped: 'already sent' }, 200, cors);
            }
            return json(await deliver(db, env, recipients, message), 200, cors);
        } catch (e) {
            if (!(e instanceof HttpError)) console.error(e);
            const status = e instanceof HttpError ? e.status : 500;
            return json({ error: status === 500 ? 'Something went wrong.' : e.message }, status, cors);
        }
    },
};
