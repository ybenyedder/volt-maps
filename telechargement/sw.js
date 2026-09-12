importScripts(new URL('reborn/brotli-decoder.js', self.location.href).href);

const ASSET_CACHE_VERSION = 'local-fe4e150b20e9';
const ASSET_CACHE_NAME = `tro-unity-assets-${ASSET_CACHE_VERSION}`;
const CHARACTER_PACK_CACHE_NAME = `tro-character-packs-${ASSET_CACHE_VERSION}`;
const CHARACTER_PACK_MAGIC = new Uint8Array([0x54, 0x56, 0x4b, 0x53, 0x50, 0x4b, 0x31, 0x00]);
const CHARACTER_PACK_BROTLI_DECOMPRESS = require('decompress.js');
const DIRECT_R2_ORIGIN = 'http://localhost:8907';
const PROTECTED_CONTENT_DB_NAME = 'tro-protected-content-keys-v1';
const PROTECTED_CONTENT_DB_VERSION = 1;
const PROTECTED_CONTENT_PROTOCOL_VERSION = 3;
const PROTECTED_CONTENT_HANDSHAKE_TTL_MS = 2 * 60 * 1000;
const PROTECTED_CONTENT_KEY_TTL_MS = 24 * 60 * 60 * 1000;
const APP_SESSION_CACHE_MS = 10 * 60 * 1000;
const PROTECTED_CONTENT_HANDSHAKES = new Map();
const PROTECTED_CONTENT_KEYS = new Map();
let protectedContentDbPromise = null;
let appSessionCache = null;
let appSessionRequest = null;
let appSessionGeneration = 0;
const REBORN_ASSET_DEBUG_CLIENTS = new Set();
const REBORN_ASSET_DEBUG_EVENTS = [];
const CACHE_FIRST_PREFIXES = [
  '/game-assets/builds/',
  '/unity/',
  '/save/',
];
const THUMBNAIL_PREFIX = '/game-assets/thumbnails/';
const CORE_ASSET_URLS = [
  '/unity/poki.js',
  '/unity/UnityLoader.2019.2.js',
  '/unity/4399.js',
  '/unity/4399.sf.js',
  '/unity/4399.z.js',
  '/unity/subwaySurf14.08.js',
];

self.addEventListener('install', event => {
  event.waitUntil(Promise.all([
    self.skipWaiting(),
    precacheCoreAssets(),
  ]));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames



      .filter(name => (name.startsWith('tro-unity-assets-') && name !== ASSET_CACHE_NAME)
        || (name.startsWith('tro-character-packs-') && name !== CHARACTER_PACK_CACHE_NAME))
      .map(name => caches.delete(name)));



    try {
      await self.clients.claim();
    } catch {
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Filet de sécurité : certains catalogues protégés contiennent encore
  // l'ancien domaine CDN (ex. nocoin.webtvmedia.net, injoignable/mal configuré).
  // Toute requête cross-origin visant /builds/ ou /reborn/content/ est rejouée
  // en local — ces fichiers existent dans telechargement/ ou dans le cache.
  if (request.method === 'GET' && url.origin !== self.location.origin
      && (url.pathname.startsWith('/builds/') || url.pathname.startsWith('/reborn/content/'))) {
    const locale = new URL(url.pathname + url.search, self.location.origin);
    event.respondWith(fetch(new Request(locale.href, request)));
    return;
  }
  if (url.origin === self.location.origin && url.pathname === '/api/auth/session' && request.method === 'GET') {
    event.respondWith(appSessionResponse(request));
    return;
  }
  if (url.origin === self.location.origin && url.pathname === '/api/auth/logout' && request.method === 'POST') {
    clearAppSessionCache();
    event.respondWith(fetch(request));
    return;
  }
  if (url.origin === self.location.origin && url.pathname === '/api/auth/discord/start') {
    clearAppSessionCache();
  }
  const strategy = cacheStrategyForRequest(request);
  if (request.method !== 'GET' || !strategy) return;

  const operation = () => strategy === 'sealed-protected-content'
    ? sealedProtectedContent(request)
    : strategy === 'direct-r2-unity' ? directR2UnityAsset(request)
      : strategy === 'stale-while-revalidate' ? staleWhileRevalidate(request) : cacheFirst(request);
  event.respondWith(REBORN_ASSET_DEBUG_CLIENTS.has(event.clientId)
    ? debugRebornAssetRequest(event, strategy, operation)
    : operation());
});

function clearAppSessionCache() {
  appSessionGeneration += 1;
  appSessionCache = null;
  appSessionRequest = null;
}

function appSessionResponse(request) {
  const force = request.headers.get('X-Tavvkkj-Session-Refresh') === '1';
  if (!force && appSessionCache?.expiresAt > Date.now()) {
    return Promise.resolve(appSessionCache.response.clone());
  }
  if (!force && appSessionRequest) {
    return appSessionRequest.then(response => response.clone());
  }
  const generation = appSessionGeneration;
  const pending = fetch(request).then(async response => {
    const body = await response.arrayBuffer();
    const stored = new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
    if (response.ok && generation === appSessionGeneration) {
      appSessionCache = {
        expiresAt: Date.now() + APP_SESSION_CACHE_MS,
        response: stored.clone(),
      };
    }
    return stored;
  });
  appSessionRequest = pending;
  return pending.then(response => response.clone()).finally(() => {
    if (appSessionRequest === pending) appSessionRequest = null;
  });
}

self.addEventListener('message', event => {
  if (event.data?.type === 'tro-claim-clients') {
    event.waitUntil(self.clients.claim().then(
      () => event.ports[0]?.postMessage({ ok: true }),
      () => event.ports[0]?.postMessage({ ok: false }),
    ));
    return;
  }
  if (event.data?.type === 'tro-reborn-asset-debug-enable') {
    if (event.source?.id) REBORN_ASSET_DEBUG_CLIENTS.add(event.source.id);
    event.ports[0]?.postMessage({ ok: true });
    return;
  }
  if (event.data?.type === 'tro-reborn-asset-debug-collect') {
    const clientId = event.source?.id || '';
    event.ports[0]?.postMessage({
      events: REBORN_ASSET_DEBUG_EVENTS.filter(entry => !clientId || entry.clientId === clientId).slice(-240),
      ok: true,
    });
    return;
  }
  if (event.data?.type !== 'tro-protected-content-handshake'
    && event.data?.type !== 'tro-protected-content-envelope') return;
  const operation = event.data.type === 'tro-protected-content-handshake'
    ? createProtectedContentHandshake()
    : unwrapProtectedContentEnvelope(event.data.envelope);
  event.waitUntil(operation.then(
    payload => event.ports[0]?.postMessage({ ok: true, payload }),
    error => event.ports[0]?.postMessage({ ok: false, error: protectedContentErrorCode(error) }),
  ));
});

async function debugRebornAssetRequest(fetchEvent, strategy, operation) {
  const request = fetchEvent.request;
  const url = new URL(request.url);
  const entry = {
    cache: request.cache,
    clientId: fetchEvent.clientId || '',
    credentials: request.credentials,
    destination: request.destination,
    id: REBORN_ASSET_DEBUG_EVENTS.length + 1,
    method: request.method,
    mode: request.mode,
    path: url.pathname,
    range: request.headers.get('Range') || '',
    startedAt: Date.now(),
    strategy,
    xUnityVersion: request.headers.get('X-Unity-Version') || '',
  };
  REBORN_ASSET_DEBUG_EVENTS.push(entry);
  if (REBORN_ASSET_DEBUG_EVENTS.length > 480) REBORN_ASSET_DEBUG_EVENTS.splice(0, 240);
  try {
    const response = await operation();
    entry.completedAt = Date.now();
    entry.contentLength = response.headers.get('Content-Length') || '';
    entry.contentRange = response.headers.get('Content-Range') || '';
    entry.responseType = response.type || '';
    entry.status = response.status;
    await publishRebornAssetDebug(fetchEvent.clientId, entry);
    return response;
  } catch (error) {
    entry.completedAt = Date.now();
    entry.error = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
    await publishRebornAssetDebug(fetchEvent.clientId, entry);
    throw error;
  }
}

async function publishRebornAssetDebug(clientId, entry) {
  if (!clientId) return;
  const client = await self.clients.get(clientId).catch(() => null);
  client?.postMessage({ event: { ...entry }, type: 'tro-reborn-asset-debug-event' });
}

function cacheStrategyForRequest(request) {
  const url = new URL(request.url);
  if (protectedContentIdentity(url)) return 'sealed-protected-content';
  if (directR2UnityAssetIdentity(url)) return 'direct-r2-unity';
  if (url.origin !== self.location.origin) return '';
  if (url.pathname.startsWith(THUMBNAIL_PREFIX)) return 'stale-while-revalidate';
  if (CACHE_FIRST_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) return 'cache-first';
  return '';
}

function directR2UnityAssetIdentity(url) {
  return url.origin === DIRECT_R2_ORIGIN
    && /^\/builds\/shared\/[a-z0-9._-]+\/StreamingAssets\/[a-z0-9._\/-]+$/i.test(url.pathname);
}

async function directR2UnityAsset(request) {
  const upstream = await fetch(new Request(request.url, {
    credentials: 'omit',
    headers: request.headers,
    method: 'GET',
    mode: 'cors',
  }));
  return upstream;
}

async function sealedProtectedContent(request) {
  const identity = protectedContentIdentity(new URL(request.url));
  if (!identity) return fetch(request);
  const canonicalRequest = new Request(request.url, {
    credentials: 'omit',
    headers: characterPackCanonicalHeaders(request.headers),
    method: 'GET',
    mode: request.mode,
  });
  const cache = await caches.open(CHARACTER_PACK_CACHE_NAME);
  let stored = await cache.match(canonicalRequest, { ignoreVary: true });
  if (!stored) {
    stored = await fetchProtectedContentUpstream(canonicalRequest);
    if (!stored.ok) return unityReadableResponse(stored);
    if (stored.status !== 200) return unityReadableResponse(stored);
  }
  const encoded = await stored.clone().arrayBuffer();
  if (!hasCharacterPackMagic(encoded)) {
    if (!request.headers.has('range')) return stored;
    return fetchProtectedContentUpstream(new Request(request.url, {
      credentials: 'omit',
      headers: request.headers,
      method: 'GET',
      mode: 'cors',
    }));
  }
  if (!await cache.match(canonicalRequest, { ignoreVary: true })) {
    await cache.put(canonicalRequest, await cacheableResponse(stored.clone()));
  }
  const key = await readProtectedContentKey(identity.scope, identity.release);
  if (!key) return new Response(null, { status: 503, statusText: 'Character pack key unavailable' });
  try {
    const decoded = await unsealCharacterPack(encoded, key, identity.assetName);
    return characterPackResponse(request, decoded, stored.headers);
  } catch {
    return new Response(null, { status: 498, statusText: 'Character pack integrity failure' });
  }
}

async function fetchProtectedContentUpstream(request) {
  const firstUrl = new URL(request.url);
  if (firstUrl.origin === DIRECT_R2_ORIGIN) {
    firstUrl.searchParams.set('troCors', ASSET_CACHE_VERSION);
  }
  const firstRequest = new Request(firstUrl, {
    credentials: 'omit',
    headers: request.headers,
    method: 'GET',
    mode: 'cors',
  });
  try {
    return await fetch(firstRequest);
  } catch (firstError) {
    const retryUrl = new URL(firstRequest.url);
    retryUrl.searchParams.set('troCorsRetry', ASSET_CACHE_VERSION);
    try {
      return await fetch(new Request(retryUrl, {
        cache: 'reload',
        credentials: 'omit',
        headers: request.headers,
        method: 'GET',
        mode: 'cors',
      }));
    } catch {
      throw firstError;
    }
  }
}

function unityReadableResponse(response) {
  const headers = new Headers();
  for (const name of [
    'Accept-Ranges', 'Access-Control-Allow-Credentials', 'Access-Control-Allow-Origin',
    'Access-Control-Expose-Headers', 'Cache-Control', 'Content-Encoding', 'Content-Length',
    'Content-Range', 'Content-Type', 'Cross-Origin-Resource-Policy', 'ETag', 'Last-Modified', 'Vary',
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function characterPackCanonicalHeaders(source) {
  const headers = new Headers(source);
  headers.delete('Range');
  return headers;
}

function protectedContentIdentity(url) {
  if (url.origin !== 'http://localhost:8907' && url.origin !== self.location.origin
    && !/^http:\/\/(?:127\.0\.0\.1|localhost):8787$/i.test(url.origin)) return null;
  const character = url.pathname.match(/(?:^|\/)builds\/shared\/([a-z0-9._-]+)\/CharacterPacks\/([^/]+\.bundle)$/i);
  if (character) return { assetName: character[2], release: character[1], scope: 'character-pack' };
  const content = url.pathname.match(/(?:^|\/)reborn\/content\/([a-z0-9-]+)\/([a-z0-9._-]+)\/([^/]+\.(?:bundle|bin|hash))$/i);
  if (content) return { assetName: content[3], release: content[2], scope: 'map-content' };
  return null;
}

async function createProtectedContentHandshake() {
  const keyPair = { // LOCAL FIX: cle ECDH deterministe pour rejeu hors ligne
    privateKey: await crypto.subtle.importKey('jwk', {"crv":"P-256","d":"-7Sd0Yi2JmUrgXqzEOZ1oqFFSDBL7txU7x18HIcMnYc","ext":true,"key_ops":["deriveBits"],"kty":"EC","x":"SJhjdyX5hVsGqSmnOWCjDiwqUQuF0rnBd4MoqLStD-0","y":"yh76QhqGijBjOPM_CIGgbAtKfCt7u51fw6sRzTXkBsE"}, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('jwk', {"crv":"P-256","ext":true,"kty":"EC","x":"SJhjdyX5hVsGqSmnOWCjDiwqUQuF0rnBd4MoqLStD-0","y":"yh76QhqGijBjOPM_CIGgbAtKfCt7u51fw6sRzTXkBsE","key_ops":[]}, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const handshakeId = 'bG9jYWwtZml4ZWQtaGFuZHNoYWtl'; // LOCAL FIX: id fixe
  const expiresAt = Date.now() + 3650 * 24 * 60 * 60 * 1000; // LOCAL FIX: TTL 10 ans
  const pending = { expiresAt, privateKey: keyPair.privateKey, privateKeyJwk };
  PROTECTED_CONTENT_HANDSHAKES.set(handshakeId, pending);
  await writeProtectedContentRecord('handshakes', handshakeId, { expiresAt, privateKeyJwk }).catch(() => false);
  for (const [id, pending] of PROTECTED_CONTENT_HANDSHAKES) {
    if (pending.expiresAt < Date.now()) PROTECTED_CONTENT_HANDSHAKES.delete(id);
  }
  return { handshakeId, protocolVersion: PROTECTED_CONTENT_PROTOCOL_VERSION, publicKey };
}

async function unwrapProtectedContentEnvelope(envelope) {
  const handshakeId = String(envelope?.handshakeId || '');
  const pending = PROTECTED_CONTENT_HANDSHAKES.get(handshakeId)
    || await readProtectedContentRecord('handshakes', handshakeId).catch(() => null);
  if (!pending) throw new Error('handshake_missing');
  if (pending.expiresAt < Date.now()) {
    await deleteProtectedContentRecord('handshakes', handshakeId).catch(() => false);
    PROTECTED_CONTENT_HANDSHAKES.delete(handshakeId);
    throw new Error('handshake_expired');
  }
  if (envelope?.v !== 1) throw new Error('handshake_unsupported');
  const serverPublicKey = await crypto.subtle.importKey(
    'jwk', envelope.serverPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const privateKey = pending.privateKey || await crypto.subtle.importKey(
    'jwk', pending.privateKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: serverPublicKey }, privateKey, 256,
  );
  const material = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const wrappingKey = await crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt: decodeBase64Url(envelope.salt),
    info: new TextEncoder().encode(`tro-protected-content-envelope-v1\0${handshakeId}`),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: decodeBase64Url(envelope.iv),
    additionalData: new TextEncoder().encode(handshakeId), tagLength: 128,
  }, wrappingKey, decodeBase64Url(envelope.ciphertext));
  const payload = JSON.parse(new TextDecoder().decode(plaintext));
  const gatewayExpiresAt = Number(payload.expiresAt);
  if (payload.handshakeId !== handshakeId
    || !Number.isSafeInteger(gatewayExpiresAt)
    || gatewayExpiresAt < 1_500_000_000) throw new Error('expired');
  const installedAt = Date.now();
  for (const entry of payload.keys || []) {
    const scope = String(entry.scope || '');
    const release = String(entry.release || '');
    const raw = decodeBase64Url(String(entry.key || ''));
    if (!/^[a-z-]{3,32}$/.test(scope) || !/^[a-z0-9._-]{8,160}$/i.test(release) || raw.byteLength !== 32) throw new Error('key');
    const materialKey = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    const identity = `${scope}:${release}`;
    const expiresAt = installedAt + PROTECTED_CONTENT_KEY_TTL_MS;
    PROTECTED_CONTENT_KEYS.set(identity, { expiresAt, materialKey });
    await writeProtectedContentRecord('keys', identity, {
      expiresAt,
      rawKey: encodeBase64Url(raw),
    }).catch(() => false);
  }
  PROTECTED_CONTENT_HANDSHAKES.delete(handshakeId);
  await deleteProtectedContentRecord('handshakes', handshakeId).catch(() => false);
  return { installed: (payload.keys || []).length };
}

async function readProtectedContentKey(scope, release) {
  const identity = `${scope}:${release}`;
  let record = PROTECTED_CONTENT_KEYS.get(identity)
    || await readProtectedContentRecord('keys', identity).catch(() => null);
  if (record instanceof Uint8Array || isHkdfCryptoKey(record)) return record;
  if (Number(record?.expiresAt) < Date.now()) {
    PROTECTED_CONTENT_KEYS.delete(identity);
    await deleteProtectedContentRecord('keys', identity).catch(() => false);
    return null;
  }
  if (!record?.materialKey && record?.rawKey) {
    const raw = decodeBase64Url(String(record.rawKey));
    if (raw.byteLength !== 32) {
      await deleteProtectedContentRecord('keys', identity).catch(() => false);
      return null;
    }
    record = {
      expiresAt: Number(record.expiresAt),
      materialKey: await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']),
    };
  }
  if (!record?.materialKey) return null;
  PROTECTED_CONTENT_KEYS.set(identity, record);
  return record.materialKey;
}

function isHkdfCryptoKey(value) {
  return Boolean(value && typeof value === 'object'
    && value.type === 'secret' && value.algorithm?.name === 'HKDF');
}

function hasCharacterPackMagic(value) {
  const bytes = new Uint8Array(value, 0, Math.min(value.byteLength, CHARACTER_PACK_MAGIC.length));
  return bytes.length === CHARACTER_PACK_MAGIC.length
    && CHARACTER_PACK_MAGIC.every((byte, index) => bytes[index] === byte);
}

async function unsealCharacterPack(value, releaseKey, bundleName) {
  const bytes = new Uint8Array(value);
  if (bytes.length < 60 || bytes[8] !== 1 || bytes[9] !== 2 || bytes[10] !== 12 || bytes[11] !== 16) throw new Error('header');
  const header = bytes.slice(0, 32);
  const expectedName = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bundleName))).slice(0, 12);
  if (!expectedName.every((byte, index) => byte === header[20 + index])) throw new Error('identity');
  const rawBytes = new DataView(header.buffer).getUint32(12, true);
  const packedBytes = new DataView(header.buffer).getUint32(16, true);
  if (packedBytes + 60 !== bytes.length) throw new Error('length');
  const material = releaseKey instanceof Uint8Array
    ? await crypto.subtle.importKey('raw', releaseKey, 'HKDF', false, ['deriveKey'])
    : releaseKey;
  const key = await crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(bundleName),
    info: new TextEncoder().encode('tvk-character-pack-bundle-v1'),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const packed = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: bytes.slice(32, 44), additionalData: header, tagLength: 128,
  }, key, bytes.slice(44));
  const decodedBytes = CHARACTER_PACK_BROTLI_DECOMPRESS(new Uint8Array(packed));
  const decoded = decodedBytes.buffer.slice(decodedBytes.byteOffset, decodedBytes.byteOffset + decodedBytes.byteLength);
  if (decoded.byteLength !== rawBytes) throw new Error('decoded');
  return decoded;
}

function protectedContentErrorCode(error) {
  const code = String(error?.message || 'rejected');
  return /^(?:handshake_missing|handshake_expired|handshake_unsupported|expired|key)$/.test(code)
    ? code
    : 'decrypt_failed';
}

function openProtectedContentDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (protectedContentDbPromise) return protectedContentDbPromise;
  protectedContentDbPromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(PROTECTED_CONTENT_DB_NAME, PROTECTED_CONTENT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('handshakes')) db.createObjectStore('handshakes');
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('protected_content_storage_open_failed'));
  }).catch(error => {
    protectedContentDbPromise = null;
    throw error;
  });
  return protectedContentDbPromise;
}

async function readProtectedContentRecord(storeName, identity) {
  const db = await openProtectedContentDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(identity);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('protected_content_storage_read_failed'));
  });
}

async function writeProtectedContentRecord(storeName, identity, record) {
  const db = await openProtectedContentDb();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(record, identity);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('protected_content_storage_write_failed'));
    transaction.onabort = () => reject(transaction.error || new Error('protected_content_storage_write_failed'));
  });
}

async function deleteProtectedContentRecord(storeName, identity) {
  const db = await openProtectedContentDb();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(identity);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('protected_content_storage_delete_failed'));
    transaction.onabort = () => reject(transaction.error || new Error('protected_content_storage_delete_failed'));
  });
}

function characterPackResponse(request, value, sourceHeaders = new Headers()) {
  const headers = protectedContentResponseHeaders(sourceHeaders);
  const range = request.headers.get('range');
  if (!range) return new Response(value, {
    headers: withHeaderValues(headers, {
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Length': String(value.byteLength),
      'Content-Type': 'application/octet-stream',
    }),
  });
  const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
  if (!match) return new Response(null, { status: 416 });
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : value.byteLength - 1;
  if (start > end || end >= value.byteLength) return new Response(null, {
    headers: withHeaderValues(headers, { 'Content-Range': `bytes */${value.byteLength}` }), status: 416,
  });
  return new Response(value.slice(start, end + 1), {
    headers: withHeaderValues(headers, {
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${value.byteLength}`, 'Content-Type': 'application/octet-stream',
    }),
    status: 206,
  });
}

function protectedContentResponseHeaders(source) {
  const headers = new Headers();
  for (const name of [
    'Access-Control-Allow-Credentials', 'Access-Control-Allow-Origin', 'Access-Control-Expose-Headers',
    'Cross-Origin-Resource-Policy', 'Vary',
  ]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function withHeaderValues(headers, values) {
  const result = new Headers(headers);
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

function encodeBase64Url(value) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function cacheFirst(request) {
  if (request.cache === 'reload' || request.cache === 'no-store') {
    return fetch(request);
  }

  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    if (request.headers.has('range')) return rangeResponse(request, cached);
    return cached;
  }

  return fetchAndCache(request, cache);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE_NAME);
  if (request.cache === 'reload' || request.cache === 'no-store') {
    return fetchAndCache(request, cache);
  }

  const cached = await cache.match(request);
  const fresh = fetchAndCache(request, cache).catch(() => cached);
  return cached || fresh;
}

async function fetchAndCache(request, cache) {
  const response = await fetch(request);
  if (response.ok && response.status === 200 && !request.headers.has('range')) {
    await cache.put(request, await cacheableResponse(response));
  }
  return response;
}

async function cacheableResponse(response) {
  if (!response.headers.has('Content-Encoding')) return response.clone();

  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  return new Response(await response.clone().arrayBuffer(), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function precacheCoreAssets() {
  try {
    const cache = await caches.open(ASSET_CACHE_NAME);
    await cache.addAll(CORE_ASSET_URLS);
  } catch {

  }
}

async function rangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || '');
  if (!match) return cachedResponse;

  const source = await cachedResponse.arrayBuffer();
  const size = source.byteLength;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (start > end || end >= size) {
    const headers = protectedContentResponseHeaders(cachedResponse.headers);
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, {
      headers,
      status: 416,
    });
  }

  const headers = protectedContentResponseHeaders(cachedResponse.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Type', cachedResponse.headers.get('Content-Type') || 'application/octet-stream');
  return new Response(source.slice(start, end + 1), {
    headers,
    status: 206,
  });
}
