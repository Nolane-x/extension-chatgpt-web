# Task Control Plane + MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Task Orchestrator as a guarded control plane and 16 new MCP tools without weakening existing session/action safety.

**Architecture:** `src/orchestrator/service.js` is a testable dependency-injected service. `src/background/orchestrator-runtime.js` adapts real sessions/actions/store. `control-plane.js` routes task commands; `protocol.js` and Native Bridge expose them to agents.

**Tech Stack:** ES modules, Node 20 tests, Chrome MV3, IndexedDB, Native Messaging/MCP 2026-07-28.

**Spec:** `docs/superpowers/specs/2026-08-22-task-control-plane-mcp-design.md`

## Global Constraints

- 16 new task MCP tools; total expected 39.
- New task scopes default OFF.
- Task send/queue require `send` scope plus valid lease.
- Human takeover is not exposed through MCP.
- DOM_DRIFT remains fail-closed.
- Every completed task is tested then pushed `main`.

---

### Task 1: Protocol + Native Bridge parity

**Files:**
- Modify: `src/core/protocol.js`
- Modify: `native-host/nolane_bridge.mjs`
- Modify: `tests/automation-protocol.test.js`
- Modify: `tests/native-host.test.js`

**Produces:** 39-tool MCP protocol and task scopes.

- [ ] Write failing tests for `task_read`, `task_write`, `task_lease`, task action aliases and all 16 task tools.
- [ ] Verify RED with targeted protocol tests.
- [ ] Add scopes/action mappings/tool schemas in extension protocol.
- [ ] Add matching native-host tools/toolAction mappings.
- [ ] Verify GREEN and parity count 39.
- [ ] Run full tests, push.

---

### Task 2: Dependency-injected Orchestrator Service

**Files:**
- Create: `src/orchestrator/service.js`
- Test: `tests/orchestrator-service.test.js`
- Modify: `src/orchestrator/index.js`

**Adapter contract:**

```js
createOrchestratorService({
  store,
  getSession(tabId),
  send(tabId,text),
  queueSend(tabId,text,params),
  waitUntil(tabId,states,timeoutMs),
  broadcast(event)
})
```

**Produces:** `initialize`, task CRUD, bind/detach, lease lifecycle, acquireBestWorker, taskSend, taskQueueSend, taskWait, checkpoint, listArtifacts, recoveryPlan, syncSession.

- [ ] RED tests: hydrate, create/bind, lease guard, best-worker acquire, invalid lease send rejection, wait delegation, session/artifact sync, recovery ordering.
- [ ] Implement minimal service using Task Orchestrator Core + injected adapters.
- [ ] GREEN targeted + full tests.
- [ ] Push.

---

### Task 3: Chrome Background Adapter + Control Plane

**Files:**
- Create: `src/background/orchestrator-runtime.js`
- Modify: `src/background/control-plane.js`
- Modify: `src/background/lifecycle.js`
- Modify: `src/background/session-runtime.js`

**Produces:** real Task Store hydrate, real action delegation and `task.*` command routing.

- [ ] Add background adapter instantiating service with IndexedDB store, sessions, `doSend`, `queueSend`, existing `waitUntil` delegation and `broadcast`.
- [ ] Initialize before tab discovery.
- [ ] Sync orchestrator on state changes/session pulses and artifact/download changes.
- [ ] Route all task actions in control plane.
- [ ] Ensure agent request audit still wraps task actions.
- [ ] Run full tests/static verify and push.

---

### Task 4: Verification + Docs

**Files:**
- Modify: `scripts/verify-extension.mjs`
- Modify: `docs/protocol.md`
- Create: `docs/task-control-plane.md`
- Modify: `CHANGELOG.md`

- [ ] Verifier requires 39 MCP tools, orchestrator service/background adapter/task scopes.
- [ ] Vietnamese protocol docs list task tools and lease requirements.
- [ ] Full `npm test`, `npm run verify`, deterministic package/checksum through GitHub CI.
- [ ] Wait `verification/latest.json` for exact final source commit.
- [ ] Push all docs/verification updates.

## Self-review

- Scope parity: 16 new tools, 3 new task scopes.
- Safety: lease guard is separate from capability scope.
- Human takeover remains UI-only.
- Integration uses existing session state and does not re-parse ChatGPT DOM.
- NUI Mission Control intentionally remains wave 3.
