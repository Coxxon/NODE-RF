import { Store } from './Store.js';
import { getRFInfo } from './RFUtils.js';

let lastHoveredConflictDot = null;

export const ConflictManager = {
  checkConflicts() {
    // Reset all line indicators and dots
    document.querySelectorAll('.line-conflict-indicator').forEach(ind => {
      ind.classList.remove('active');
      delete ind.dataset.conflictDetails;
    });
    document.querySelectorAll('.event-conflict-dot').forEach(d => {
      d.classList.remove('rf');
      delete d.dataset.conflictDetails;
    });

    const evs = Store.getEvents(Store.getCurrentPageId());
    const conflictMap = new Map(); // rowId -> Array of { type, person, otherEvent, otherPerson, value }
    const eventConflictFlag = new Set(); // eventId

    const addConflict = (rowId, eventId, detail) => {
      if (!conflictMap.has(rowId)) conflictMap.set(rowId, []);
      conflictMap.get(rowId).push(detail);
      eventConflictFlag.add(eventId);
    };

    const mergeConflicts = (details) => {
      // Group details by (otherEvent, otherPerson)
      const grouped = new Map();
      details.forEach(d => {
        const key = `${d.otherEvent}|${d.otherPerson}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(d);
      });

      const merged = [];
      grouped.forEach((conflicts, key) => {
        const hasFreq = conflicts.some(c => c.type === 'Frequency');
        const hasDev = conflicts.some(c => c.type === 'Device');
        const first = conflicts[0];
        
        if (hasFreq && hasDev) {
          // Combined type
          const freqVal = conflicts.find(c => c.type === 'Frequency').value;
          const devVal = conflicts.find(c => c.type === 'Device').value;
          merged.push({
            type: 'Device & Frequency',
            person: first.person,
            otherEvent: first.otherEvent,
            otherPerson: first.otherPerson,
            value: `${devVal} / ${freqVal}`
          });
        } else {
          merged.push(...conflicts);
        }
      });
      return merged;
    };

    // Compare each pair of events
    for (let i = 0; i < evs.length; i++) {
      const rowsA = this.getEventRows(evs[i]);
      
      // Intra-event conflicts
      for (let m = 0; m < rowsA.length; m++) {
        for (let n = m + 1; n < rowsA.length; n++) {
          const ra = rowsA[m], rb = rowsA[n];
          const isFreq = ra.rfId && rb.rfId && ra.rfId === rb.rfId;
          const isDev = ra.device && rb.device && ra.device === rb.device;
          
          if (isFreq) {
            const val = ra.rfFreq.replace(/\s*mhz/gi,'') + ' MHz';
            addConflict(ra.id, evs[i].id, { type: 'Frequency', person: ra.person, otherEvent: 'Same Event', otherPerson: rb.person, value: val });
            addConflict(rb.id, evs[i].id, { type: 'Frequency', person: rb.person, otherEvent: 'Same Event', otherPerson: ra.person, value: val });
          }
          if (isDev) {
            const val = ra.originalDevice;
            addConflict(ra.id, evs[i].id, { type: 'Device', person: ra.person, otherEvent: 'Same Event', otherPerson: rb.person, value: val });
            addConflict(rb.id, evs[i].id, { type: 'Device', person: rb.person, otherEvent: 'Same Event', otherPerson: ra.person, value: val });
          }
        }
      }

      // Inter-event conflicts
      for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i], b = evs[j];
        if (!this.timeOverlap(a, b)) continue;

        const rowsB = this.getEventRows(b);
        rowsA.forEach(ra => {
          rowsB.forEach(rb => {
            const isFreq = ra.rfId && rb.rfId && ra.rfId === rb.rfId;
            const isDev = ra.device && rb.device && ra.device === rb.device;
            
            if (isFreq) {
              const val = ra.rfFreq.replace(/\s*mhz/gi,'') + ' MHz';
              addConflict(ra.id, a.id, { type: 'Frequency', person: ra.person, otherEvent: b.name || 'Unnamed', otherPerson: rb.person, value: val });
              addConflict(rb.id, b.id, { type: 'Frequency', person: rb.person, otherEvent: a.name || 'Unnamed', otherPerson: ra.person, value: val });
            }
            if (isDev) {
              const val = ra.originalDevice;
              addConflict(ra.id, a.id, { type: 'Device', person: ra.person, otherEvent: b.name || 'Unnamed', otherPerson: rb.person, value: val });
              addConflict(rb.id, b.id, { type: 'Device', person: rb.person, otherEvent: a.name || 'Unnamed', otherPerson: ra.person, value: val });
            }
          });
        });
      }
    }

    // Apply conflicts to rows
    conflictMap.forEach((details, rowId) => {
      const rowEl = document.querySelector(`.block-row[data-row-id="${rowId}"]`);
      if (rowEl) {
        rowEl.classList.add('has-conflict');
        const ind = rowEl.querySelector('.line-conflict-indicator');
        if (ind) {
          ind.classList.add('active');
          const uniqueDetails = Array.from(new Set(details.map(JSON.stringify))).map(JSON.parse);
          const mergedDetails = mergeConflicts(uniqueDetails);
          ind.dataset.conflictDetails = JSON.stringify(mergedDetails);
          
          // REFRESH TOOLTIP IF ACTIVE
          if (lastHoveredConflictDot === ind) {
            this.showConflictTooltip(null, ind, true);
          }
        }
      }
    });

    // Also clear has-conflict class if no longer in map
    document.querySelectorAll('.block-row.has-conflict').forEach(rowEl => {
      if (!conflictMap.has(rowEl.dataset.rowId)) {
        rowEl.classList.remove('has-conflict');
      }
    });

    // Apply summary flag to event headers
    eventConflictFlag.forEach(eventId => {
      const eventEl = document.querySelector(`.event-block[data-event-id="${eventId}"]`);
      if (eventEl) {
        const d = eventEl.querySelector('.event-conflict-dot');
        if (d) d.classList.add('rf');
      }
    });
  },

  showConflictTooltip(e, dot, isRefresh = false) {
    const rawDetails = dot.dataset.conflictDetails;
    if (!rawDetails) {
      if (isRefresh) this.hideConflictTooltip();
      return;
    }
    
    if (!isRefresh) lastHoveredConflictDot = dot;
    
    const details = JSON.parse(rawDetails);
    
    // Create or reuse tooltip
    let tt = document.getElementById('__conflict-tooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.className = 'conflict-tooltip';
      tt.id = '__conflict-tooltip';
      document.body.appendChild(tt);
    } else {
      tt.innerHTML = ''; // Clear for fresh content
    }
    
    const title = document.createElement('div');
    title.className = 'conflict-tooltip-title';
    title.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Conflicts Detected`;
    tt.appendChild(title);
    
    // Group details by event, then by nature
    const eventGroups = {};
    details.forEach(c => {
      const evName = c.otherEvent === 'Same Event' ? 'Same Event' : c.otherEvent;
      if (!eventGroups[evName]) eventGroups[evName] = {};
      if (!eventGroups[evName][c.type]) eventGroups[evName][c.type] = [];
      eventGroups[evName][c.type].push(c);
    });

    // Render grouped conflicts
    const evEntries = Object.entries(eventGroups);
    evEntries.forEach(([evName, typeGroups], evIdx) => {
      const evSection = document.createElement('div');
      if (evIdx > 0) evSection.style.marginTop = '12px'; // Spacing between event blocks
      
      // Header: The Name of the other event (Full-width band)
      const otherEventHeader = document.createElement('div');
      otherEventHeader.style.fontSize = '0.75rem';
      otherEventHeader.style.fontWeight = '800';
      otherEventHeader.style.color = '#fff';
      otherEventHeader.style.textTransform = 'uppercase';
      otherEventHeader.style.letterSpacing = '0.05em';
      otherEventHeader.style.background = 'rgba(255,255,255,0.08)'; // Subtle background highlight
      otherEventHeader.style.padding = '4px 16px'; // Matching tooltip padding
      otherEventHeader.style.margin = '0 -16px 6px -16px'; // Pull to edges
      otherEventHeader.style.marginBottom = '6px';
      otherEventHeader.textContent = evName;
      evSection.appendChild(otherEventHeader);
      
      const typeEntries = Object.entries(typeGroups);
      typeEntries.forEach(([type, items], typeIdx) => {
        // Nature Header: Simplified conflict type with pluralization
        const nature = document.createElement('div');
        nature.style.fontSize = '0.62rem';
        nature.style.opacity = '0.5';
        nature.style.fontWeight = '700';
        nature.style.textTransform = 'uppercase';
        
        // Small gap if it's not the first type in this event
        nature.style.marginTop = typeIdx > 0 ? '8px' : '2px';
        
        const plural = items.length > 1 ? 's' : '';
        nature.textContent = `${type} conflict${plural}`;
        evSection.appendChild(nature);

        // List of people/values for this type under this event
        items.forEach(item => {
          const valRow = document.createElement('div');
          valRow.style.fontSize = '0.8rem';
          valRow.style.fontWeight = '700';
          valRow.style.color = 'var(--text-main)';
          valRow.style.whiteSpace = 'nowrap';
          valRow.textContent = `${item.otherPerson} (${item.value})`;
          evSection.appendChild(valRow);
        });
      });

      tt.appendChild(evSection);
    });
    
    document.body.appendChild(tt);
    
    // Position tooltip
    const rect = dot.getBoundingClientRect();
    const ttRect = tt.getBoundingClientRect();
    
    let left = rect.left + (rect.width / 2) - (ttRect.width / 2);
    let top = rect.top - ttRect.height - 10;
    
    // Boundary checks
    if (left < 10) left = 10;
    if (left + ttRect.width > window.innerWidth - 10) left = window.innerWidth - ttRect.width - 10;
    if (top < 10) top = rect.bottom + 10;
    
    tt.style.left = `${left}px`;
    tt.style.top = `${top}px`;
  },

  hideConflictTooltip() {
    document.getElementById('__conflict-tooltip')?.remove();
    lastHoveredConflictDot = null;
  },

  timeOverlap(a, b) {
    const p = t => { if(!t) return null; const m = t.match(/(\d+)h(\d+)/); return m ? parseInt(m[1])*60 + parseInt(m[2]) : null; };
    const as = p(a.startTime), ae = p(a.endTime), bs = p(b.startTime), be = p(b.endTime);
    if (as===null || ae===null || bs===null || be===null) return false;
    return as < be && ae > bs;
  },

  getEventRows(e) {
    let rows = [];
    if (!e || !e.blocks) return rows;
    e.blocks.forEach(bl => {
      if (bl.type === 'assignment') {
        bl.rows.forEach(row => {
          rows.push({
            id: row.id,
            person: row.personName || 'Unnamed',
            device: (row.deviceLabel || '').trim().toLowerCase(),
            originalDevice: row.deviceLabel,
            rfId: row.rfChannelId,
            rfFreq: row.rfChannelId ? (getRFInfo(row.rfChannelId)?.freq || 'Unknown') : null
          });
        });
      }
    });
    return rows;
  }
};
