import { connectDesktop, sendHeartbeat, sendImageDragStarted } from '../bridge/desktopBridge.js';

const HEARTBEAT_ALARM = 'inspiration-drawer-heartbeat';

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
  if (message?.type !== 'web_image_drag_started' || !message.payload) return;
  void sendImageDragStarted(message.payload).catch(reconnect);
});

chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
void reconnect();
