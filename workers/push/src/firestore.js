// Minimal Firestore REST client for the worker, authenticated as the Firebase
// service account (server access: security rules don't apply).
import { importPKCS8, SignJWT } from 'jose';

let cachedToken = null; // { value, expiresAt } — reused while the isolate lives

async function accessToken(serviceAccount) {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

    const key = await importPKCS8(serviceAccount.private_key, 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(serviceAccount.client_email)
        .setAudience('https://oauth2.googleapis.com/token')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!response.ok) throw new Error(`Service account token: ${response.status} ${await response.text()}`);
    const { access_token: value, expires_in: seconds } = await response.json();
    cachedToken = { value, expiresAt: Date.now() + seconds * 1000 };
    return value;
}

/** Firestore REST value -> plain JS value. */
export function decodeValue(v) {
    if (v == null) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('timestampValue' in v) return new Date(v.timestampValue);
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
    if ('mapValue' in v) return decodeFields(v.mapValue.fields);
    return null;
}

const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

/** projects/p/databases/(default)/documents/users/abc -> "users/abc" */
const relativePath = (name) => name.split('/documents/')[1];

const toDoc = (raw) => ({ path: relativePath(raw.name), id: raw.name.split('/').pop(), ...decodeFields(raw.fields) });

/**
 * @param {{ projectId: string, serviceAccount?: object, emulatorHost?: string }} options
 *   emulatorHost ("127.0.0.1:8080") is for tests: the emulator's "owner" token
 *   bypasses rules, like the service account does in production.
 */
export function firestore({ projectId, serviceAccount, emulatorHost }) {
    const origin = emulatorHost ? `http://${emulatorHost}` : 'https://firestore.googleapis.com';
    const base = `${origin}/v1/projects/${projectId}/databases/(default)/documents`;

    async function call(url, init = {}) {
        const token = emulatorHost ? 'owner' : await accessToken(serviceAccount);
        return fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    }

    return {
        /** A document as a plain object (with `path`, `id`), or null. */
        async get(path) {
            const response = await call(`${base}/${path}`);
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`Firestore get ${path}: ${response.status}`);
            return toDoc(await response.json());
        },

        /**
         * Documents of a collection (or, with allDescendants, every collection
         * with that id), optionally filtered by field == value.
         */
        async query(collectionId, { where = null, allDescendants = false } = {}) {
            const structuredQuery = { from: [{ collectionId, allDescendants }] };
            if (where) {
                const [field, value] = where;
                structuredQuery.where = {
                    fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
                };
            }
            const response = await call(`${base}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
            if (!response.ok) throw new Error(`Firestore query ${collectionId}: ${response.status}`);
            return (await response.json()).filter((r) => r.document).map((r) => toDoc(r.document));
        },

        /**
         * Create a document with a fixed id. Resolves false if it already
         * exists: used as a "send once" lock.
         */
        async createOnce(collection, id, fields) {
            const encode = (v) => (v instanceof Date ? { timestampValue: v.toISOString() } : { stringValue: String(v) });
            const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encode(v)])) };
            const response = await call(`${base}/${collection}?documentId=${encodeURIComponent(id)}`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            if (response.status === 409) return false;
            if (!response.ok) throw new Error(`Firestore create ${collection}/${id}: ${response.status}`);
            return true;
        },

        async delete(path) {
            const response = await call(`${base}/${path}`, { method: 'DELETE' });
            if (!response.ok && response.status !== 404) throw new Error(`Firestore delete ${path}: ${response.status}`);
        },
    };
}
