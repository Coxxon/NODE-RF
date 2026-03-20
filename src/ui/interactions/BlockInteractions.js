/**
 * BlockInteractions.js — Logic for moving blocks within an Event (Assignment, Note, etc.)
 */
import { Store } from '../../core/Store.js';
import { EventHub } from '../../core/EventHub.js';

let draggedBlock = null;
let draggedBlockEvt = null;

const blockPlaceholder = document.createElement('div');
blockPlaceholder.className = 'block-placeholder';
blockPlaceholder.style.pointerEvents = 'none';

function updatePlaceholderSize(evt, block, context, side) {
  if (!block) return;
  const isFull = (block.span === 2 || block.type === 'header');

  if (isFull) {
    blockPlaceholder.style.width = '100%';
    blockPlaceholder.style.alignSelf = 'stretch';
    blockPlaceholder.classList.add('full-width');
  } else {
    blockPlaceholder.classList.remove('full-width');
    if (evt.span === 1) {
      blockPlaceholder.style.width = '100%';
      blockPlaceholder.style.alignSelf = 'stretch';
    } else {
      if (context === 'column') {
        blockPlaceholder.style.width = '100%';
        blockPlaceholder.style.alignSelf = 'stretch';
      } else {
        blockPlaceholder.style.width = 'calc(50% - 6px)';
        blockPlaceholder.style.alignSelf = (side === 'right') ? 'flex-end' : 'flex-start';
      }
    }
  }
}

export const BlockInteractions = {
  init(pageCanvas) {
    if (!pageCanvas) return;
    console.log('[BlockInteractions] Initializing with delegation on', pageCanvas);

    // 1. Delegated Mousedown for Draggable state
    pageCanvas.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.block-drag-handle');
      if (handle) {
        const el = handle.closest('.data-block');
        if (el) {
          el.draggable = true;
          console.log('[BlockInteractions] mousedown on handle, block is now draggable');
        }
      }
    });

    // 2. Delegated DragStart
    pageCanvas.addEventListener('dragstart', (e) => {
      const el = e.target.closest('.data-block');
      if (el) {
        e.stopPropagation(); // Don't trigger Event drag
        const bid = el.dataset.blockId;
        const eventEl = el.closest('.event-block');
        const eid = eventEl?.dataset.eventId;
        
        const currentId = Store.getCurrentPageId();
        const evt = Store.getEvents(currentId).find(ev => ev.id === eid);
        const block = (evt?.blocks || []).find(b => b.id === bid);
        
        if (block && evt) {
          console.log('[BlockInteractions] Drag started on block:', block.type);
          this.handleDragStart(e, block, evt, el);
        }
      }
    });

    // 3. Delegated DragEnd
    pageCanvas.addEventListener('dragend', (e) => {
      const el = e.target.closest('.data-block');
      if (el) {
        el.draggable = false;
        console.log('[BlockInteractions] Drag ended on block');
        this.handleDragEnd(el);
      }
    });
  },

  initEventBody(body, evt) {
    body.addEventListener('dragover', (e) => {
      if (!draggedBlock || draggedBlockEvt !== evt) return;
      e.preventDefault();
      e.stopPropagation();

      const isFull = (draggedBlock.span === 2 || draggedBlock.type === 'header');
      const overCol = e.target.closest('.column');

      if (overCol && !isFull) {
        const side = overCol.classList.contains('column-left') ? 'left' : 'right';
        this.handleDragOverSegment(e, overCol, evt, side);
        return;
      }

      // Insertion logic for the body
      const blocksOrSegments = Array.from(body.children).filter(c => !c.classList.contains('dragging') && !c.classList.contains('block-placeholder'));
      const bodyRect = body.getBoundingClientRect();

      if (blocksOrSegments.length === 0) {
        body.appendChild(blockPlaceholder);
        updatePlaceholderSize(evt, draggedBlock, 'body', (e.clientX > bodyRect.left + bodyRect.width/2) ? 'right' : 'left');
      } else {
        let closest = null;
        let minDist = Infinity;
        blocksOrSegments.forEach(child => {
          const r = child.getBoundingClientRect();
          const dist = Math.abs(e.clientY - (r.top + r.height/2));
          if (dist < minDist) { minDist = dist; closest = child; }
        });
        if (closest) {
          const r = closest.getBoundingClientRect();
          if (e.clientY > r.top + r.height/2) closest.after(blockPlaceholder);
          else closest.before(blockPlaceholder);
          
          const isRight = (evt.span === 2 && e.clientX > bodyRect.left + bodyRect.width/2);
          updatePlaceholderSize(evt, draggedBlock, 'body', isRight ? 'right' : 'left');
        }
      }
    });

    body.addEventListener('drop', (e) => this.handleDrop(e, evt));
  },

  handleDragStart(e, block, evt, el) {
    draggedBlock = block;
    draggedBlockEvt = evt;
    e.dataTransfer.effectAllowed = 'move';
    const rect = el.getBoundingClientRect();
    blockPlaceholder.style.height = rect.height + 'px';
    
    updatePlaceholderSize(evt, block, 'body', block.side || 'left');

    setTimeout(() => {
      el.classList.add('dragging');
    }, 0);
    
    const body = el.closest('.event-body');
    if (body) body.classList.add('drag-active');
  },

  handleDragOver(e, el, evt) {
    if (e.preventDefault) e.preventDefault();
    if (!draggedBlock || draggedBlockEvt !== evt) return false;
    
    const isFull = (draggedBlock.span === 2 || draggedBlock.type === 'header');
    if (isFull || el.classList.contains('full-width')) {
       const rect = el.getBoundingClientRect();
       if (e.clientY > rect.top + rect.height/2) el.after(blockPlaceholder);
       else el.before(blockPlaceholder);
       updatePlaceholderSize(evt, draggedBlock, 'body', draggedBlock.side || 'left');
    }
  },

  handleDragOverSegment(e, col, evt, side) {
    if (e.preventDefault) e.preventDefault();
    if (!draggedBlock || draggedBlockEvt !== evt) return false;
    e.dataTransfer.dropEffect = 'move';
    
    const blocks = Array.from(col.querySelectorAll('.data-block:not(.dragging)'));
    if (blocks.length === 0) {
      col.appendChild(blockPlaceholder);
      blockPlaceholder.style.width = '100%';
      blockPlaceholder.style.alignSelf = 'stretch';
    } else {
      let closest = null;
      let minDist = Infinity;
      blocks.forEach(b => {
        const r = b.getBoundingClientRect();
        const dist = Math.abs(e.clientY - (r.top + r.height/2));
        if (dist < minDist) { minDist = dist; closest = b; }
      });
      
      const r = closest.getBoundingClientRect();
      if (e.clientY > r.top + r.height/2) closest.after(blockPlaceholder);
      else closest.before(blockPlaceholder);
      
      updatePlaceholderSize(evt, draggedBlock, 'column', side);
    }
  },

  handleDragEnd(el) {
    if (el) el.classList.remove('dragging');
    this.cleanup();
  },

  handleDrop(e, evt) {
    if (e.preventDefault) e.preventDefault();
    if (!draggedBlock || draggedBlockEvt !== evt) return;

    const bodyEl = e.currentTarget;
    const bodyRect = bodyEl.getBoundingClientRect();
    const newBlocks = [];

    Array.from(bodyEl.children).forEach(child => {
      if (child === blockPlaceholder) {
        if (draggedBlock) {
          if (draggedBlock.span === 1 && draggedBlock.type !== 'header') {
             draggedBlock.side = (e.clientX > bodyRect.left + bodyRect.width/2) ? 'right' : 'left';
          } else {
             delete draggedBlock.side;
          }
          newBlocks.push(draggedBlock);
        }
        return;
      }

      if (child.classList.contains('data-block') && !child.classList.contains('dragging')) {
        const bid = child.dataset.blockId;
        const b = (evt.blocks || []).find(item => item.id === bid);
        if (b) newBlocks.push(b);
      } else if (child.classList.contains('block-segment')) {
        const leftCol = child.querySelector('.column-left');
        const rightCol = child.querySelector('.column-right');
        
        const processColumn = (col, side) => {
          Array.from(col.children).forEach(item => {
            if (item === blockPlaceholder) {
              if (draggedBlock) {
                draggedBlock.side = side;
                newBlocks.push(draggedBlock);
              }
            } else if (item.classList.contains('data-block') && !item.classList.contains('dragging')) {
              const b = (evt.blocks || []).find(it => it.id === item.dataset.blockId);
              if (b) {
                b.side = side;
                newBlocks.push(b);
              }
            }
          });
        };
        processColumn(leftCol, 'left');
        processColumn(rightCol, 'right');
      }
    });

    (evt.blocks || []).forEach(oldBlock => {
      if (!newBlocks.find(nb => nb.id === oldBlock.id)) {
        newBlocks.push(oldBlock);
      }
    });

    evt.blocks = newBlocks;
    Store.save();
    EventHub.emit('requestRender');
    this.cleanup();
  },

  cleanup() {
    draggedBlock = null;
    draggedBlockEvt = null;
    if (blockPlaceholder.parentNode) blockPlaceholder.remove();
    document.querySelectorAll('.event-body.drag-active').forEach(b => b.classList.remove('drag-active'));
  }
};
