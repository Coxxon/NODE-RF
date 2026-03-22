/**
 * EventInteractions.js — Logic for moving Event blocks
 */
import { Store } from '../../core/Store.js';
import { EventHub } from '../../core/EventHub.js';

let draggedEvt = null;
let lastMouseY = 0;
let lastSwapTime = 0;
const SWAP_COOLDOWN = 80;
const SCROLL_SPEED = 15;
const SCROLL_THRESHOLD = 80;
let scrollInterval = null;
let lastAnchorEl = null;
let lastAnchorPos = null;
let lastCursorInRight = null;
const DRAG_HYSTERESIS = 8;
const COL_HYSTERESIS = 48;

const eventPlaceholder = document.createElement('div');
eventPlaceholder.className = 'event-placeholder';

function startAutoScroll() {
  if (scrollInterval) return;
  scrollInterval = setInterval(() => {
    const y = lastMouseY;
    const tabBar = document.getElementById('viewTabBar');
    const topLimit = tabBar ? tabBar.getBoundingClientRect().bottom : 0;
    
    if (y < topLimit + SCROLL_THRESHOLD) {
      window.scrollBy(0, -SCROLL_SPEED);
    } else if (y > window.innerHeight - SCROLL_THRESHOLD) {
      window.scrollBy(0, SCROLL_SPEED);
    }
  }, 20);
}

function stopAutoScroll() {
  clearInterval(scrollInterval);
  scrollInterval = null;
}

const manualWheel = (e) => {
  window.scrollBy(0, e.deltaY);
};

function resolveColumn(cursorX, canvasMidX) {
  if (lastCursorInRight === null) {
    lastCursorInRight = cursorX > canvasMidX;
  } else if (!lastCursorInRight && cursorX > canvasMidX + COL_HYSTERESIS) {
    lastCursorInRight = true;
  } else if (lastCursorInRight && cursorX < canvasMidX - COL_HYSTERESIS) {
    lastCursorInRight = false;
  }
  return lastCursorInRight;
}

function resolveEvtPos(el, cursorY) {
  const r = el.getBoundingClientRect();
  const mid = r.top + r.height / 2;
  if (el === lastAnchorEl) {
    if (lastAnchorPos === 'before') return cursorY > mid + DRAG_HYSTERESIS ? 'after' : 'before';
    if (lastAnchorPos === 'after')  return cursorY < mid - DRAG_HYSTERESIS ? 'before' : 'after';
  }
  return cursorY > mid ? 'after' : 'before';
}

export const EventInteractions = {
  init(pageCanvas) {
    if (!pageCanvas) return;
    console.log('[EventInteractions] Initializing with delegation on', pageCanvas);

    // 1. Delegated Mousedown for Draggable state
    pageCanvas.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.event-drag-handle');
      if (handle) {
        const el = handle.closest('.event-block');
        if (el) {
          el.draggable = true;
          console.log('[EventInteractions] mousedown on handle, event is now draggable');
        }
      }
    });

    // 2. Delegated DragStart
    pageCanvas.addEventListener('dragstart', (e) => {
      const el = e.target.closest('.event-block');
      if (el && !e.target.closest('.data-block')) { // Only if it's the event block, not an internal block
        const eid = el.dataset.eventId;
        const currentId = Store.getCurrentPageId();
        const evt = Store.getEvents(currentId).find(ev => ev.id === eid);
        
        if (evt) {
          console.log('[EventInteractions] Drag started on event:', evt.name || evt.id);
          this.handleDragStart(e, evt, el);
        }
      }
    });

    // 3. Delegated DragEnd
    pageCanvas.addEventListener('dragend', (e) => {
      const el = e.target.closest('.event-block');
      if (el && !e.target.closest('.data-block')) {
        el.draggable = false;
        console.log('[EventInteractions] Drag ended');
        this.handleDragEnd(el);
      }
    });

    pageCanvas.addEventListener('dragover', (e) => {
      if (!draggedEvt) return;
      e.preventDefault();
      lastMouseY = e.clientY;
      e.dataTransfer.dropEffect = 'move';

      const allEl = Array.from(pageCanvas.children);
      const blocks = allEl.filter(c => c.classList.contains('event-block') && !c.classList.contains('dragging'));
      const span = draggedEvt.span || 1;

      const cr = pageCanvas.getBoundingClientRect();
      const canvasMidX = cr.left + cr.width / 2;

      if (blocks.length === 0) {
        pageCanvas.prepend(eventPlaceholder);
        if (span === 2) {
          eventPlaceholder.style.gridColumn = '1 / -1';
        } else {
          const col = resolveColumn(e.clientX, canvasMidX);
          eventPlaceholder.style.gridColumn = col ? '2 / 3' : '1 / 2';
        }
        return;
      }

      if (span === 1) {
        // X+Y aware with column hysteresis: stable column selection, then closest Y
        const cursorInRight = resolveColumn(e.clientX, canvasMidX);

        const sameColBlocks = blocks.filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.left + r.width / 2 > canvasMidX) === cursorInRight;
        });

        const pool = sameColBlocks.length > 0 ? sameColBlocks : blocks;

        let closest = null;
        let minDist = Infinity;
        pool.forEach(el => {
          const r = el.getBoundingClientRect();
          const dist = Math.abs(e.clientY - (r.top + r.height / 2));
          if (dist < minDist) { minDist = dist; closest = el; }
        });

        if (closest) {
          const pos = resolveEvtPos(closest, e.clientY);
          const newGridCol = cursorInRight ? '2 / 3' : '1 / 2';
          if (closest !== lastAnchorEl || pos !== lastAnchorPos || eventPlaceholder.style.gridColumn !== newGridCol) {
            lastAnchorEl = closest;
            lastAnchorPos = pos;
            if (pos === 'after') closest.after(eventPlaceholder);
            else closest.before(eventPlaceholder);
          }
          eventPlaceholder.style.gridColumn = newGridCol;
        }
      } else {
        // Full-width event: Y-only
        let closest = null;
        let minDist = Infinity;
        blocks.forEach(el => {
          const rect = el.getBoundingClientRect();
          const dist = Math.abs(e.clientY - (rect.top + rect.height / 2));
          if (dist < minDist) { minDist = dist; closest = el; }
        });
        if (closest) {
          const pos = resolveEvtPos(closest, e.clientY);
          if (closest !== lastAnchorEl || pos !== lastAnchorPos) {
            lastAnchorEl = closest;
            lastAnchorPos = pos;
            if (pos === 'after') closest.after(eventPlaceholder);
            else closest.before(eventPlaceholder);
          }
        }
        eventPlaceholder.style.gridColumn = '1 / -1';
      }
    });

    pageCanvas.addEventListener('drop', (e) => {
      if (e.preventDefault) e.preventDefault();
      if (!draggedEvt) return;

      // Assign column side for half-width events based on drop X position
      if ((draggedEvt.span || 1) === 1) {
        const cr = pageCanvas.getBoundingClientRect();
        draggedEvt.side = e.clientX > cr.left + cr.width / 2 ? 'right' : 'left';
      }

      const currentId = Store.getCurrentPageId();
      const pageEvts = Store.getEvents(currentId);
      if (!pageEvts) return;

      const children = Array.from(pageCanvas.children);
      const newOrder = [];

      children.forEach(child => {
        let eid = null;
        if (child.classList.contains('event-block') && !child.classList.contains('dragging')) {
          eid = child.dataset.eventId;
        } else if (child === eventPlaceholder) {
          eid = draggedEvt.id;
        }

        if (eid && !newOrder.find(ev => ev.id === eid)) {
            const ev = pageEvts.find(item => item.id === eid);
            if (ev) newOrder.push(ev);
        }
      });

      if (newOrder.length > 0) {
        if (window.sharedState && window.sharedState.recordSnapshot) window.sharedState.recordSnapshot();
        Store.setEvents(currentId, newOrder);
        Store.save();
        EventHub.emit('requestRender');
      }

      this.cleanup();
    });
  },

  handleDragStart(e, evt, el) {
    draggedEvt = evt;
    e.dataTransfer.effectAllowed = 'move';
    const rect = el.getBoundingClientRect();
    eventPlaceholder.style.height = rect.height + 'px';
    const span = evt.span || 1;
    if (span === 2) {
      eventPlaceholder.style.gridColumn = '1 / -1';
    } else {
      eventPlaceholder.style.gridColumn = (evt.side === 'right') ? '2 / 3' : '1 / 2';
    }
    lastMouseY = e.clientY;
    
    setTimeout(() => {
      el.classList.add('dragging');
    }, 0);
    
    window.addEventListener('wheel', manualWheel, { passive: true });
    startAutoScroll();
  },

  handleDragEnd(el) {
    this.cleanup();
    if (el) el.classList.remove('dragging');
    EventHub.emit('requestRender');
  },

  cleanup() {
    draggedEvt = null;
    lastAnchorEl = null;
    lastAnchorPos = null;
    lastCursorInRight = null;
    if (eventPlaceholder.parentNode) eventPlaceholder.remove();
    window.removeEventListener('wheel', manualWheel);
    stopAutoScroll();
  }
};
