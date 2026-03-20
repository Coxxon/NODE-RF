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
      
      if (blocks.length === 0) {
        pageCanvas.prepend(eventPlaceholder);
      } else {
        let closest = null;
        let minDist = Infinity;
        
        blocks.forEach(el => {
          const rect = el.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const dist = Math.abs(e.clientY - midY);
          if (dist < minDist) {
            minDist = dist;
            closest = el;
          }
        });

        if (closest) {
          const rect = closest.getBoundingClientRect();
          if (e.clientY > rect.top + rect.height / 2) {
            closest.after(eventPlaceholder);
          } else {
            closest.before(eventPlaceholder);
          }
        }
      }
    });

    pageCanvas.addEventListener('drop', (e) => {
      if (e.preventDefault) e.preventDefault();
      if (!draggedEvt) return;

      const currentId = Store.getCurrentPageId();
      const pageEvts = Store.getEvents(currentId);
      if (!pageEvts) return;

      const children = Array.from(pageCanvas.children);
      const newOrder = [];
      
      children.forEach(child => {
        let eid = null;
        if (child.classList.contains('event-block')) {
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
    eventPlaceholder.style.gridColumn = `span ${span}`;
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
    if (eventPlaceholder.parentNode) eventPlaceholder.remove();
    window.removeEventListener('wheel', manualWheel);
    stopAutoScroll();
  }
};
