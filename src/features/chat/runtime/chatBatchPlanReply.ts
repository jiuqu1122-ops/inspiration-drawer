const BATCH_PLAN_CANCELLATION = /^(?:算了|取消(?:任务)?|不做了|先不做(?:了)?|停止(?:任务)?)[吧了，。！!\s]*$/i;
const BATCH_PLAN_REVISION = /(?:但是|不过|改成|改为|调整|修改|不要|去掉|增加|添加|换成|改一下|需要改)/i;
const BATCH_PLAN_REJECTION = /(?:不好|不可以|不行|有问题|先等等|等一下)/i;
const BATCH_PLAN_CONFIRMATION = /(?:好(?:的)?|可以(?:了|开始|执行|生成|做)?|行|没问题|没有问题|确认(?:执行)?|确定|同意|就这样(?:做|来)?|(?:就)?按(?:这个|该|上述|上面|此)?方案(?:开始|执行|生成|做)?|(?:开始|继续)(?:执行|生成|制作|处理|做)?)/i;

export type BatchPlanDecision = 'confirm' | 'revise' | 'cancel';

export const parseBatchPlanDecision = (value: unknown): BatchPlanDecision | null => {
  const text = String(value ?? '').replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  if (!text) return null;
  const directAction = text.toLowerCase();
  if (directAction === 'confirm' || directAction === 'revise' || directAction === 'cancel') {
    return directAction;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const action = String(parsed.action || '').trim().toLowerCase();
    return action === 'confirm' || action === 'revise' || action === 'cancel'
      ? action
      : null;
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const action = String(parsed.action || '').trim().toLowerCase();
      return action === 'confirm' || action === 'revise' || action === 'cancel'
        ? action
        : null;
    } catch (_) {
      return null;
    }
  }
};

export const isBatchPlanCancellation = (value: string) => (
  BATCH_PLAN_CANCELLATION.test(value.trim())
);

export const isBatchPlanConfirmation = (value: string) => {
  const text = value.trim();
  const explicitlyNeedsNoRevision = /^(?:不需要|无需|不用)(?:再)?修改(?:[，,、\s]*(?:开始|继续)(?:执行|生成|制作|处理|做)?[吧了]?)?[呀啊吧的了，。！!\s]*$/i.test(text);
  return Boolean(text)
    && !BATCH_PLAN_CANCELLATION.test(text)
    && (explicitlyNeedsNoRevision || (
      !BATCH_PLAN_REVISION.test(text)
      && !BATCH_PLAN_REJECTION.test(text)
      && BATCH_PLAN_CONFIRMATION.test(text)
    ));
};

export const fallbackBatchPlanDecision = (value: string): BatchPlanDecision => (
  isBatchPlanCancellation(value)
    ? 'cancel'
    : isBatchPlanConfirmation(value)
      ? 'confirm'
      : 'revise'
);
