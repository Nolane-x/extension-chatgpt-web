# Task Orchestrator Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm core task orchestration cho nhiều tab ChatGPT với lease độc quyền, worker selection, resumable checkpoints, recovery recommendation, artifact provenance và persistence local-first.

**Architecture:** Core là pure-domain trước, không phụ thuộc Chrome API. Persistence adapter IndexedDB nằm riêng dưới `src/orchestrator/`. Session runtime hiện tại chỉ được đọc qua public session snapshots ở integration wave sau. Mọi behavior mới đi TDD trước khi nối vào runtime.

**Tech Stack:** JavaScript ES modules, Node 20 test runner, Chrome MV3 IndexedDB ở runtime, GitHub CI hiện có.

**Spec:** `docs/superpowers/specs/2026-08-22-task-orchestrator-core-design.md`

## Global Constraints

- Chrome 120+ / Manifest V3.
- Không cloud backend.
- Không hidden chain-of-thought.
- Không bypass usage limits.
- Lease TTL clamp 5 giây–10 phút.
- Human takeover explicit mới được revoke lease agent.
- Fail-closed với DOM_DRIFT/lease conflict/worker detached.
- Mọi task hoàn thành phải test rồi push `main`.

---

### Task 1: Task + Worker Domain

**Files:**
- Create: `src/orchestrator/domain.js`
- Test: `tests/orchestrator-domain.test.js`

**Interfaces:**
- Produces: `createTask(input, now)`, `updateTask(task, patch, now)`, `createWorkerBinding(input, now)`, `detachWorker(worker, now)`.

- [ ] **Step 1: Write failing tests** cho task normalization, invalid status và worker detach idempotency.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, updateTask, createWorkerBinding, detachWorker } from '../src/orchestrator/domain.js';

test('createTask clamps text and initializes ACTIVE task',()=>{
  const task=createTask({title:'  A  ',goal:' G '},1000);
  assert.equal(task.status,'ACTIVE');
  assert.equal(task.title,'A');
  assert.equal(task.goal,'G');
  assert.equal(task.createdAt,1000);
});

test('updateTask rejects unknown status',()=>{
  const task=createTask({title:'A',goal:'G'},1);
  assert.throws(()=>updateTask(task,{status:'BOGUS'},2),/INVALID_TASK_STATE/);
});

test('detachWorker is idempotent',()=>{
  const worker=createWorkerBinding({taskId:'t1',tabId:7,role:'research'},1);
  const first=detachWorker(worker,9),second=detachWorker(first,12);
  assert.equal(first.detachedAt,9);
  assert.equal(second.detachedAt,9);
});
```

- [ ] **Step 2: Verify RED** — `node --test tests/orchestrator-domain.test.js` phải fail vì module chưa tồn tại.
- [ ] **Step 3: Implement minimal domain functions** với IDs `crypto.randomUUID()`, text clamp, stable status validation, detached worker preserving original timestamp.
- [ ] **Step 4: Verify GREEN** — test file pass.
- [ ] **Step 5: Run full `npm test`**.
- [ ] **Step 6: Commit/push** `feat: add orchestrator task and worker domain`.

---

### Task 2: Lease Engine

**Files:**
- Create: `src/orchestrator/leases.js`
- Test: `tests/orchestrator-leases.test.js`

**Interfaces:**
- Produces: `acquireLease(state,input,now)`, `heartbeatLease(state,input,now)`, `releaseLease(state,input,now)`, `assertWorkerLease(state,input,now)`, `isLeaseValid(lease,now)`.

- [ ] **Step 1: Write failing tests** cho exclusivity, expiry, stale heartbeat, same-owner extension, human takeover và agent takeover denial.

```js
const state={leases:[]};
const a=acquireLease(state,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:5000},1000);
assert.throws(()=>acquireLease(state,{workerId:'w1',ownerId:'agent-b',ownerType:'agent',ttlMs:5000},1200),/LEASE_CONFLICT/);
assert.doesNotThrow(()=>assertWorkerLease(state,{workerId:'w1',leaseId:a.id,ownerId:'agent-a'},2000));
assert.throws(()=>assertWorkerLease(state,{workerId:'w1',leaseId:a.id,ownerId:'agent-a'},7000),/LEASE_EXPIRED/);
```

- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement lease state mutations** với TTL clamp `[5000,600000]`, no resurrection after revoke/expiry và explicit human takeover.
- [ ] **Step 4: Verify GREEN**.
- [ ] **Step 5: Full tests**.
- [ ] **Step 6: Commit/push** `feat: add exclusive worker lease engine`.

---

### Task 3: Worker Selection + Recovery Policy

**Files:**
- Create: `src/orchestrator/selection.js`
- Create: `src/orchestrator/recovery.js`
- Test: `tests/orchestrator-selection.test.js`
- Test: `tests/orchestrator-recovery.test.js`

**Interfaces:**
- Produces: `selectWorker(task,workers,sessionIndex,input,now)` and `recommendWorkerRecovery(worker,session,policy,now)`.

- [ ] **Step 1: Write RED tests** cho deterministic scoring: IDLE > COMPLETED > WAITING_USER; exclude busy/deep-thinking/DOM_DRIFT/detached/lease-conflict; tie-break `attachedAt` rồi `id`.
- [ ] **Step 2: Verify selection RED**.
- [ ] **Step 3: Implement selection** trả `{worker,score,reasons}` hoặc throw `NO_ELIGIBLE_WORKER`.
- [ ] **Step 4: Verify selection GREEN**.
- [ ] **Step 5: Write RED recovery tests** mapping `DEEP_THINKING→WAIT`, `CONNECTION_LOST→RETRY`, `CONVERSATION_LIMIT→HANDOFF`, missing tab→REPLACE, `DOM_DRIFT→HUMAN_REVIEW`.
- [ ] **Step 6: Implement recovery recommendation** trả `{action,reason,confidence,notBefore}`.
- [ ] **Step 7: Run both test files + full `npm test`**.
- [ ] **Step 8: Commit/push** `feat: add orchestrator worker selection and recovery policy`.

---

### Task 4: Checkpoints + Artifact Provenance

**Files:**
- Create: `src/orchestrator/checkpoints.js`
- Create: `src/orchestrator/artifacts.js`
- Test: `tests/orchestrator-checkpoints.test.js`
- Test: `tests/orchestrator-artifacts.test.js`

**Interfaces:**
- Produces: `createCheckpoint(task,input,now)`, `mergeTaskArtifacts(existing,incoming)`.

- [ ] **Step 1: Write RED checkpoint tests** cho parent/head chaining, HANDOFF metadata và append-only semantics.
- [ ] **Step 2: Implement checkpoints** trả `{task,checkpoint}` với task clone trỏ `headCheckpointId` mới.
- [ ] **Step 3: Write RED artifact tests** dedupe `(workerId,sessionArtifactId)`, preserve provenance, update download fields without losing original detection metadata.
- [ ] **Step 4: Implement artifact merge** deterministic sort by `detectedAt` rồi `id`.
- [ ] **Step 5: Run targeted + full tests**.
- [ ] **Step 6: Commit/push** `feat: add resumable checkpoints and task artifact provenance`.

---

### Task 5: Orchestrator IndexedDB Store

**Files:**
- Create: `src/orchestrator/store.js`
- Create: `src/orchestrator/store-codec.js`
- Test: `tests/orchestrator-store-codec.test.js`
- Modify: `scripts/verify-extension.mjs`

**Interfaces:**
- Produces: `openOrchestratorStore()`, `loadOrchestratorSnapshot()`, `saveTask()`, `saveWorker()`, `saveLease()`, `saveCheckpoint()`, `saveArtifacts()`.

- [ ] **Step 1: Write RED codec tests** cho serialize/restore snapshot không mất task graph, revoked/expired lease data và artifact provenance.
- [ ] **Step 2: Implement pure `store-codec.js`** để normalization có thể test trong Node không cần browser IDB.
- [ ] **Step 3: Verify codec GREEN**.
- [ ] **Step 4: Implement IndexedDB adapter** database `nolane-sentinel-orchestrator-v1`, version 1, stores/indexes đúng spec.
- [ ] **Step 5: Update verifier** yêu cầu 6 orchestrator modules + syntax/import integrity.
- [ ] **Step 6: Run `npm test && npm run verify && npm run package`**.
- [ ] **Step 7: Verify `dist/SHA256SUMS.txt`** bằng `sha256sum -c` trên CI/Linux path; local environment nếu hỗ trợ.
- [ ] **Step 8: Commit/push** `feat: persist Task Orchestrator core graph`.

---

### Task 6: Core Public Facade + Documentation

**Files:**
- Create: `src/orchestrator/index.js`
- Create: `docs/task-orchestrator.md`
- Modify: `CHANGELOG.md`
- Test: `tests/orchestrator-public-api.test.js`

**Interfaces:**
- Produces stable imports cho wave MCP/UI tiếp theo.

- [ ] **Step 1: Write RED public API test** kiểm facade export đúng các function trong spec.
- [ ] **Step 2: Implement facade** chỉ re-export public contracts, không export internal helpers.
- [ ] **Step 3: Add Vietnamese docs** mô tả task/worker/lease/checkpoint/recovery/artifact và giới hạn security.
- [ ] **Step 4: Update changelog** dưới `Unreleased`/next wave section, không bump release version trong core task này.
- [ ] **Step 5: Run full `npm test`, `npm run verify`, `npm run package`**.
- [ ] **Step 6: Wait for GitHub `verification/latest.json`** trỏ đúng commit cuối và bốn gate PASS.
- [ ] **Step 7: Commit/push** `docs: expose Task Orchestrator core contracts`.

## Self-review

- Spec coverage: task/worker, lease, selection, checkpoint, recovery, artifact provenance, persistence, public facade đều có task riêng.
- Placeholder scan: không có TBD/TODO.
- Type consistency: `workerId`, `taskId`, `leaseId`, `ownerId`, `headCheckpointId`, `sessionArtifactId` dùng nhất quán xuyên suốt.
- Integration MCP/UI được cố ý để wave sau; core plan không phụ thuộc chúng.
