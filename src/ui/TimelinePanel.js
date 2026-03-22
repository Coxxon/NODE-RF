/**
 * TimelinePanel.js — Vertical timeline panel (Phase 2)
 * Right-sliding panel showing events on a time axis.
 */
import { Store } from '../core/Store.js';
import { EventHub } from '../core/EventHub.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const PX_PER_MIN  = 1.5;        // 90px per hour
const RANGE_START = 6 * 60;     // 6h00 in minutes
const RANGE_END   = 24 * 60;    // 24h00 in minutes
const SNAP_MIN    = 5;           // snap to 5-minute intervals
const TOTAL_H     = (RANGE_END - RANGE_START) * PX_PER_MIN;

// ── Pure helpers ───────────────────────────────────────────────────────────────
function parseTime(str) {
  if (!str) return null;
  const parts = str.split('h');
  const h = parseInt(parts[0] ?? '0');
  const m = parseInt(parts[1] ?? '0');
  return isNaN(h) ? null : h * 60 + (isNaN(m) ? 0 : m);
}

function formatTime(totalMin) {
  const c = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMin)));
  return `${Math.floor(c / 60)}h${(c % 60).toString().padStart(2, '0')}`;
}

function snap(min) { return Math.round(min / SNAP_MIN) * SNAP_MIN; }

function timeToY(min) { return (min - RANGE_START) * PX_PER_MIN; }

function formatDateDisplay(dateStr) {
  if (!dateStr) return 'Date not set';
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ── Module-level state ────────────────────────────────────────────────────────
let _panel      = null;
let _canvasEl   = null;
let _isOpen     = false;
let _dragState  = null;   // { type, evt?, child?, startY, origStart, origEnd, origDuration }
let _blockRefs  = {};     // evtId → .tl-event-block DOM element
let _nowTimer   = null;
let _onSave     = null;
let _onRender   = null;

// ── Public API ────────────────────────────────────────────────────────────────
export const TimelinePanel = {

  init(onSave, onRender) {
    _onSave   = onSave;
    _onRender = onRender;

    // Create the fixed panel
    _panel = document.createElement('div');
    _panel.id = 'timelinePanel';
    _panel.className = 'timeline-panel';
    document.body.appendChild(_panel);

    // Inject toggle button in the right toolbar section, just before the expand/collapse button
    const rightSection = document.querySelector('.toolbar-section.right-align');
    if (rightSection) {
      const btn = document.createElement('button');
      btn.id = 'btnToggleTimeline';
      btn.className = 'btn outline icon-only';
      btn.title = 'Toggle Timeline';
      // Show immediately if we're already on a page (init runs after switchView)
      btn.style.display = Store.getCurrentPageId() ? 'flex' : 'none';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
      btn.addEventListener('click', () => this.toggle());
      // Place just before the lock button so they are adjacent
      const lockBtn = rightSection.querySelector('#btnGlobalLock');
      if (lockBtn) {
        rightSection.insertBefore(btn, lockBtn);
      } else {
        rightSection.appendChild(btn);
      }
    }

    // Global drag listeners (mouse, since we're avoiding HTML5 drag here)
    document.addEventListener('mousemove', (e) => this._onMouseMove(e));
    document.addEventListener('mouseup', ()  => this._onMouseUp());

    // Re-render timeline on any schedule change (times, names, events created/deleted)
    // renderPageCanvas() in assignments.js emits 'scheduleChanged' after every canvas render,
    // so this single listener keeps the timeline always in sync.
    EventHub.on('scheduleChanged', () => {
      if (_isOpen) {
        this.render();
        requestAnimationFrame(() => this._updateCanvasPadding());
      }
    });
  },

  toggle() { _isOpen ? this.close() : this.open(); },

  open() {
    _isOpen = true;
    _panel.classList.add('open');
    document.getElementById('btnToggleTimeline')?.classList.add('active');
    this.render();
    this._startNowTimer();
    requestAnimationFrame(() => this._updateCanvasPadding());
  },

  close() {
    _isOpen = false;
    _panel.classList.remove('open');
    document.getElementById('assignmentView')?.classList.remove('has-timeline');
    document.getElementById('btnToggleTimeline')?.classList.remove('active');
    this._stopNowTimer();
  },

  render() {
    if (!_isOpen) return;
    _blockRefs = {};

    const pageId = Store.getCurrentPageId();
    if (!pageId) {
      _panel.innerHTML = '<div class="tl-empty">No page selected.</div>';
      return;
    }

    const page   = Store.getPages().find(p => p.id === pageId);
    const events = Store.getEvents(pageId);

    _panel.innerHTML = '';
    _panel.appendChild(this._buildHeader(page));

    // Scroll area + inner canvas
    const scrollArea = document.createElement('div');
    scrollArea.className = 'tl-scroll-area';

    _canvasEl = document.createElement('div');
    _canvasEl.className = 'tl-canvas';
    _canvasEl.style.height = TOTAL_H + 'px';

    // Allow unscheduled events to be dropped onto the canvas to assign a time
    _canvasEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    _canvasEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const evtId = e.dataTransfer.getData('text/tl-unsched');
      if (!evtId) return;
      const pid = Store.getCurrentPageId();
      const evt = (Store.getEvents(pid) || []).find(ev => ev.id === evtId);
      if (!evt) return;
      // Convert drop Y → time (getBoundingClientRect already accounts for scroll)
      const rect = _canvasEl.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const minutes = snap(Math.max(RANGE_START, Math.min(RANGE_END - 60, y / PX_PER_MIN + RANGE_START)));
      evt.startTime = formatTime(minutes);
      evt.endTime   = formatTime(minutes + 60); // 1h default
      if (_onSave)   _onSave();
      if (_onRender) _onRender();
      this.render();
    });

    // Hour lines + labels
    for (let h = RANGE_START / 60; h <= RANGE_END / 60; h++) {
      const y = timeToY(h * 60);
      const line = document.createElement('div');
      line.className = 'tl-hour-line';
      line.style.top = y + 'px';
      _canvasEl.appendChild(line);

      if (h < RANGE_END / 60) {
        const lbl = document.createElement('div');
        lbl.className = 'tl-hour-label';
        lbl.style.top = (y - 8) + 'px';
        lbl.textContent = `${h}h`;
        _canvasEl.appendChild(lbl);
      }
    }

    // Event blocks
    const scheduled = events.filter(evt => {
      const s = parseTime(evt.startTime), e = parseTime(evt.endTime);
      return s !== null && e !== null && e > s;
    });
    const { laneMap, totalMap } = this._computeLanes(scheduled);
    scheduled.forEach(evt => {
      const lane  = laneMap.get(evt.id)  ?? 0;
      const total = totalMap.get(evt.id) ?? 1;
      const block = this._buildEventBlock(evt, lane, total);
      if (block) {
        _canvasEl.appendChild(block);
        _blockRefs[evt.id] = block;
      }
    });

    // "Now" marker (positioned later)
    const nowMarker = document.createElement('div');
    nowMarker.id = 'tlNowMarker';
    nowMarker.className = 'tl-now-marker';
    nowMarker.style.display = 'none';
    _canvasEl.appendChild(nowMarker);

    scrollArea.appendChild(_canvasEl);
    _panel.appendChild(scrollArea);

    // Unscheduled zone
    const unscheduled = events.filter(evt => {
      const s = parseTime(evt.startTime), e = parseTime(evt.endTime);
      return s === null || e === null || e <= s;
    });
    if (unscheduled.length > 0) {
      _panel.appendChild(this._buildUnscheduled(unscheduled));
    }

    this._positionNowMarker(page);
  },

  // ── Header ──────────────────────────────────────────────────────────────────

  _buildHeader(page) {
    const header = document.createElement('div');
    header.className = 'tl-header';

    const icon = document.createElement('span');
    icon.className = 'tl-header-icon';
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    const dateDisplay = document.createElement('span');
    dateDisplay.className = 'tl-date-display tl-date-clickable';
    dateDisplay.title = 'Click to set date';
    dateDisplay.textContent = formatDateDisplay(page?.date);

    // Hidden native date input (triggered by clicking the date text)
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'tl-date-input';
    if (page?.date) dateInput.value = page.date;
    dateInput.addEventListener('change', () => {
      if (page) {
        page.date = dateInput.value || null;
        dateDisplay.textContent = formatDateDisplay(page.date);
        if (_onSave) _onSave();
        this._positionNowMarker(page);
      }
    });

    // Clicking the date text opens the native date picker
    dateDisplay.addEventListener('click', () => {
      try { dateInput.showPicker(); } catch { dateInput.click(); }
    });

    header.append(icon, dateDisplay, dateInput);
    return header;
  },

  // ── Event blocks ─────────────────────────────────────────────────────────────

  _buildEventBlock(evt, lane = 0, total = 1) {
    const start = parseTime(evt.startTime);
    const end   = parseTime(evt.endTime);
    if (start === null || end === null || end <= start) return null;

    const block = document.createElement('div');
    block.className = 'tl-event-block';
    const seqs = (evt.blocks || []).filter(b => b.type === 'sequence');
    if (seqs.length > 0) block.classList.add('tl-is-parent');
    block.dataset.tlEvtId = evt.id;
    block.title = evt.name || '';
    block.style.top    = timeToY(start) + 'px';
    block.style.height = (end - start) * PX_PER_MIN + 'px';

    // Lane layout: side-by-side when events overlap
    if (total === 1) {
      block.style.left  = '2px';
      block.style.right = '2px';
    } else {
      const laneW = 100 / total;
      block.style.left  = `calc(${lane * laneW}% + 2px)`;
      block.style.width = `calc(${laneW}% - 4px)`;
      block.style.right = 'auto';
    }

    if (evt.color) {
      block.style.borderColor = evt.color;
      block.style.background  = evt.color + '22';
    }

    // Header label (Fix 4: name visible, times on second line)
    const label = document.createElement('div');
    label.className = 'tl-evt-label';
    const nameEl = document.createElement('span');
    nameEl.className = 'tl-evt-name';
    nameEl.textContent = evt.name || '(Unnamed)';
    const timesEl = document.createElement('span');
    timesEl.className = 'tl-evt-times';
    timesEl.textContent = `${evt.startTime}→${evt.endTime}`;
    label.append(nameEl, timesEl);
    block.appendChild(label);

    // Child segments for parent events (sequences)
    if (seqs.length > 0) {
      block.appendChild(this._buildChildSegs(evt, start, end));
    }

    // Top resize handle
    const topH = document.createElement('div');
    topH.className = 'tl-resize-handle tl-resize-top';
    topH.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      // Read current times at mousedown (not stale build-time values)
      const s = parseTime(evt.startTime), en = parseTime(evt.endTime);
      _dragState = { type: 'resize-top', evt, startY: e.clientY, origStart: s, origEnd: en };
    });
    block.appendChild(topH);

    // Bottom resize handle
    const botH = document.createElement('div');
    botH.className = 'tl-resize-handle tl-resize-bottom';
    botH.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const s = parseTime(evt.startTime), en = parseTime(evt.endTime);
      _dragState = { type: 'resize-bottom', evt, startY: e.clientY, origStart: s, origEnd: en };
    });
    block.appendChild(botH);

    // Move handle (covers the body, behind resize handles)
    const moveH = document.createElement('div');
    moveH.className = 'tl-move-handle';
    moveH.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const s = parseTime(evt.startTime), en = parseTime(evt.endTime);
      _dragState = { type: 'move', evt, startY: e.clientY, origStart: s, origEnd: en };
    });
    block.appendChild(moveH);

    // Click to focus on canvas
    block.addEventListener('click', (e) => {
      if (!e.target.closest('.tl-resize-handle') && !e.target.closest('.tl-child-resize')) {
        this._focusEvent(evt.id);
      }
    });

    return block;
  },

  _buildChildSegs(evt, parentStart, parentEnd) {
    const parentDuration = parentEnd - parentStart;
    const sequences = (evt.blocks || []).filter(b => b.type === 'sequence');
    const totalEst = sequences.reduce((s, c) => s + (c.estimatedDuration || 0), 0);
    if (totalEst === 0) return document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'tl-child-segs';
    // Available height = block height minus label area (24px)
    const availH = parentDuration * PX_PER_MIN - 24;
    let cursor = 0;

    sequences.forEach(child => {
      const ratio  = child.estimatedDuration / totalEst;
      const segH   = Math.max(10, ratio * availH);

      const seg = document.createElement('div');
      seg.className = 'tl-child-seg';
      seg.dataset.tlChildId = child.id;
      seg.style.top    = cursor + 'px';
      seg.style.height = segH + 'px';

      const segLabel = document.createElement('span');
      segLabel.className = 'tl-child-seg-label';
      segLabel.textContent = child.name || '—';
      seg.appendChild(segLabel);

      // Click to focus child on canvas
      seg.addEventListener('click', (e) => {
        e.stopPropagation();
        this._focusChild(evt.id, child.id);
      });

      // Bottom resize → change estimatedDuration
      const resizeH = document.createElement('div');
      resizeH.className = 'tl-child-resize';
      resizeH.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        _dragState = {
          type: 'child-resize', child, evt,
          startY: e.clientY,
          origDuration: child.estimatedDuration
        };
      });
      seg.appendChild(resizeH);
      container.appendChild(seg);
      cursor += segH;
    });

    return container;
  },

  // ── Unscheduled zone ─────────────────────────────────────────────────────────

  _buildUnscheduled(events) {
    const zone = document.createElement('div');
    zone.className = 'tl-unscheduled';

    let expanded = true;
    const header = document.createElement('div');
    header.className = 'tl-unsched-header';
    const list   = document.createElement('div');
    list.className = 'tl-unsched-list';

    const updateHeader = () => {
      header.textContent = `${expanded ? '▾' : '▸'} Unscheduled (${events.length})`;
    };
    updateHeader();

    events.forEach(evt => {
      const item = document.createElement('div');
      item.className = 'tl-unsched-item';
      item.draggable = true;
      item.title = 'Drag onto timeline to schedule';
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/tl-unsched', evt.id);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      const dot = document.createElement('span');
      dot.className = 'tl-unsched-dot';
      if (evt.color) dot.style.background = evt.color;
      const name = document.createElement('span');
      name.textContent = evt.name || '(Unnamed)';
      const hint = document.createElement('span');
      hint.className = 'tl-unsched-drag-hint';
      hint.textContent = '⠿';
      item.append(hint, dot, name);
      item.addEventListener('click', () => this._focusEvent(evt.id));
      list.appendChild(item);
    });

    header.addEventListener('click', () => {
      expanded = !expanded;
      list.style.display = expanded ? '' : 'none';
      updateHeader();
    });

    zone.append(header, list);
    return zone;
  },

  // ── Drag handling ────────────────────────────────────────────────────────────

  _onMouseMove(e) {
    if (!_dragState) return;
    const dy   = e.clientY - _dragState.startY;
    const dmin = snap(dy / PX_PER_MIN);

    if (_dragState.type === 'move') {
      const { evt, origStart, origEnd } = _dragState;
      let ns = origStart + dmin;
      let ne = origEnd   + dmin;
      if (ns < RANGE_START) { ne += RANGE_START - ns; ns = RANGE_START; }
      if (ne > RANGE_END)   { ns -= ne - RANGE_END;   ne = RANGE_END;   }
      evt.startTime = formatTime(snap(ns));
      evt.endTime   = formatTime(snap(ne));
      this._applyBlockPos(evt);
      this._recomputeLanes();

    } else if (_dragState.type === 'resize-top') {
      const { evt, origStart, origEnd } = _dragState;
      const ns = snap(Math.min(origEnd - SNAP_MIN, Math.max(RANGE_START, origStart + dmin)));
      evt.startTime = formatTime(ns);
      this._applyBlockPos(evt);
      this._recomputeLanes();

    } else if (_dragState.type === 'resize-bottom') {
      const { evt, origStart, origEnd } = _dragState;
      const ne = snap(Math.max(origStart + SNAP_MIN, Math.min(RANGE_END, origEnd + dmin)));
      evt.endTime = formatTime(ne);
      this._applyBlockPos(evt);
      this._recomputeLanes();

    } else if (_dragState.type === 'child-resize') {
      const { child, evt } = _dragState;
      child.estimatedDuration = Math.max(SNAP_MIN, snap(_dragState.origDuration + dy / PX_PER_MIN));
      this._applyChildSegs(evt);
    }
  },

  _onMouseUp() {
    if (!_dragState) return;
    _dragState = null;
    if (_onSave)   _onSave();
    if (_onRender) _onRender(); // refresh canvas time inputs
    this.render(); // recalculate lane positions for overlapping events
  },

  // ── Targeted DOM updates (no full re-render during drag) ─────────────────────

  _applyBlockPos(evt) {
    const block = _blockRefs[evt.id];
    if (!block) return;
    const s = parseTime(evt.startTime);
    const e = parseTime(evt.endTime);
    if (s === null || e === null || e <= s) return;
    block.style.top    = timeToY(s) + 'px';
    block.style.height = (e - s) * PX_PER_MIN + 'px';
    const timesEl = block.querySelector('.tl-evt-times');
    if (timesEl) timesEl.textContent = `${evt.startTime}→${evt.endTime}`;
    const nameEl = block.querySelector('.tl-evt-name');
    if (nameEl) nameEl.textContent = evt.name || '(Unnamed)';
    block.title = evt.name || '';
    if ((evt.blocks || []).some(b => b.type === 'sequence')) this._applyChildSegs(evt);
  },

  _applyChildSegs(evt) {
    const block = _blockRefs[evt.id];
    if (!block) return;
    const s = parseTime(evt.startTime);
    const e = parseTime(evt.endTime);
    const parentDuration = (s !== null && e !== null) ? (e - s) : 60;
    const sequences = (evt.blocks || []).filter(b => b.type === 'sequence');
    const totalEst = sequences.reduce((sum, c) => sum + (c.estimatedDuration || 0), 0);
    if (totalEst === 0) return;
    const availH = parentDuration * PX_PER_MIN - 24;
    let cursor = 0;
    sequences.forEach(child => {
      const seg = block.querySelector(`[data-tl-child-id="${child.id}"]`);
      if (!seg) return;
      const ratio = child.estimatedDuration / totalEst;
      const segH  = Math.max(10, ratio * availH);
      seg.style.top    = cursor + 'px';
      seg.style.height = segH + 'px';
      cursor += segH;
    });
  },

  // ── Live lane recalculation during drag (no full re-render) ──────────────────

  _recomputeLanes() {
    const pageId = Store.getCurrentPageId();
    if (!pageId || !_canvasEl) return;
    const events = Store.getEvents(pageId);
    const scheduled = events.filter(evt => {
      const s = parseTime(evt.startTime), e = parseTime(evt.endTime);
      return s !== null && e !== null && e > s;
    });
    const { laneMap, totalMap } = this._computeLanes(scheduled);
    scheduled.forEach(evt => {
      const block = _blockRefs[evt.id];
      if (!block) return;
      const lane  = laneMap.get(evt.id)  ?? 0;
      const total = totalMap.get(evt.id) ?? 1;
      if (total === 1) {
        block.style.left  = '2px';
        block.style.right = '2px';
        block.style.width = '';
      } else {
        const laneW = 100 / total;
        block.style.left  = `calc(${lane * laneW}% + 2px)`;
        block.style.width = `calc(${laneW}% - 4px)`;
        block.style.right = 'auto';
      }
    });
  },

  // ── Focus / highlight ─────────────────────────────────────────────────────────

  _focusEvent(evtId) {
    const el = document.querySelector(`[data-event-id="${evtId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('tl-highlight');
    setTimeout(() => el.classList.remove('tl-highlight'), 1000);
  },

  _focusChild(parentEvtId, childId) {
    const el = document.querySelector(`[data-event-id="${parentEvtId}"] [data-block-id="${childId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('tl-highlight');
    setTimeout(() => el.classList.remove('tl-highlight'), 1000);
  },

  // ── Now marker ────────────────────────────────────────────────────────────────

  _positionNowMarker(page) {
    const marker = document.getElementById('tlNowMarker');
    if (!marker) return;
    const today  = new Date().toISOString().slice(0, 10);
    if (page?.date !== today) { marker.style.display = 'none'; return; }
    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < RANGE_START || nowMin > RANGE_END) { marker.style.display = 'none'; return; }
    marker.style.display = 'block';
    marker.style.top = timeToY(nowMin) + 'px';
    // Auto-scroll to bring marker into view on open
    const scrollArea = marker.closest('.tl-scroll-area');
    if (scrollArea) {
      scrollArea.scrollTop = Math.max(0, timeToY(nowMin) - scrollArea.clientHeight / 3);
    }
  },

  _startNowTimer() {
    this._stopNowTimer();
    _nowTimer = setInterval(() => {
      const pageId = Store.getCurrentPageId();
      const page   = pageId ? Store.getPages().find(p => p.id === pageId) : null;
      this._positionNowMarker(page);
    }, 30_000);
  },

  _stopNowTimer() {
    if (_nowTimer) { clearInterval(_nowTimer); _nowTimer = null; }
  },

  // ── Lane computation (overlap → side-by-side) ─────────────────────────────

  _computeLanes(events) {
    const sorted = [...events].sort((a, b) => (parseTime(a.startTime) ?? 0) - (parseTime(b.startTime) ?? 0));
    const laneEnds = [];
    const laneMap  = new Map();

    sorted.forEach(evt => {
      const s = parseTime(evt.startTime);
      const e = parseTime(evt.endTime);
      let lane = laneEnds.findIndex(end => end <= s);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = e;
      laneMap.set(evt.id, lane);
    });

    // For each event, count the maximum lane occupied by any overlapping event
    const totalMap = new Map();
    sorted.forEach(evt => {
      const s = parseTime(evt.startTime);
      const e = parseTime(evt.endTime);
      let maxLane = laneMap.get(evt.id);
      sorted.forEach(other => {
        if (other.id === evt.id) return;
        const os = parseTime(other.startTime);
        const oe = parseTime(other.endTime);
        if (os < e && oe > s) maxLane = Math.max(maxLane, laneMap.get(other.id));
      });
      totalMap.set(evt.id, maxLane + 1);
    });

    return { laneMap, totalMap };
  },

  // ── Smart canvas padding (Fix 8) ─────────────────────────────────────────

  _updateCanvasPadding() {
    const assignView = document.getElementById('assignmentView');
    if (!assignView) return;
    if (!_isOpen) { assignView.classList.remove('has-timeline'); return; }
    const canvas   = document.getElementById('pageCanvas');
    const panelLeft = window.innerWidth - 260;
    let maxRight = 0;
    if (canvas) {
      canvas.querySelectorAll('.event-block, .btn-split-add').forEach(el => {
        maxRight = Math.max(maxRight, el.getBoundingClientRect().right);
      });
    }
    assignView.classList.toggle('has-timeline', maxRight > panelLeft);
  }
};
