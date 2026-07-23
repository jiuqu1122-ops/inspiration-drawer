# Workflow Draft 接线实施计划

## 探索发现

### 1. Tool Dispatch 架构
- **入口**: `useCanvasAgentRuntime.sendMessage()` → `prepareAppAgentTurn()` → `processToolCalls()` → `executeToolCall()`
- **实际执行**: `App.tsx` 的 `executeTool` 回调（行22734）
- **现有 handler**:
  - `canvas_create_workflow` (行23964)
  - `canvas_apply_workflow` (行23934)
  - `canvas_update_prompt` (行24342)
  - `canvas_organize` (行24367)
  - `canvas_run_workflow` (行24373)
- **缺失 handler**: `canvas_create_workflow_draft` 和 `canvas_update_workflow_draft` ❌

### 2. Intent Routing 现状
- **Skill 匹配**: `workflowBuilderSkill.ts` 只检测"创建 workflow"意图
- **没有"更新 draft"检测**: 用户说"CMF图不要英文"不会路由到 update_draft
- **Adapter 映射**: `legacyToolAdapter.ts` 已有 `create_draft`/`update_draft` 映射（行46-47）
- **上游缺失**: 没有 skill 生成 `workflow.create_draft` 或 `workflow.update_draft` command

### 3. Active Draft 状态
- **当前状态**: 无任何 draft 状态管理 ❌
- **需要**: `activeWorkflowDraftId` + `activeWorkflowDraft` in App.tsx state

### 4. Smoke Test 框架
- **文件**: `appAgentSmoke.test.ts` 导出 `runAppAgentSmokeTests()` 函数
- **Tests A-F**: 已完整实现（行405-514）
- **问题**: 不是标准 vitest 测试，需要手动调用

---

## 实施方案

### Phase 1: Runtime Handler（P0，必须先做）

#### 1.1 添加 App.tsx state
```typescript
// 在 App.tsx 顶部 state 区域添加
const [activeWorkflowDraft, setActiveWorkflowDraft] = useState<WorkflowRecipeDraft | null>(null);
const [activeWorkflowDraftId, setActiveWorkflowDraftId] = useState<string | null>(null);
```

#### 1.2 添加 `canvas_create_workflow_draft` handler
**位置**: `App.tsx` 行23963后（在 `canvas_create_workflow` 之前）

```typescript
if (name === 'canvas_create_workflow_draft') {
  const workflowDraft = args.workflowDraft as WorkflowRecipeDraft;
  const languagePolicy = args.languagePolicy || workflowDraft?.languagePolicy;
  
  const draftId = 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  const draft: WorkflowRecipeDraft = {
    ...workflowDraft,
    id: draftId,
    languagePolicy: languagePolicy || workflowDraft.languagePolicy,
    metadata: {
      ...workflowDraft.metadata,
      createdAt: Date.now(),
      editable: true,
    },
  };
  
  setActiveWorkflowDraft(draft);
  setActiveWorkflowDraftId(draftId);
  
  // 可选：在画布上显示 draft 预览节点
  showToast(`工作流草稿已创建：${draft.name}`);
  
  return {
    draftId,
    workflowDraft: draft,
    createdAt: draft.metadata.createdAt,
    outputCount: draft.outputs.length,
    languagePolicy: draft.languagePolicy,
  };
}
```

#### 1.3 添加 `canvas_update_workflow_draft` handler
**位置**: 紧接着 `canvas_create_workflow_draft` handler 之后

```typescript
if (name === 'canvas_update_workflow_draft') {
  const action = String(args.action || '');
  
  if (!activeWorkflowDraft || !activeWorkflowDraftId) {
    throw new Error('没有激活的工作流草稿可更新。请先创建草稿。');
  }
  
  let updatedDraft = { ...activeWorkflowDraft };
  
  if (action === 'add_output') {
    const outputSpec = args.outputSpec as WorkflowOutputSpec;
    updatedDraft.outputs = [...updatedDraft.outputs, outputSpec];
  } else if (action === 'remove_output') {
    const outputId = String(args.outputId || '');
    updatedDraft.outputs = updatedDraft.outputs.map(o =>
      o.id === outputId ? { ...o, enabled: false } : o
    );
  } else if (action === 'update_output_prompt') {
    const outputId = String(args.outputId || '');
    const outputSpec = args.outputSpec as Partial<WorkflowOutputSpec>;
    updatedDraft.outputs = updatedDraft.outputs.map(o =>
      o.id === outputId ? { ...o, ...outputSpec } : o
    );
  } else if (action === 'set_language') {
    const languagePolicy = args.languagePolicy as WorkflowTextPolicy;
    updatedDraft.languagePolicy = languagePolicy;
  } else if (action === 'toggle_strategy') {
    const strategyEnabled = args.strategyEnabled === true;
    updatedDraft.strategy = {
      ...updatedDraft.strategy,
      enabled: strategyEnabled,
      mode: strategyEnabled ? 'enabled' : 'disabled',
    };
  } else if (action === 'save_draft_as_workflow') {
    // 转换为 workflowDefinition 并调用 canvas_create_workflow
    const selectedImageNodeIds = getSelectedCanvasAiInputIds();
    const originalRequest = updatedDraft.metadata.originalRequest || '';
    const definition = convertWorkflowDraftToDefinition(
      updatedDraft,
      selectedImageNodeIds,
      originalRequest,
      'workflow_module'
    );
    
    return await executeTool('canvas_create_workflow', {
      workflowDefinition: definition,
      autoRun: args.autoRun === true,
    }, execution);
  }
  
  setActiveWorkflowDraft(updatedDraft);
  
  showToast(`工作流草稿已更新：${action}`);
  
  return {
    draftId: activeWorkflowDraftId,
    workflowDraft: updatedDraft,
    action,
    updatedAt: Date.now(),
  };
}
```

---

### Phase 2: Intent Routing（P0）

#### 2.1 创建 `workflowDraftUpdateSkill.ts`
**位置**: `src/features/appAgent/skills/workflowDraftUpdateSkill.ts`

```typescript
import type { AppAgentSkill, ContextScope } from './types';
import { createSkillMatch, noSkillMatch } from './types';
import { normalizeSkillText } from './skillUtils';

const UPDATE_DRAFT_PATTERNS = [
  /CMF.*不要英文|CMF.*中文|CMF.*改成.*中文/i,
  /不要.*氛围图|删除.*氛围图|去掉.*氛围图/i,
  /加.*爆炸图|增加.*爆炸图|添加.*爆炸结构图/i,
  /不要文字节点|不要分析|直接出图/i,
  /改成.*比例|改成.*宽高比|所有图.*\d+:\d+/i,
  /保存.*工作流|保存这个.*流程|保存草稿/i,
];

export function parseWorkflowDraftUpdateIntent(userText: string): {
  isUpdateIntent: boolean;
  action: 'add_output' | 'remove_output' | 'update_output_prompt' | 'set_language' | 'toggle_strategy' | 'save_draft_as_workflow' | null;
  targetOutputId?: string;
  reasons: string[];
} {
  const text = normalizeSkillText(userText);
  const reasons: string[] = [];
  let action: any = null;
  let targetOutputId: string | undefined;
  
  if (/CMF.*不要英文|CMF.*中文标注/.test(text)) {
    action = 'update_output_prompt';
    targetOutputId = 'cmf_board';
    reasons.push('update CMF to Chinese');
  }
  
  if (/不要.*高级氛围图|删除.*premium.*mood/.test(text)) {
    action = 'remove_output';
    targetOutputId = 'premium_mood';
    reasons.push('remove premium_mood output');
  }
  
  if (/加.*爆炸图|exploded.*view/.test(text)) {
    action = 'add_output';
    targetOutputId = 'exploded_view';
    reasons.push('add exploded_view output');
  }
  
  if (/不要文字节点|不要分析|直接出图/.test(text)) {
    action = 'toggle_strategy';
    reasons.push('disable strategy step');
  }
  
  if (/保存.*工作流|保存草稿/.test(text)) {
    action = 'save_draft_as_workflow';
    reasons.push('save draft as workflow');
  }
  
  const isUpdateIntent = reasons.length > 0;
  
  return { isUpdateIntent, action, targetOutputId, reasons };
}

export const workflowDraftUpdateSkill: AppAgentSkill = {
  id: 'workflow-draft-update-skill',
  label: 'Workflow Draft Update',
  description: '更新工作流草稿的输出、语言策略或strategy开关。',
  match: input => {
    const intent = parseWorkflowDraftUpdateIntent(input.userText);
    if (intent.isUpdateIntent) {
      return createSkillMatch(0.88, intent.reasons);
    }
    return noSkillMatch();
  },
  getRequiredContext: (): ContextScope[] => ['canvas'],
  buildPromptPatch: () => [
    'Active skill: workflow-draft-update-skill.',
    'User is updating an existing workflow draft.',
    'Use canvas_update_workflow_draft with appropriate action.',
    'Actions: add_output, remove_output, update_output_prompt, set_language, toggle_strategy, save_draft_as_workflow.',
  ].join('\n'),
};
```

#### 2.2 注册新 skill
**修改**: `src/features/appAgent/skills/skillRegistry.ts`

在 `ALL_APP_AGENT_SKILLS` 数组中添加：
```typescript
import { workflowDraftUpdateSkill } from './workflowDraftUpdateSkill';

export const ALL_APP_AGENT_SKILLS: AppAgentSkill[] = [
  // ... existing skills
  workflowBuilderSkill,
  workflowDraftUpdateSkill, // 新增
  // ... other skills
];
```

#### 2.3 修改 kernel 的 deterministic plan 生成
**修改**: `src/features/appAgent/kernel/appAgentKernel.ts`

在 `buildIndustrialReviewWorkflowDefinition` 中添加逻辑：
- 检测到 workflow draft update intent 时
- 生成 `workflow.update_draft` command 而不是 `workflow.create`

---

### Phase 3: Draft→Definition Conversion（P0）

#### 3.1 确保 `convertWorkflowDraftToDefinition` 正确使用 draft
**验证**: `src/features/appAgent/kernel/appAgentKernel.ts` 行196

当前实现已经遍历 `draft.outputs.filter(o => o.enabled)`，逻辑正确 ✅

#### 3.2 确保 `canvas_update_workflow_draft` 的 `save_draft_as_workflow` action 调用正确
见 Phase 1.3 的实现。

---

### Phase 4: 测试（P0）

#### 4.1 让 smoke test 可运行

**方案 A**: 包装成 vitest 测试
**文件**: `src/features/appAgent/appAgentSmoke.test.ts`

在文件末尾添加：
```typescript
import { describe, it, expect } from 'vitest';

describe('App Agent Smoke Tests', () => {
  it('should pass all smoke tests', () => {
    expect(() => runAppAgentSmokeTests()).not.toThrow();
  });
});
```

**方案 B**: 添加 npm script
**文件**: `package.json`

```json
{
  "scripts": {
    "test:smoke": "node -e \"require('./dist/features/appAgent/appAgentSmoke.test.js').runAppAgentSmokeTests()\""
  }
}
```

**推荐**: 方案 A（标准 vitest 集成）

#### 4.2 运行测试
```bash
npm run build
npx vitest run src/features/appAgent/appAgentSmoke.test.ts
```

---

## 实施优先级

### 必须（blocking）
1. ✅ Tool schema 已添加（`canvasAgentTools.ts`）
2. ❌ App.tsx handler（Phase 1.1-1.3）
3. ❌ Active draft state（Phase 1.1）
4. ❌ Smoke test 包装（Phase 4.1）

### 重要（high priority）
5. ❌ Intent routing skill（Phase 2.1-2.2）
6. ❌ Kernel deterministic plan 集成（Phase 2.3）

### 可选（nice to have）
7. ⚠️ UI 显示 draft（暂时可通过 toast/metadata）
8. ⚠️ Draft 持久化（暂时内存即可）

---

## 接线检查清单

- [x] `canvas_create_workflow_draft` 在 tool schema
- [x] `canvas_update_workflow_draft` 在 tool schema
- [x] `canvas_create_workflow_draft` 在 legacy adapter
- [x] `canvas_update_workflow_draft` 在 legacy adapter
- [ ] `canvas_create_workflow_draft` 在 App.tsx executeTool
- [ ] `canvas_update_workflow_draft` 在 App.tsx executeTool
- [ ] Active draft state 在 App.tsx
- [ ] Intent routing skill 注册
- [ ] Smoke tests 可运行
- [ ] `npm run build` 通过
- [ ] Tests A-F 验证通过

---

## 风险和限制

### 风险
1. **State 持久化**: 当前方案 active draft 只在内存中，刷新页面会丢失
2. **多 draft 支持**: 当前只支持一个 active draft
3. **UI 集成**: 暂时没有完整的 draft 编辑 UI

### 缓解措施
1. Phase 1 先实现基本功能，后续可扩展为 localStorage/IndexedDB 持久化
2. 单 draft 足够 MVP，后续可扩展为 draft list
3. 先通过 toast 和 metadata 显示信息，后续可添加专门的 draft panel

---

## 估算

- Phase 1: 200-300 行代码，30-45分钟
- Phase 2: 150-200 行代码，30分钟
- Phase 3: 验证，10分钟
- Phase 4: 测试包装，15分钟

**总计**: ~90-100分钟实施 + 测试

---

## 下一步

1. 退出 plan mode，获得用户批准
2. 按 Phase 1 → Phase 2 → Phase 3 → Phase 4 顺序实施
3. 每个 phase 完成后运行 `npm run build` 验证
4. 最后运行完整 smoke tests 并生成接线报告
