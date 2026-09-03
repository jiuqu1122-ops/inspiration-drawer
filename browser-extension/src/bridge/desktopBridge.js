const PROTOCOL_VERSION = 2;
const BRIDGE_PORTS = Array.from({ length: 9 }, (_, index) => 43951 + index);
const STORAGE_KEY = 'inspiration_drawer_pairing';
const REQUEST_TIMEOUT_MS = 4000;
const DIRECT_DATA_URL_CHARS = 256 * 1024;
const DATA_CHUNK_CHARS = 384 * 1024;
const MAX_DATA_URL_CHARS = 16 * 1024 * 1024;

let activeConnection = null;

const browserKind = () => {
  const brands = navigator.userAgentData?.brands || [];
  if (brands.some(brand => /Microsoft Edge/i.test(brand.brand))) return 'edge';
  return /Edg\//i.test(navigator.userAgent) ? 'edge' : 'chrome';
};

const request = async (port, path, body) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inspiration-Extension-Id': chrome.runtime.id,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `bridge_${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
};

const baseMessage = (type) => ({
  type,
  extensionId: chrome.runtime.id,
  browser: browserKind(),
  extensionVersion: chrome.runtime.getManifest().version,
  protocolVersion: PROTOCOL_VERSION,
});

const readPairing = async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || null;
const writePairing = async pairing => chrome.storage.local.set({ [STORAGE_KEY]: pairing });

const hello = async (port, pairing) => request(port, '/v1/hello', {
  ...baseMessage('extension_hello'),
  credential: pairing.credential,
});

const pair = async (port) => {
  const response = await request(port, '/v1/pair', baseMessage('pair_request'));
  const pairing = {
    port,
    credential: response.credential,
    desktopVersion: response.desktopVersion,
    protocolVersion: response.protocolVersion,
  };
  await writePairing(pairing);
  return pairing;
};

export const connectDesktop = async () => {
  const saved = await readPairing();
  const orderedPorts = saved?.port
    ? [saved.port, ...BRIDGE_PORTS.filter(port => port !== saved.port)]
    : BRIDGE_PORTS;
  for (const port of orderedPorts) {
    try {
      let pairing = saved;
      if (pairing?.credential) {
        try {
          const response = await hello(port, pairing);
          activeConnection = { port, credential: pairing.credential, response };
          return activeConnection;
        } catch {
          pairing = null;
        }
      }
      pairing = await pair(port);
      const response = await hello(port, pairing);
      activeConnection = { port, credential: pairing.credential, response };
      return activeConnection;
    } catch {
      // Probe the next reserved localhost port.
    }
  }
  activeConnection = null;
  return null;
};

const authenticatedRequest = async (path, message) => {
  const connection = activeConnection || await connectDesktop();
  if (!connection) throw new Error('desktop_not_connected');
  try {
    return await request(connection.port, path, {
      ...baseMessage(message.type),
      ...message,
      credential: connection.credential,
    });
  } catch (error) {
    activeConnection = null;
    throw error;
  }
};

export const sendHeartbeat = () => authenticatedRequest('/v1/heartbeat', { type: 'heartbeat' });

const uploadDataUrl = async (dragId, dataUrl) => {
  if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error('image_payload_too_large');
  const uploadId = `upload_${dragId}`;
  const totalChunks = Math.ceil(dataUrl.length / DATA_CHUNK_CHARS);
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const dataChunk = dataUrl.slice(chunkIndex * DATA_CHUNK_CHARS, (chunkIndex + 1) * DATA_CHUNK_CHARS);
    await authenticatedRequest('/v1/image-drag-chunk', {
      type: 'image_drag_chunk',
      payload: { dragId, uploadId, chunkIndex, totalChunks, dataChunk },
    });
  }
  return uploadId;
};

export const sendImageDragStarted = async ({ dragId, image }) => {
  if (!dragId || !image) throw new Error('image_payload_required');
  const payload = { dragId, ...image };
  const dataUrl = String(payload.dataUrl || '');
  if (dataUrl.length > DIRECT_DATA_URL_CHARS) {
    payload.uploadId = await uploadDataUrl(dragId, dataUrl);
    delete payload.dataUrl;
  }
  return authenticatedRequest('/v1/image-drag-started', {
    type: 'image_drag_started',
    payload,
  });
};

export const sendImageDragCancelled = dragId => authenticatedRequest('/v1/image-drag-cancelled', {
  type: 'image_drag_cancelled',
  payload: { dragId },
});
