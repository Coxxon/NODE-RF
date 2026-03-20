# AI Architecture Guide - NODE RF

This document defines the structural rules and module boundaries for the **NODE RF** project. Before making any changes, read this to ensure the "Zero DOM" philosophy and modular isolation are maintained.

## 1. Core Philosophy (Golden Rules)
- **Zero DOM in Controllers**: High-level modules (e.g., `assignments.js`) must NOT manipulate the DOM directly. They orchestrate logic and delegate rendering to `LayoutEngine` or dedicated `UI Managers`.
- **Dependency Inversion (Callbacks)**: UI Managers (Layout, Popups, Tabs) must remain logic-agnostic. Inject logic (saving, creating, deleting) via a `callbacks` object to prevent circular dependencies.
- **Granular Modularity**: One file = One responsibility. If a function grows beyond 50 lines or starts handling a different domain (e.g., a "save" function doing "DOM cleanup"), extract it.
- **Shared Constants & Utilities**: Shared data (`EVENT_PALETTE`, `RF_ZONES`) and utilities (`generateUID`) must live in `src/core/Constants.js` or `src/core/RFUtils.js`. Do NOT import from `assignments.js` into core modules.

---

## 2. Module Mapping

### `src/root`
- `main.js`: **Entry Point**. Bootstraps global UI, navigation. Coordination between major features (WWB/CSV Import, File Menu).
- `assignments.js`: **Assignment Tracker Controller**. Orchestrates view state and page/event life cycles. Delegates all rendering to the UI layer.
- `preload.cjs`: **IPC Bridge**. Exposes secure Electron APIs (e.g., `window.electronFS.getPathForFile`) to the renderer.

### `src/core/` (Logic & Data)
- `Store.js`: **Persistence Layer**. Direct interface with `localStorage`. Stores the global state tree (pages, events, templates).
- `StateProvider.js`: **Reactive State**. Holds memory-only shared state (e.g., `sharedState.isEditMode`).
- `EventHub.js`: **Pub/Sub Broker**. Facilitates cross-module triggers (e.g., `requestRender`) without direct imports.
- `ConflictManager.js`: **Calculation Engine**. Pure logic for RF and Time overlaps.
- `Constants.js` & `RFUtils.js`: **Shared Assets**. The "safe" imports that never cause circular loops.

### `src/ui/` (Presentation)
- `LayoutEngine.js`: **The Renderer**. Takes page data and a `callbacks` bridge to build the Event/Block DOM hierarchy.
- `TabManager.js`: **Navigation UI**. Handles rendering and management of page tabs.
- `PopupManager.js`: **Overlay Engine**. Manages context menus, pickers, and toasts.
- `blocks/`:
  - `BlockFactory.js`: Standard block container (Header, Resizers, Controls).
  - `variants/`: Individual implementations for `Assignment`, `Note`, `Checklist`, `Contact`, `Header`, and **`FileBlock`**.

---

## 3. Special Feature Rules (V1.1+)

### **Local File Handling (File Block)**
1. **Native Path Access**: In Electron (with `contextIsolation`), never use `file.path`. Use `window.electronFS.getPathForFile(file)` (official `webUtils` API) exposed via `preload.cjs`.
2. **Absolute Persistence**: Only absolute file paths (e.g., `C:/...`) are persisted in the Store. **NEVER** save `blob:` URLs as they expire after the session.
3. **Protocols**: Local media/PDFs use the `file://` protocol. (Note: Future versions may switch to `media://` for enhanced security).
4. **Lazy Loading Previews**: PDF and Image previews must be destroyed from the DOM when collapsed (DOM-level cleanup, not just CSS hiding) to preserve Electron RAM.
5. **PDF Integration**: Native Chromium PDF viewer is used. Always add `#toolbar=0&view=FitH` to the URL for a clean, integrated look.

---

## 4. Intervention Guide (Workflow Rules)

| Task | Where to go | Method |
| :--- | :--- | :--- |
| **Add a button to a block** | `src/ui/blocks/variants/` | Modify the `build[Type]Body` function. |
| **Change how conflicts look** | `src/ui/LayoutEngine.js` | Update `buildAssignmentRow` or CSS. |
| **Add a new RF calculation** | `src/core/ConflictManager.js` | Update `checkConflicts` logic. |
| **Change data schema** | `src/core/Store.js` | Update `migrate()` and accessor functions. |
| **New Right-Click option** | `src/ui/PopupManager.js` | Update `openEventContextMenu`. |
| **Add a shortcut or global handler** | `src/main.js` | Add an event listener to the gateway. |
| **Update IPC/Electron logic** | `preload.cjs` | Expose new `webUtils` or `ipcRenderer` functions. |

---

## 5. Circular Dependency Prevention (CRITICAL)
If `Module A` needs `Module B` and vice-versa:
1. **Move shared code** to `src/core/Constants.js` or `src/core/RFUtils.js`.
2. **Move common logic** to `Store.js`.
3. **Use the EventHub** to trigger actions instead of importing the controller.
4. **Pass function references** as parameters (callbacks) instead of importing them.
