import { lookupLayer, submitLayer, type LayerRequest } from './canvasLayerApi';
import type { LayerReceipt } from './canvasLayerTypes';
import { scheduleCloudAccountQuotaRefresh } from '../../cloudAccountQuotaRefresh';

const running = new Set<string>();
// The split worker may receive its 90-minute download window after submission.
const pollingWindowMs = 2 * 60 * 60_000;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Independent of canvas visibility and React node mounting. Never re-submit a persisted request. */
export async function followLayerJob(requestId: string, create: (() => Promise<LayerRequest>) | undefined,
  complete: (receipt: LayerReceipt) => Promise<void>, pending: (notice: string) => void) {
  if (running.has(requestId)) return;
  running.add(requestId);
  try {
    // Refresh on the receipt, even when saving the returned images locally fails.
    const finish = async (receipt: LayerReceipt) => {
      scheduleCloudAccountQuotaRefresh();
      await complete(receipt);
    };
    let submissionFinished = !create;
    let terminal: LayerReceipt | undefined;
    let submissionError = '';
    if (create) {
      let request: LayerRequest;
      try { request = await create(); }
      catch (error) { await complete({ status: 'failed', message: message(error) }); return; }
      void submitLayer(request).then(receipt => { if (receipt.status !== 'processing') terminal = receipt; })
        .catch(error => {
          submissionError = message(error);
          const priceError = 'layer_price_changed:';
          if (submissionError.startsWith(priceError)) {
            terminal = { status: 'failed', message: submissionError.slice(priceError.length).trim() };
          }
        })
        .finally(() => { submissionFinished = true; });
    }
    let missing = 0;
    const started = Date.now();
    const deadline = started + pollingWindowMs;
    for (let attempt = 0; ; attempt++) {
      if (terminal) { await finish(terminal); return; }
      if (submissionFinished || attempt % 3 === 0 || Date.now() >= deadline) {
        let receipt: LayerReceipt | undefined;
        try {
          receipt = await lookupLayer(requestId);
        } catch (error) {
          if (message(error).includes('layer_request_not_found')) missing++;
          if (submissionFinished && missing >= 3) {
            await complete({ status: 'failed', message: submissionError || '服务端未登记此请求，请重新运行' });
            return;
          }
        }
        if (receipt) {
          missing = 0;
          if (receipt.status !== 'processing') { await finish(receipt); return; }
        }
      }
      if (terminal) { await finish(terminal); return; }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const interval = Date.now() - started < 5 * 60_000 ? 2_000 : 10_000;
      await delay(Math.min(interval, remaining));
    }
    pending('任务结果尚未确认，可以查询原请求');
  } catch (error) {
    pending('结果暂未保存，可重新查询。' + message(error));
  } finally { running.delete(requestId); }
}
