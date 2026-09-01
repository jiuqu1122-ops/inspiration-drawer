const PROTOCOL_VERSION = 1;
const BRIDGE_PORTS = Array.from({ length: 9 }, (_, index) => 43951 + index);
const STORAGE_KEY = 'inspiration_drawer_pairing';
const REQUEST_TIMEOUT_MS = 1600;

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

export const sendImageDragStarted = payload => authenticatedRequest('/v1/image-drag-started', {
  type: 'image_drag_started',
  payload,
});
