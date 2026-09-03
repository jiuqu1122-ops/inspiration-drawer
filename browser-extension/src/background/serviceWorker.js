import {
  connectDesktop,
  sendHeartbeat,
  sendImageDragCancelled,
  sendImageDragStarted,
} from '../bridge/desktopBridge.js';
import { ActiveDragStore } from './activeDrag.js';

const HEARTBEAT_ALARM = 'inspiration-drawer-heartbeat';
const ACTIVE_DRAG_TIMEOUT_MS = 30_000;
const DRAG_END_GRACE_MS = 650;

const activeDragStore = new ActiveDragStore(ACTIVE_DRAG_TIMEOUT_MS);
let activeDragTimeout = null;
let dragEndTimeout = null;

const clearTimer = (timer) => {
  if (timer) clearTimeout(timer);
};

const clearActiveDrag = (dragId) => {
  if (!activeDragStore.clear(dragId)) return false;
  clearTimer(activeDragTimeout);
  clearTimer(dragEndTimeout);
  activeDragTimeout = null;
  dragEndTimeout = null;
  return true;
};

const cancelActiveDrag = async (dragId) => {
  if (!clearActiveDrag(dragId)) return;
  await sendImageDragCancelled(dragId).catch(() => null);
};

const startActiveDrag = async (payload) => {
  const dragId = String(payload?.dragId || '');
  if (!dragId || !payload?.image) return;
  const current = activeDragStore.current();
  if (current?.dragId && current.dragId !== dragId) {
    await cancelActiveDrag(current.dragId);
  }
  clearTimer(dragEndTimeout);
  activeDragStore.begin(payload);
  try {
    await sendImageDragStarted(activeDragStore.current());
  } catch (firstError) {
    await reconnect();
    if (activeDragStore.current()?.dragId !== dragId) throw firstError;
    await sendImageDragStarted(activeDragStore.current());
  }
  clearTimer(activeDragTimeout);
  activeDragTimeout = setTimeout(() => { void cancelActiveDrag(dragId); }, ACTIVE_DRAG_TIMEOUT_MS);
};

const finishActiveDrag = (dragId) => {
  if (!dragId || activeDragStore.current()?.dragId !== dragId) return;
  clearTimer(dragEndTimeout);
  dragEndTimeout = setTimeout(() => { void cancelActiveDrag(dragId); }, DRAG_END_GRACE_MS);
};

const reconnect = () => connectDesktop().catch(() => null);

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  void reconnect();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  void reconnect();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return;
  void sendHeartbeat().catch(reconnect);
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message?.payload) return;
  if (message.type === 'web_image_drag_started') {
    void startActiveDrag(message.payload).catch(error => {
      console.warn('[Inspiration Drawer] image drag transport failed:', error);
      void reconnect();
    });
    return;
  }
  if (message.type === 'web_image_drag_ended') {
    finishActiveDrag(String(message.payload.dragId || ''));
  }
});

chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
void reconnect();
