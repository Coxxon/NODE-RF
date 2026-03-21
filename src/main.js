/**
 * main.js - Entry Point
 */
import './style.css';
import { handleVerticalNavigation } from './utils.js';
import { sharedState } from './stateExports.js';
import { initAssignments, saveAssignments, toggleAllEvents, renderPageCanvas, isAnyEventExpanded, getAssignmentState, 
setAssignmentState, clearAssignments, switchView, getAssignmentsLastView } from './assignments.js';
import { Store } from './core/Store.js';

// ─── UTILS ──────────────────────────────────────────────────────────────────
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Garde-fou Throttle : Force le snapshot dès qu'on quitte un champ
document.addEventListener('blur', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
    Store._lastSnapshotTime = 0; 
  }
}, true);

// Espace : Undo mot par mot
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    const active = document.activeElement;
    const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    if (isTyping) {
      Store._forceNextSnapshot = true;
    }
  }
}, true); // Phase de capture
import { TemplateDrawer } from './ui/TemplateDrawer.js';
import { EVENT_PALETTE } from './core/Constants.js';

// DOM Elements
const dragDropOverlay = document.getElementById('dragDropOverlay');
const fileInput = document.getElementById('csvFileInput');
const sessionFileInput = document.getElementById('sessionFileInput');
const btnPrint = document.getElementById('btnPrint');
const btnFileMenu = document.getElementById('btnFileMenu');
const fileDropdown = document.getElementById('fileDropdown');
const btnMenuLoadCsv = document.getElementById('btnMenuLoadCsv');
const btnMenuSaveSession = document.getElementById('btnMenuSaveSession');
const btnMenuLoadSession = document.getElementById('btnMenuLoadSession');
const btnMenuExportPdf = document.getElementById('btnMenuExportPdf');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const reportContainer = document.getElementById('reportContainer');
const btnThemeToggle = document.getElementById('btnThemeToggle');
const searchInput = document.getElementById('searchInput'); // Also re-adding this just in case

const btnToggleEdit = document.getElementById('btnToggleEdit');
// Toggles removed

// Global State
let parsedZones = [];
let currentTheme = localStorage.getItem('node_rf_theme') || 'dark';
const stateClasses = ['', 'status-alert', 'status-muted', 'status-backup'];
let rfStates = {}; // 0: OK, 1: Alert, 2: Muted
let rfNotes = {};
let rfNames = {};
let customFreqs = [];
let customFreqData = {};
let activeBackups = {};
let reportInfo = { opName: '', opDate: '', author: '', email: '' };
let customZoneNames = {};
let mainZoneOrder = [];
let zoneColors = {}; 
let currentCsvFilePath = null; // Absolute path of last loaded CSV (Electron only)

// ─── SEARCH (Fuse.js) ────────────────────────────────────────────────────────
const FUSE_BASE_OPTIONS = {
  keys: [
    { name: 'searchFreq', weight: 2.0 },
    { name: 'name', weight: 1.0 },
    { name: 'series', weight: 1.0 },
    { name: 'notes', weight: 0.5 },
    { name: 'zone', weight: 0.3 },
    { name: 'band', weight: 0.2 }
  ],
  distance: 100,
  useExtendedSearch: true,
  location: 0,
  minMatchCharLength: 1
};

let _fuse = null;
let _fuseLastVersion = -1;

function flattenStoreForSearch() {
  const flat = [];
  parsedZones.forEach(zone => {
    zone.groups.forEach(group => {
      group.subgroups.forEach(subgroup => {
        subgroup.rows.forEach(row => {
          const name = rfNames[row.id] ?? (row.isCustom ? (customFreqData[row.id]?.channelName ?? '') : (row.channelName ?? ''));
          const note = rfNotes[row.id] ?? '';
          const freq = row.isCustom ? (customFreqData[row.id]?.frequency ?? '') : (row.frequency ?? '');
          
          // Harmonize: convert comma to dot for internal indexing ONLY
          const searchFreq = freq.replace(/,/g, '.');
          
          flat.push({
            id: row.id,
            zone: zone.name ?? 'Unknown Zone',
            group: group.name ?? 'Unknown Group',
            subgroup: subgroup.name ?? 'Unknown Subgroup',
            frequency: freq, // Keep original for display
            searchFreq: searchFreq, // Hidden technical field for Fuse
            name: name,
            notes: note,
            series: row.series ?? '',
            band: row.band ?? ''
          });
        });
      });
    });
  });

  // 2. Coordination Pages (Dynamic)
  const pages = Store.getPages().filter(p => !p.isDeleted);
  pages.forEach(page => {
    const events = Store.getEvents(page.id) || [];
    events.forEach(evt => {
       const searchFreq = (evt.frequency || "").replace(/,/g, '.');
       flat.push({
         id: evt.id,
         pageId: page.id,
         zone: page.label || 'Unnamed Page',
         group: 'Coordination',
         subgroup: 'Events',
         frequency: evt.frequency || "",
         searchFreq: searchFreq,
         name: evt.name || "",
         notes: evt.notes || "",
         series: evt.series || "",
         band: evt.band || ""
       });
    });
  });

  return flat;
}

function getFuseIndex() {
  const currentVersion = Store._lastSnapshotTime;
  if (!_fuse || _fuseLastVersion !== currentVersion) {
    const data = flattenStoreForSearch();
    _fuse = new Fuse(data, {
      ...FUSE_BASE_OPTIONS,
      threshold: 0.2 // DEFAULT for text
    });
    _fuseLastVersion = currentVersion;
  }
  return _fuse;
}

// ─── AUTOSAVE ───────────────────────────────────────────────────────────────

/** Build the full state snapshot for autosave / manual save. */
function buildAutosavePayload() {
  return {
    csvFilePath: currentCsvFilePath,
    fileName: fileNameDisplay.textContent,
    parsedZones,
    rfStates,
    rfNotes,
    rfNames,
    customFreqs,
    customFreqData,
    activeBackups,
    reportInfo,
    customZoneNames,
    mainZoneOrder,
    zoneColors,
    assignments: getAssignmentState(),
    savedAt: new Date().toISOString()
  };
}

let _autosaveTimer = null;

/** Debounced autosave: writes state snapshot to Store (which handles history & localStorage). */
function autosave() {
  if (Store.isRestoring) return; // Don't record history while we are restoring it
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    try {
      Store.save(buildAutosavePayload());
    } catch (e) { /* ignore */ }
  }, 600);
}
sharedState.requestAutosave = autosave;

/** Restores all local variables from a Store data object. */
function syncStateFromStore(data) {
  if (!data) return;

  // Handle full payload (with top-level parsedZones etc.)
  if (data.parsedZones || data.assignments) {
    parsedZones     = data.parsedZones     || [];
    rfStates        = data.rfStates        || {};
    rfNotes         = data.rfNotes         || {};
    rfNames         = data.rfNames         || {};
    customFreqs     = data.customFreqs     || [];
    customFreqData  = data.customFreqData  || {};
    activeBackups   = data.activeBackups   || {};
    reportInfo      = data.reportInfo      || { opName: '', opDate: '', author: '', email: '' };
    customZoneNames = data.customZoneNames || {};
    mainZoneOrder   = data.mainZoneOrder   || [];
    zoneColors      = data.zoneColors      || {};

    if (data.assignments) {
      setAssignmentState(data.assignments);
    } else {
      // Fallback if assignments are at the top level (from Store.data structure)
      setAssignmentState(data);
    }
  } else {
    // Just assignments
    setAssignmentState(data);
  }
}

/** Restore last autosave from localStorage. Attempts to re-read CSV from disk. */
function restoreAutosave() {
  const raw = localStorage.getItem('node_rf_autosave');
  if (!raw) return;
  try {
    const data = JSON.parse(raw);

    // Try to re-read CSV from disk to get fresh parsed data
    if (data.csvFilePath && window.electronFS?.fileExists(data.csvFilePath)) {
      const csvContent = window.electronFS.readFile(data.csvFilePath);
      parseWWB6CSV(csvContent);
      currentCsvFilePath = data.csvFilePath;
      fileNameDisplay.textContent = data.fileName || data.csvFilePath.split(/[\\/]/).pop();
    } else if (data.csvFilePath) {
      // File has moved — show non-blocking warning
      showRestoreError(data.csvFilePath, data.fileName);
      return;
    } else if (data.parsedZones?.length) {
      // No path stored (older session fallback) — restore from embedded zone data
      parsedZones = data.parsedZones;
      fileNameDisplay.textContent = data.fileName || 'Restored Session';
    }

    // Restore all annotations
    rfStates       = data.rfStates       || {};
    rfNotes        = data.rfNotes        || {};
    rfNames        = data.rfNames        || {};
    customFreqs    = data.customFreqs    || [];
    customFreqData = data.customFreqData || {};
    activeBackups  = data.activeBackups  || {};
    reportInfo     = data.reportInfo     || { opName: '', opDate: '', author: '', email: '' };
    customZoneNames = data.customZoneNames || {};
    mainZoneOrder  = data.mainZoneOrder  || [];
    zoneColors     = data.zoneColors     || {};

    if (data.assignments) {
      setAssignmentState(data.assignments);
      switchView(getAssignmentsLastView() || 'inventory');
    } else {
      clearAssignments();
    }

    renderReport();
  } catch (e) {
    console.warn('Autosave restore failed:', e);
  }
}

/** Show an error modal when the CSV file has moved. */
function showRestoreError(filePath, fileName) {
  const overlay = document.getElementById('restoreErrorOverlay');
  const msg = document.getElementById('restoreErrorMsg');
  if (overlay && msg) {
    msg.textContent = `The file "${fileName || filePath}" could not be found at:\n${filePath}\n\nPlease reload it manually (File → Load CSV) or load a saved session (File → Load Session).`;
    overlay.classList.add('active');
  }
}

// ─── RESTORE ON STARTUP TOGGLE ───────────────────────────────────────────────

function isRestoreEnabled() {
  return localStorage.getItem('node_rf_restore_on_startup') === 'true';
}

function setRestoreEnabled(val) {
  localStorage.setItem('node_rf_restore_on_startup', String(val));
  updateRestoreToggleUI();
}

function updateRestoreToggleUI() {
  const btn = document.getElementById('btnMenuRestoreToggle');
  if (!btn) return;
  const icon = btn.querySelector('.restore-check');
  if (icon) icon.style.opacity = isRestoreEnabled() ? '1' : '0';
}


function generateId(zoneName, freq, channelName) {
  return btoa(encodeURIComponent(`${zoneName}-${freq}-${channelName}`));
}

const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>`;
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;

function updateThemeIcon() {
  const sunEl = btnThemeToggle.querySelector('.theme-sun');
  const moonEl = btnThemeToggle.querySelector('.theme-moon');
  if (sunEl && moonEl) {
    sunEl.style.display = currentTheme === 'dark' ? 'none' : 'block';
    moonEl.style.display = currentTheme === 'dark' ? 'block' : 'none';
  } else {
    // Fallback for dynamically rendered buttons (if any)
    btnThemeToggle.innerHTML = currentTheme === 'dark' ? moonIcon : sunIcon;
  }
}

// Initialization
document.documentElement.setAttribute('data-theme', currentTheme);
updateThemeIcon();

// Print Manager DOM
const printManagerOverlay = document.getElementById('printManagerOverlay');
const btnClosePrintManager = document.getElementById('btnClosePrintManager');
const btnGeneratePdf = document.getElementById('btnGeneratePdf');
const printZoneList = document.getElementById('printZoneList');
const infoOpName = document.getElementById('infoOpName');
const infoOpDate = document.getElementById('infoOpDate');
const infoAuthor = document.getElementById('infoAuthor');
const infoEmail = document.getElementById('infoEmail');

let zoneOrder = [];
let zonePageBreaks = {};

function openPrintManager() {
  if (parsedZones.length === 0 && customFreqs.length === 0) {
    alert("Aucune donnée à imprimer.");
    return;
  }
  
  // Load existing infos
  infoOpName.value = reportInfo.opName || '';
  infoOpDate.value = reportInfo.opDate || '';
  infoAuthor.value = reportInfo.author || '';
  infoEmail.value = reportInfo.email || '';

  // Generate Sortable List
  printZoneList.innerHTML = '';
  zoneOrder = Array.from(document.querySelectorAll('.report-container > .zone-container'))
                   .map(el => {
                     // Summary span contains an <input> with the zone name
                     const input = el.querySelector('summary .zone-name-input');
                     return input ? input.value.trim() : el.dataset.mainZone;
                   })
                   .filter(Boolean);

  zoneOrder.forEach((zoneName, index) => {
    const li = document.createElement('li');
    li.className = 'zone-drag-item';
    li.draggable = true;
    li.dataset.zone = zoneName;
    
    const isChecked = zonePageBreaks[zoneName] ? 'checked' : '';
    
    li.innerHTML = `
      <div class="zone-drag-handle">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-justify"><path d="M3 12h18"/><path d="M3 18h18"/><path d="M3 6h18"/></svg>
        <span>${zoneName}</span>
      </div>
      <label class="zone-page-break">
        Page break 
        <input type="checkbox" class="cb-page-break" ${isChecked}>
      </label>
    `;

    // Drag events
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragenter', handleDragEnter);
    li.addEventListener('dragleave', handleDragLeave);
    li.addEventListener('dragend', handleDragEnd);

    // Checkbox event
    li.querySelector('.cb-page-break').addEventListener('change', (e) => {
      zonePageBreaks[zoneName] = e.target.checked;
    });

    printZoneList.appendChild(li);
  });

  printManagerOverlay.classList.add('active');
}

function closePrintManager() {
  printManagerOverlay.classList.remove('active');
}

// Drag & Drop specific logic for the list
let draggedItem = null;

function handleDragStart(e) {
  draggedItem = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
  setTimeout(() => this.classList.add('dragging'), 0);
}

function handleDragOver(e) {
  if (e.preventDefault) { e.preventDefault(); }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) { this.classList.add('over'); }
function handleDragLeave(e) { this.classList.remove('over'); }

function handleDrop(e) {
  if (e.stopPropagation) { e.stopPropagation(); }
  if (draggedItem !== this) {
    const list = document.getElementById('printZoneList');
    const items = Array.from(list.children);
    const draggedIndex = items.indexOf(draggedItem);
    const targetIndex = items.indexOf(this);

    if (draggedIndex < targetIndex) {
      list.insertBefore(draggedItem, this.nextSibling);
    } else {
      list.insertBefore(draggedItem, this);
    }
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.zone-drag-item').forEach(item => item.classList.remove('over'));
}

btnPrint.addEventListener('click', openPrintManager);
btnClosePrintManager.addEventListener('click', closePrintManager);

btnGeneratePdf.addEventListener('click', () => {
  // Save global infos
  reportInfo.opName = infoOpName.value;
  reportInfo.opDate = infoOpDate.value;
  reportInfo.author = infoAuthor.value;
  reportInfo.email = infoEmail.value;

  // Reorder DOM based on List
  const reportContainer = document.getElementById('reportContainer');
  const items = Array.from(printZoneList.children);
  
  items.forEach(item => {
    const zoneName = item.dataset.zone;
    const zoneContainers = Array.from(document.querySelectorAll('.report-container > .zone-container'));
    const targetContainer = zoneContainers.find(c => {
      const input = c.querySelector('summary .zone-name-input');
      return (input ? input.value.trim() : c.dataset.mainZone) === zoneName;
    });
    
    if (targetContainer) {
      reportContainer.appendChild(targetContainer);
      if (zonePageBreaks[zoneName]) {
        targetContainer.classList.add('force-page-break');
      } else {
        targetContainer.classList.remove('force-page-break');
      }
    }
  });

  // Populate Print Header/Footer
  document.getElementById('printOpName').textContent = reportInfo.opName || '';
  document.getElementById('printOpDate').textContent = reportInfo.opDate || '';
  document.getElementById('printAuthor').textContent = reportInfo.author || '';
  document.getElementById('printEmail').textContent = reportInfo.email || '';
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR');
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('printCreationDate').textContent = `Créé le ${dateStr} à ${timeStr}`;

  // Apply export options as body classes
  const hideName  = !document.getElementById('cbExportName')?.checked;
  const hideNotes = !document.getElementById('cbExportNotes')?.checked;
  const cleanMode = document.getElementById('cbExportClean')?.checked;

  document.body.classList.toggle('print-hide-name',  hideName);
  document.body.classList.toggle('print-hide-notes', hideNotes);
  document.body.classList.toggle('print-clean',      cleanMode);

  closePrintManager();
  setTimeout(async () => {
    // Force all zones open for printing
    const allDetails = Array.from(document.querySelectorAll('details.zone-details'));
    const prevOpenStates = allDetails.map(d => d.open);
    allDetails.forEach(d => { d.open = true; });

    // Small delay to let browser render the newly opened content
    setTimeout(async () => {
      if (window.electronFS && typeof window.electronFS.invoke === 'function') {
        const defaultFilename = `Report_${reportInfo.opName.replace(/\s+/g, '_') || 'Coordination'}_${dateStr.replace(/\//g, '-')}.pdf`;
        try {
          const res = await window.electronFS.invoke('export-pdf', { defaultFilename });
          if (res && res.error) {
            alert("Export failed: " + res.error);
          }
        } catch (err) {
          alert("Native PDF Export error: " + err.message);
        }
      } else {
        alert("Erreur de connexion interne. Veuillez redémarrer l'application.");
      }
      allDetails.forEach((d, i) => { d.open = prevOpenStates[i]; });
      document.body.classList.remove('print-hide-name', 'print-hide-notes', 'print-clean');
    }, 250);
  }, 300);
});

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('node_rf_theme', currentTheme);
  updateThemeIcon();
}
btnThemeToggle.addEventListener('click', toggleTheme);

let zoneOpenState = {}; // zoneName -> bool

/**
 * Updates the global Expand/Collapse All button icon based on the current view's state.
 * points OUTWARDS (up-down) if all are collapsed.
 * points INWARDS (down-up) if any are expanded.
 */
window.updateGlobalExpandIcon = function() {
  const btn = document.getElementById('btnToggleExpand');
  if (!btn) return;
  
  const isInventory = document.getElementById('inventoryView').classList.contains('active');
  let anyOpen = false;
  
  if (isInventory) {
    const accordions = document.querySelectorAll('.zone-accordion');
    anyOpen = Array.from(accordions).some(a => a.classList.contains('is-expanded'));
  } else {
    anyOpen = isAnyEventExpanded();
  }

  // chevrons-down-up: INWARDS (indicating click will collapse)
  const collapseIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-down-up"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>`;
  // chevrons-up-down: OUTWARDS (indicating click will expand)
  const expandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-up-down"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`;
  
  btn.innerHTML = anyOpen ? collapseIcon : expandIcon;
};

const btnToggleExpand = document.getElementById('btnToggleExpand');
if (btnToggleExpand) {
  btnToggleExpand.addEventListener('click', () => {
    const isInventory = document.getElementById('inventoryView').classList.contains('active');
    
    if (isInventory) {
      const accordions = document.querySelectorAll('.zone-accordion');
      const anyOpen = Array.from(accordions).some(a => a.classList.contains('is-expanded'));
      const newState = !anyOpen;
      
      // Update persistent state for all zones
      parsedZones.forEach(zone => {
        zoneOpenState[zone.name] = newState;
      });
      
      // Full re-render to reflect new expanded/collapsed state and icons
      renderReport();
    } else {
      toggleAllEvents();
    }
    window.updateGlobalExpandIcon();
  });
}

btnToggleEdit.addEventListener('click', () => {
  sharedState.isEditMode = !sharedState.isEditMode;
  applyEditMode();
  renderReport();
});

function applyEditMode() {
  document.body.classList.toggle('edit-mode', sharedState.isEditMode);
  btnToggleEdit.classList.toggle('active', sharedState.isEditMode);
  if (!sharedState.isEditMode) {
      document.body.classList.remove('minimap-open');
  }
}

// Lock Mode Logic
const btnGlobalLock = document.getElementById('btnGlobalLock');
let isLocked = localStorage.getItem('node_rf_locked') === 'true';

function updateLockUI() {
  sharedState.isLocked = isLocked;
  document.body.classList.toggle('is-locked', isLocked);
  
  if (btnGlobalLock) {
    const lockOpenIcon = btnGlobalLock.querySelector('.lock-open-icon');
    const lockIcon = btnGlobalLock.querySelector('.lock-icon');
    if (lockOpenIcon && lockIcon) {
      lockOpenIcon.style.display = isLocked ? 'none' : 'block';
      lockIcon.style.display = isLocked ? 'block' : 'none';
    }
    btnGlobalLock.classList.toggle('active', isLocked);
  }
}

// Initial state
updateLockUI();

if (btnGlobalLock) {
  btnGlobalLock.addEventListener('click', () => {
    isLocked = !isLocked;
    localStorage.setItem('node_rf_locked', String(isLocked));
    updateLockUI();
  });
}

// Share the function with assignments.js to avoid circular imports
sharedState.applyEditMode = applyEditMode;

// Mini-Map Toggle Logic
const btnOpenMinimap = document.getElementById('btnOpenMinimap');

if (btnOpenMinimap) {
  btnOpenMinimap.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = document.body.classList.toggle('minimap-open');
    if (isOpen) renderMiniMap();
  });
}

// Click outside to close layout bubble
document.addEventListener('mousedown', (e) => {
  const bubble = document.getElementById('editMinimap');
  const btn = document.getElementById('btnOpenMinimap');
  if (document.body.classList.contains('minimap-open')) {
    if (bubble && !bubble.contains(e.target) && btn && !btn.contains(e.target)) {
      document.body.classList.remove('minimap-open');
    }
  }
});


// ROBUST DRAG AND DROP
let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (e.dataTransfer.types.includes('Files')) {
    dragCounter++;
    dragDropOverlay.style.display = 'flex';
  }
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    dragDropOverlay.style.display = 'none';
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault(); e.stopPropagation();
});

window.addEventListener('drop', (e) => {
  e.preventDefault(); e.stopPropagation();
  dragCounter = 0;
  dragDropOverlay.style.display = 'none';
  if (e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// Dropdown Toggle
btnFileMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const rect = btnFileMenu.getBoundingClientRect();
  fileDropdown.style.top = `${rect.bottom}px`;
  fileDropdown.style.left = `${rect.left}px`;
  fileDropdown.classList.toggle('show');
});

window.addEventListener('click', () => {
  fileDropdown.classList.remove('show');
});

// Menu Actions
btnMenuLoadCsv.addEventListener('click', () => fileInput.click());
btnMenuSaveSession.addEventListener('click', () => btnSaveSession.click());
btnMenuLoadSession.addEventListener('click', () => btnLoadSession.click());
btnMenuExportPdf.addEventListener('click', () => openPrintManager());
const btnMenuNewSession = document.getElementById('btnMenuNewSession');
if (btnMenuNewSession) {
  btnMenuNewSession.addEventListener('click', () => {
    if (confirm("Create a new session? All unsaved changes will be lost.")) {
      resetAllData();
      fileDropdown.classList.remove('show');
    }
  });
}

fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

// Session Save
const btnSaveSession = document.createElement('button'); // Hidden trigger for existing logic
btnSaveSession.addEventListener('click', () => {
  const sessionData = { 
    parsedZones, rfStates, rfNotes, rfNames, customFreqs, customFreqData, 
    activeBackups, reportInfo, zoneColors,
    assignments: getAssignmentState(),
    fileName: fileNameDisplay.textContent 
  };
  const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RF_Session_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Session Load Logic
async function loadSessionData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    parsedZones = data.parsedZones || [];
    rfStates = data.rfStates || {};
    rfNotes = data.rfNotes || {};
    rfNames = data.rfNames || {};
    customFreqs = data.customFreqs || [];
    customFreqData = data.customFreqData || {};
    activeBackups = data.activeBackups || {};
    zoneColors = data.zoneColors || {};
    reportInfo = data.reportInfo || { opName: '', opDate: '', author: '', email: '' };
    if (data.assignments) {
      setAssignmentState(data.assignments);
      switchView(getAssignmentsLastView() || 'inventory');
    } else {
      clearAssignments();
    }
    await TemplateDrawer.refreshQuickAccess();
    fileNameDisplay.textContent = data.fileName || "Session Loaded";
    renderReport();
  } catch (err) {
    alert("Erreur lors du chargement de la session (JSON invalide).");
  }
}

const btnLoadSession = document.createElement('button'); // Hidden trigger for existing logic
btnLoadSession.addEventListener('click', () => sessionFileInput.click());
sessionFileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    const reader = new FileReader();
    reader.onload = (event) => loadSessionData(event.target.result);
    reader.readAsText(e.target.files[0]);
  }
});

// Initialization
document.documentElement.setAttribute('data-theme', currentTheme);

// Initialisation effectuée UNE SEULE FOIS
const handleSearch = debounce((e) => {
  const q = e.target.value.trim();
  if (!q) {
    renderReport();
    return;
  }

  // Detect and harmonize frequency queries
  const isFrequencyQuery = /[\d]+[.,][\d]/.test(q);
  const normalizedQ = q.replace(/,/g, '.');
  
  let results = [];
  if (isFrequencyQuery) {
    // Ephemeral strict instance for frequency matching
    const data = flattenStoreForSearch();
    const strictFuse = new Fuse(data, { ...FUSE_BASE_OPTIONS, threshold: 0.05 });
    results = strictFuse.search(normalizedQ);
  } else {
    // Cached flexible instance for text matching
    const fuse = getFuseIndex();
    results = fuse.search(normalizedQ);
  }

  const filtered = results.map(r => r.item);
  renderReport(filtered);
}, 200);

searchInput.addEventListener('input', handleSearch);

function resetAllData() {
  parsedZones = [];
  rfStates = {};
  rfNotes = {};
  rfNames = {};
  customFreqs = [];
  customFreqData = {};
  activeBackups = {};
  zoneColors = {};
  customZoneNames = {};
  mainZoneOrder = [];
  zoneOpenState = {};
  reportInfo = { opName: '', opDate: '', author: '', email: '' };
  fileNameDisplay.textContent = 'No file selected';
  currentCsvFilePath = null;
  
  clearAssignments();
  renderReport();
  switchView('inventory');
  localStorage.removeItem('node_rf_autosave');
  autosave();
}

function handleFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    fileNameDisplay.textContent = file.name;
    // Electron provides file.path for files from the filesystem
    currentCsvFilePath = file.path || null;
    const reader = new FileReader();
    reader.onload = async (e) => {
      clearAssignments();
      parseWWB6CSV(e.target.result);
      renderReport();
      await TemplateDrawer.refreshQuickAccess();
    };
    reader.readAsText(file);
  } else if (name.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = (e) => loadSessionData(e.target.result);
    reader.readAsText(file);
  } else {
    alert('Format de fichier non supporté. Veuillez utiliser un .csv ou .json (Session).');
  }
}

function parseWWB6CSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  parsedZones = [];
  let currentZone = null;
  let currentGroup = null; 
  let currentSubgroup = null; 
  let headerMap = {};
  
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    const row = rawLine.split(',').map(s => s.replace(/^"|"$/g, '').trim());
    
    if (row[0] && row[0].startsWith('RF Zone:')) {
      currentZone = { name: row[0].replace('RF Zone:', '').trim(), groups: [] };
      parsedZones.push(currentZone);
      currentGroup = null;
      continue;
    }
    
    if (!currentZone) continue;
    
    if (row[0].startsWith('Active Channels') || row[0].startsWith('Backup Frequencies')) {
      currentGroup = { name: row[0], subgroups: [] };
      currentZone.groups.push(currentGroup);
      currentSubgroup = null;
      continue;
    }
    
    if (!currentGroup) continue;
    
    if (row[0] === 'Series' || row[0] === 'Channel Name') {
      headerMap = { ChannelName: row.indexOf('Channel Name'), Series: row.indexOf('Series'), Band: row.indexOf('Band') };
      continue;
    }
    
    if (row[0] && !row[1] && !row[2] && row[0].includes('(') && row[0].includes(')')) {
      currentSubgroup = { name: row[0], rows: [] };
      currentGroup.subgroups.push(currentSubgroup);
      continue;
    }
    
    if (row[0].startsWith('Created on') || row[0].startsWith('Generated using')) continue;
    
    if (row[0] && row[1]) {
      if (!currentSubgroup) { currentSubgroup = { name: 'Devices', rows: [] }; currentGroup.subgroups.push(currentSubgroup); }
      
      let freqString = "";
      let mhzIndex = -1;
      for (let j = 0; j < row.length; j++) {
        if (row[j].endsWith('MHz')) {
          mhzIndex = j;
          freqString = row[j-1] ? `${row[j-1]},${row[j]}` : row[j];
          break;
        }
      }
      
      let groupChanString = ""; if (mhzIndex > 1) groupChanString = row[mhzIndex - 2] || "";
      const getVal = (idx) => idx !== -1 && row[idx] ? row[idx] : "";
      const channelName = getVal(headerMap.ChannelName);
      
      const parsedRow = {
        id: generateId(currentZone.name, freqString, channelName),
        channelName: channelName,
        series: getVal(headerMap.Series),
        band: getVal(headerMap.Band),
        groupChannel: groupChanString,
        frequency: freqString,
        isSpare: channelName.toLowerCase().includes('spare'),
        isCustom: false
      };
      currentSubgroup.rows.push(parsedRow);
    }
  }
}

function addCustomRow(zoneName, groupName, subgroupName) {
  const newId = 'custom-' + Date.now();
  customFreqs.push({ id: newId, zoneName, groupName, subgroupName, isCustom: true });
  customFreqData[newId] = { frequency: '', channelName: '', series: '', band: '', groupChannel: '' };
  renderReport();
}

function renderReport(filteredItems = null) {
  reportContainer.innerHTML = '';
  let renderZones = [];

  if (filteredItems) {
    // ─── Filtered Mode (Search Results) ───
    filteredItems.forEach(item => {
      let zone = renderZones.find(z => z.name === item.zone);
      if (!zone) { zone = { name: item.zone, groups: [] }; renderZones.push(zone); }
      
      let group = zone.groups.find(g => g.name === item.group);
      if (!group) { group = { name: item.group, subgroups: [] }; zone.groups.push(group); }
      
      let subgroup = group.subgroups.find(sg => sg.name === item.subgroup);
      if (!subgroup) { subgroup = { name: item.subgroup, rows: [] }; group.subgroups.push(subgroup); }
      
      // We pass the row item as is
      subgroup.rows.push(item);
    });
  } else {
    // ─── Standard Mode (Full Inventory) ───
    renderZones = JSON.parse(JSON.stringify(parsedZones));

    if (renderZones.length === 0 && customFreqs.length > 0) {
        const zones = [...new Set(customFreqs.map(c => c.zoneName))];
        zones.forEach(zn => renderZones.push({ name: zn, groups: [] }));
    }

    renderZones.forEach(zone => {
      let obsGroup = zone.groups.find(g => g.name.includes('Observations'));
      if (!obsGroup) {
        obsGroup = { name: 'Observations', subgroups: [{ name: 'Divers / Manuel', rows: [] }] };
        zone.groups.push(obsGroup);
      }
    });

    customFreqs.forEach(cf => {
      let targetZone = renderZones.find(z => z.name === cf.zoneName);
      if (!targetZone) { targetZone = { name: cf.zoneName, groups: [] }; renderZones.push(targetZone); }
      
      let targetGroup = targetZone.groups.find(g => g.name === cf.groupName);
      if (!targetGroup) {
        targetGroup = { name: cf.groupName || 'Manual Observations', subgroups: [] };
        targetZone.groups.push(targetGroup);
      }
      
      let targetSubgroup = targetGroup.subgroups.find(sg => sg.name === cf.subgroupName);
      if (!targetSubgroup) {
          targetSubgroup = { name: cf.subgroupName || 'Active', rows: [] };
          targetGroup.subgroups.push(targetSubgroup);
      }
      targetSubgroup.rows.push(cf);
    });
  }

  if (renderZones.length === 0) {
    reportContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted); margin-top: 40px;">No data. Drop a CSV or Session file here.</p>';
    return;
  }
  
  // Sort zones according to mainZoneOrder
  if (mainZoneOrder.length > 0) {
      renderZones.sort((a, b) => {
          let idxA = mainZoneOrder.indexOf(a.name);
          let idxB = mainZoneOrder.indexOf(b.name);
          if (idxA === -1) idxA = 999;
          if (idxB === -1) idxB = 999;
          return idxA - idxB;
      });
  }

  const show = { Series: true, Band: true };

  renderZones.forEach(zone => {
    const zoneDiv = document.createElement('div');
    zoneDiv.className = 'zone-container';
    zoneDiv.dataset.mainZone = zone.name;

    // Assign / Resolve zone color
    if (!zoneColors[zone.name]) {
        // Find current index to pick an auto color
        const zIdx = renderZones.indexOf(zone);
        zoneColors[zone.name] = EVENT_PALETTE[zIdx % EVENT_PALETTE.length];
    }
    zoneDiv.style.setProperty('--zone-color', zoneColors[zone.name]);
    
    const accordion = document.createElement('div');
    accordion.className = 'zone-accordion';
    const isExpanded = (zoneOpenState[zone.name] !== undefined) ? zoneOpenState[zone.name] : true;
    if (isExpanded) accordion.classList.add('is-expanded');

    const header = document.createElement('div');
    header.className = 'zone-accordion__header';
    let displayedName = customZoneNames[zone.name] || zone.name;
    
    const updateZoneChevron = () => {
      const expanded = accordion.classList.contains('is-expanded');
      const chevron = expanded 
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>`;
      
      header.innerHTML = `<span>
          <div class="zone-chevron">${chevron}</div>
          <div class="zone-color-dot" style="width:14px;height:14px;border-radius:50%;background:var(--zone-color);cursor:pointer;flex-shrink:0;"></div>
          <input type="text" class="zone-name-input" data-original-name="${zone.name}" value="${displayedName}" ${!sharedState.isEditMode ? 'readonly tabindex="-1"' : ''}>
      </span>`;
      
      const colorDot = header.querySelector('.zone-color-dot');
      colorDot.addEventListener('click', (e) => {
          e.stopPropagation();
          openZoneColorPicker(e, zone.name, colorDot);
      });

      const nameInput = header.querySelector('.zone-name-input');
      nameInput.addEventListener('click', (e) => e.stopPropagation());
    };

    updateZoneChevron();
    
    header.addEventListener('click', () => {
        accordion.classList.toggle('is-expanded');
        zoneOpenState[zone.name] = accordion.classList.contains('is-expanded');
        updateZoneChevron();
        window.updateGlobalExpandIcon();
    });
    
    accordion.appendChild(header);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'zone-accordion__content';
     zone.groups.forEach(group => {
       group.subgroups.forEach(subgroup => {
         // Create a wrapper for the entire subsection to handle conditional visibility
         const subsectionWrapper = document.createElement('div');
         subsectionWrapper.className = 'subsection-container';
         if (subgroup.rows.length === 0) subsectionWrapper.classList.add('subgroup-empty');

         const subTitle = document.createElement('div');
         subTitle.className = 'subsection-title';
         subTitle.textContent = `${group.name} — ${subgroup.name}`;
         subsectionWrapper.appendChild(subTitle);
         
         const table = document.createElement('table');
         const thead = document.createElement('thead');
        
        let thHtml = `<tr>`;
        if (show.Series) thHtml += `<th>Model</th>`;
        if (show.Band) thHtml += `<th style="width:80px">Band</th>`;
        thHtml += `<th style="width:150px">Frequency</th>`;
        thHtml += `<th class="th-name col-Name">Name</th><th class="col-Status">STATUS</th><th class="th-notes col-Notes">NOTES</th></tr>`;
        thead.innerHTML = thHtml;
        table.appendChild(thead);
        
        const tbody = document.createElement('tbody');
        subgroup.rows.forEach(r => {
          
          let currentStatus = rfStates[r.id] || 0;
          let isMirror = false;
          let isAssignedBackup = false;
          let activeAssignerId = null;
          
          // Check if this row is a backup assigned to someone else
          for (let activeId in activeBackups) {
              if (activeBackups[activeId] === r.id) {
                  isAssignedBackup = true;
                  activeAssignerId = activeId;
                  break;
              }
          }

          const tr = document.createElement('tr');
          tr.dataset.rowId = r.id;
          if (r.isCustom) tr.classList.add('row-custom');
          if (isAssignedBackup) tr.classList.add('status-backup');
          else if (currentStatus > 0) tr.classList.add(stateClasses[currentStatus]);

        let tdHtml = '';
          if (show.Series) {
            if (r.isCustom) tdHtml += `<td><input type="text" class="row-input custom-field" value="${customFreqData[r.id]?.series || ''}" placeholder="Model..." data-field="series" data-id="${r.id}"></td>`;
            else tdHtml += `<td>${r.series || '--'}</td>`;
          }
          if (show.Band) {
            if (r.isCustom) tdHtml += `<td><input type="text" class="row-input custom-field" value="${customFreqData[r.id]?.band || ''}" placeholder="Band..." data-field="band" data-id="${r.id}"></td>`;
            else tdHtml += `<td>${r.band || '--'}</td>`;
          }
          if (r.isCustom) {
            tdHtml += `<td class="col-Frequency"><div class="freq-input-wrapper"><input type="text" class="row-input freq-only" value="${customFreqData[r.id]?.frequency || ''}" placeholder="000,000" data-field="frequency" data-id="${r.id}"><span class="mhz-label">MHz</span></div></td>`;
          } else {
            tdHtml += `<td class="col-Frequency">${r.frequency}</td>`;
          }
          let currentName = rfNames[r.id] ?? (r.isCustom ? (customFreqData[r.id]?.channelName ?? '') : (r.channelName ?? ''));
          let savedNote = rfNotes[r.id] ?? '';
          
          let spareBadge = (!r.isCustom && r.isSpare && !isAssignedBackup) ? `<span class="flag-badge" style="color:#fbbf24;border-color:#fbbf24;">Spare</span>` : '';
          
          if (isAssignedBackup) {
             let assignerName = rfNames[activeAssignerId] ?? 'Muted Channel';
             currentName = 'Used for : ' + assignerName;
             savedNote = rfNotes[activeAssignerId] ?? '';
          }

          tdHtml += `<td class="col-Name"><div style="display:flex;align-items:center;"><input type="text" class="row-input name-input" value="${currentName}" placeholder="" data-id="${r.id}" ${isAssignedBackup?'disabled':''}>${spareBadge}</div></td>`;
          
          // STATUS COLUMN NOW COMES BEFORE NOTES
          tdHtml += `<td class="col-Status"><div class="status-actions">`;
          let alertActive = currentStatus === 1 ? 'active' : '';
          let muteActive = currentStatus === 2 ? 'active' : '';
          tdHtml += `<button class="btn-icon btn-alert ${alertActive}" data-id="${r.id}" title="Alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </button>`;
          tdHtml += `<button class="btn-icon btn-mute ${muteActive}" data-id="${r.id}" title="Mute">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
          </button>`;
          tdHtml += `</div></td>`;
          
          tdHtml += `<td class="col-Notes"><input type="text" class="row-input note-input" value="${savedNote}" placeholder="" data-id="${r.id}" ${isAssignedBackup?'disabled':''}></td>`;

          tr.innerHTML = tdHtml;
          tbody.appendChild(tr);
          
          // Mirror logic creation
          let isEligibleForBackup = !group.name.toLowerCase().includes('backup') && !group.name.toLowerCase().includes('observations');
          if (currentStatus === 2 && isEligibleForBackup) {
             const trMirror = document.createElement('tr');
             trMirror.className = 'row-mirror status-backup';
             
             let backupId = activeBackups[r.id];
             let backupData = null;
             if (backupId) {
                 for (let z of renderZones) {
                     for (let g of z.groups) {
                         for (let sg of g.subgroups) {
                             let found = sg.rows.find(br => br.id === backupId);
                             if (found) { backupData = found; break; }
                         }
                     }
                 }
             }

              let sHtml = `<select class="backup-select ${backupId ? 'stealth-select' : ''}" data-active-id="${r.id}"><option value="">Backup</option>`;
              
              // Gather all spare/backup rows matching exact conditions
              let allBackups = [];
              renderZones.forEach(z => {
                  if (z.name !== zone.name) return; // Must be in same zone
                  
                  z.groups.forEach(g => {
                      if(g.name.includes('Backup') || g.name.includes('Manual')) {
                          g.subgroups.forEach(sg => {
                             sg.rows.forEach(br => {
                                 // Must match series and band
                                 if ((br.series || '') !== (r.series || '')) return;
                                 if ((br.band || '') !== (r.band || '')) return;
                                 
                                 // Cannot use a muted frequency as backup
                                 if (rfStates[br.id] === 2) return;
                                 
                                 let assigned = false;
                                 for (let aid in activeBackups) { if(activeBackups[aid]===br.id && activeBackups[aid] !== backupId) assigned=true; }
                                 if(!assigned) allBackups.push(br);
                             });
                          });
                      }
                  });
              });
              
              allBackups.forEach(b => {
                  let selected = (b.id === backupId) ? 'selected' : '';
                  sHtml += `<option value="${b.id}" ${selected}>${b.frequency}</option>`;
              });
              sHtml += `</select>`;

             let mHtml = '';
             let firstCellPadding = 'class="mirror-indent"';
             
             if (show.Series) mHtml += `<td ${firstCellPadding}>${backupData ? backupData.series : '--'}</td>`;
             if (show.Band) mHtml += `<td ${!show.Series ? firstCellPadding : ''}>${backupData ? backupData.band : '--'}</td>`;
             
             // The frequency column now holds the dropdown selector
             mHtml += `<td ${(!show.Series && !show.Band) ? firstCellPadding : ''}>${sHtml}</td>`;
             
             if (backupData) {
                 mHtml += `<td><div class="mirror-label">${currentName}</div></td>`;
                 mHtml += `<td class="col-Status"></td>`;
                 mHtml += `<td class="col-Notes"><span class="mirror-note">${savedNote}</span></td>`;
             } else {
                 mHtml += `<td></td><td class="col-Status"></td><td class="col-Notes"></td>`;
             }
             
             trMirror.innerHTML = mHtml;
             tbody.appendChild(trMirror);
             
             trMirror.querySelector('select').addEventListener('change', (e) => {
                 if (e.target.value) {
                     activeBackups[r.id] = e.target.value;
                 } else {
                     delete activeBackups[r.id];
                 }
                 renderReport();
             });
          }

          const btnAlert = tr.querySelector('.btn-alert');
          const btnMute = tr.querySelector('.btn-mute');
          if (btnAlert && btnMute) {
              btnAlert.addEventListener('click', () => {
                currentStatus = currentStatus === 1 ? 0 : 1;
                rfStates[r.id] = currentStatus;
                if(currentStatus !== 2 && activeBackups[r.id]) delete activeBackups[r.id];
                renderReport();
              });
              
              btnMute.addEventListener('click', () => {
                if (isAssignedBackup) {
                    // Muting an assigned backup unassigns it
                    if (activeAssignerId) delete activeBackups[activeAssignerId];
                } else {
                    currentStatus = currentStatus === 2 ? 0 : 2;
                    rfStates[r.id] = currentStatus;
                    if(currentStatus !== 2 && activeBackups[r.id]) delete activeBackups[r.id];
                }
                renderReport();
              });
          }

          const nameIn = tr.querySelector('.name-input');
          const noteIn = tr.querySelector('.note-input');
          if (nameIn) nameIn.addEventListener('keydown', (e) => handleVerticalNavigation(e, '.name-input'));
          if (noteIn) noteIn.addEventListener('keydown', (e) => handleVerticalNavigation(e, '.note-input'));
        });
        
        // ADD FREQUENCY BUTTON ROW
        const addTr = document.createElement('tr');
        addTr.className = 'add-row-trigger';
        const addTd = document.createElement('td');
        // Total columns is exactly 6 (Series, Band, Frequency, Name, Status, Notes)
        addTd.colSpan = 6; 
        
        let btnLabel = `+ Add frequency to ${group.name}`;
        if (group.name.includes('Active')) btnLabel = `+ Add active frequency`;
        else if (group.name.includes('Backup')) btnLabel = `+ Add backup frequency`;
        else if (group.name.includes('Manual')) btnLabel = `+ Add note / manual`;
        
        addTd.innerHTML = `<span>${btnLabel}</span>`;
        addTr.appendChild(addTd);
        addTr.addEventListener('click', () => addCustomRow(zone.name, group.name, subgroup.name));
        tbody.appendChild(addTr);
        
         table.appendChild(tbody);
         subsectionWrapper.appendChild(table);
         contentDiv.appendChild(subsectionWrapper);
       });
     });
    accordion.appendChild(contentDiv);
    zoneDiv.appendChild(accordion);
    reportContainer.appendChild(zoneDiv);
  });

  // Listeners
  document.querySelectorAll('.zone-name-input').forEach(input => {
      input.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      input.addEventListener('input', (e) => {
          customZoneNames[e.target.dataset.originalName] = e.target.value;
      });
  });
  document.querySelectorAll('.note-input').forEach(input => { input.addEventListener('input', (e) => { rfNotes[e.target.dataset.id] = e.target.value; }); });
  document.querySelectorAll('.name-input').forEach(input => { 
    input.addEventListener('input', (e) => { 
        const id = e.target.dataset.id; rfNames[id] = e.target.value;
        if (id.startsWith('custom-')) { if (!customFreqData[id]) customFreqData[id] = {}; customFreqData[id].channelName = e.target.value; }
    });
  });
  document.querySelectorAll('.freq-only').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = e.target.dataset.id; let val = e.target.value.replace(/[^0-9.,]/g, ''); e.target.value = val;
      if (!customFreqData[id]) customFreqData[id] = {}; customFreqData[id].frequency = val;
      checkDuplicates();
    });
  });
  document.querySelectorAll('.custom-field').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = e.target.dataset.id; const field = e.target.dataset.field;
      if (!customFreqData[id]) customFreqData[id] = {}; customFreqData[id][field] = e.target.value;
      autosave();
    });
  });

  // Frequency formatting on blur
  document.querySelectorAll('.freq-only').forEach(input => {
    input.addEventListener('blur', (e) => {
      const id = e.target.dataset.id;
      let val = e.target.value.trim();
      if (!val) {
        if (!customFreqData[id]) customFreqData[id] = {};
        customFreqData[id].frequency = '';
        renderReport();
        return;
      }

      // Extract only digits for length check
      let digits = val.replace(/[^0-9]/g, '');
      
      // Strict validation: Clear if < 3 or > 6 digits
      if (digits.length < 3 || digits.length > 6) {
        e.target.value = '';
        if (!customFreqData[id]) customFreqData[id] = {};
        customFreqData[id].frequency = '';
        checkDuplicates();
        autosave();
        renderReport(); // Clear from UI state
        return;
      }

      // Formatting logic
      // Handle dot to comma
      val = val.replace(/\./g, ',');
      
      if (!val.includes(',')) {
        if (digits.length === 6) {
          val = digits.substring(0, 3) + ',' + digits.substring(3);
        } else if (digits.length === 5) {
          val = digits.substring(0, 3) + ',' + digits.substring(3) + '0';
        } else if (digits.length === 4) {
          val = digits.substring(0, 3) + ',' + digits.substring(3) + '00';
        } else if (digits.length === 3) {
          val = digits + ',000';
        }
      } else {
        // Ensure 3 decimals if comma/dot was manually entered
        let parts = val.split(',');
        let major = parts[0];
        let minor = (parts[1] || '') + '000';
        val = major + ',' + minor.substring(0, 3);
      }

      e.target.value = val;
      if (!customFreqData[id]) customFreqData[id] = {};
      customFreqData[id].frequency = val;
      checkDuplicates();
      autosave();
    });
  });

  // Enter to validate for all row inputs
  document.querySelectorAll('.row-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Specific check for frequency validity before allowing Enter-to-blur
        if (e.target.classList.contains('freq-only')) {
          let digits = e.target.value.replace(/[^0-9]/g, '');
          if (digits.length > 0 && (digits.length < 3 || digits.length > 6)) {
             e.preventDefault();
             return; // Block validation if length is invalid
          }
        }
        e.preventDefault();
        e.target.blur(); // Trigger save & commit
      }
    });
  });
  
  // Autosave on any name / note / freq change
  document.querySelectorAll('.name-input, .note-input, .freq-only').forEach(input => {
    input.addEventListener('input', () => autosave());
  });
  
  checkDuplicates();
  
  // Sync shared state for assignments module
  sharedState.parsedZones  = parsedZones;
  sharedState.rfStates     = rfStates;
  sharedState.rfNames      = rfNames;
  sharedState.rfNotes      = rfNotes;
  sharedState.customFreqs  = customFreqs;
  sharedState.customFreqData = customFreqData;
  sharedState.activeBackups = activeBackups;
  
  // Refresh assignments view if visible
  if (document.getElementById('assignmentView').classList.contains('active')) {
    renderPageCanvas();
  }

  // Autosave current state after each render
  autosave();
}

// ─── STARTUP RESTORE ─────────────────────────────────────────────────────────

// Wire up restore toggle button
const btnMenuRestoreToggle = document.getElementById('btnMenuRestoreToggle');
if (btnMenuRestoreToggle) {
  btnMenuRestoreToggle.addEventListener('click', () => {
    setRestoreEnabled(!isRestoreEnabled());
    fileDropdown.classList.remove('show');
  });
}

// Wire up error modal close button
const btnCloseRestoreError = document.getElementById('btnCloseRestoreError');
if (btnCloseRestoreError) {
  btnCloseRestoreError.addEventListener('click', () => {
    document.getElementById('restoreErrorOverlay')?.classList.remove('active');
  });
}

// On startup: restore if setting is active
if (isRestoreEnabled() && localStorage.getItem('node_rf_autosave')) {
  restoreAutosave();
} else {
  resetAllData();
}

// Update toggle checkmark to match saved state
updateRestoreToggleUI();

// Initialize Assignment Tracker
initAssignments();

// Ensure UI state matches shared state
applyEditMode();
renderReport();


function checkDuplicates() {
  document.querySelectorAll('.freq-conflict').forEach(el => {
    el.classList.remove('freq-conflict');
    el.removeAttribute('title');
  });

  let freqMap = {};
  const freqCells = document.querySelectorAll('.col-Frequency');
  freqCells.forEach(cell => {
      // Ignore dropdown selectors
      if (cell.querySelector('select')) return;
      
      let input = cell.querySelector('input');
      let val = input ? input.value.trim() : cell.textContent.trim();
      val = val.replace(/MHz/gi, '').trim();
      if (!val || val === '000.000' || val.includes('--') || val === '') return;
      
      if (!freqMap[val]) freqMap[val] = [];
      freqMap[val].push(cell);
  });
  
  for (let freq in freqMap) {
      if (freqMap[freq].length > 1) {
          freqMap[freq].forEach(cell => {
              cell.classList.add('freq-conflict');
              cell.title = "⚠️ Conflict: Frequency " + freq + " used " + freqMap[freq].length + " times!";
          });
      }
  }
}

// MINIMAP LOGIC
const minimapZoneList = document.getElementById('minimapZoneList');
if (minimapZoneList) {
  minimapZoneList.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
  });
  minimapZoneList.addEventListener('drop', handleMinimapDrop);
}
let draggedMinimapItem = null;

function renderMiniMap() {
  if (!minimapZoneList) return;
  minimapZoneList.innerHTML = '';
  
  // Use the same ordered list as the main render
  let renderZones = JSON.parse(JSON.stringify(parsedZones));
  if (renderZones.length === 0 && customFreqs.length > 0) {
      const zones = [...new Set(customFreqs.map(c => c.zoneName))];
      zones.forEach(zn => renderZones.push({ name: zn, groups: [] }));
  }
  
  if (mainZoneOrder.length > 0) {
      renderZones.sort((a, b) => {
          let idxA = mainZoneOrder.indexOf(a.name);
          let idxB = mainZoneOrder.indexOf(b.name);
          if (idxA === -1) idxA = 999;
          if (idxB === -1) idxB = 999;
          return idxA - idxB;
      });
  }

  renderZones.forEach((zone, index) => {
    const li = document.createElement('li');
    li.className = 'minimap-item';
    li.draggable = true;
    li.dataset.zone = zone.name;

    // Apply custom zone color
    if (zoneColors[zone.name]) {
        li.style.setProperty('--zone-color', zoneColors[zone.name]);
    }
    
    let displayedName = customZoneNames[zone.name] || zone.name;
    
    // Icon matching main handle
    let handleHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-justify drag-handle"><path d="M3 12h18"/><path d="M3 18h18"/><path d="M3 6h18"/></svg>`;
    
    li.innerHTML = `${handleHtml} <span>${displayedName}</span>`;
    
    li.addEventListener('dragstart', handleMinimapDragStart);
    li.addEventListener('dragover', handleMinimapDragOver);
    li.addEventListener('drop', handleMinimapDrop);
    li.addEventListener('dragenter', handleMinimapDragEnter);
    li.addEventListener('dragleave', handleMinimapDragLeave);
    li.addEventListener('dragend', handleMinimapDragEnd);
    
    minimapZoneList.appendChild(li);
  });
}

const minimapPlaceholder = document.createElement('li');
minimapPlaceholder.className = 'minimap-placeholder';

function handleMinimapDragStart(e) {
  draggedMinimapItem = this;
  e.dataTransfer.effectAllowed = 'move';
  
  const rect = this.getBoundingClientRect();
  minimapPlaceholder.style.height = rect.height + 'px';
  
  setTimeout(() => this.classList.add('dragging'), 0);
}

function handleMinimapDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  if (this === draggedMinimapItem || this === minimapPlaceholder) return false;
  
  const bounding = this.getBoundingClientRect();
  const offset = bounding.y + (bounding.height / 2);
  
  if (e.clientY - offset > 0) {
      this.after(minimapPlaceholder);
  } else {
      this.before(minimapPlaceholder);
  }
  
  return false;
}

function handleMinimapDragEnter(e) { }
function handleMinimapDragLeave(e) { }

function handleMinimapDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  e.preventDefault(); // Disable default ghost snapping animation which causes flicker
  
  if (draggedMinimapItem && minimapPlaceholder.parentNode) {
    // Remove "dragging" state instantly BEFORE moving to ensure layout paints smoothly
    draggedMinimapItem.classList.remove('dragging');
    
    minimapPlaceholder.before(draggedMinimapItem);
    minimapPlaceholder.remove();
    
    // Update mainZoneOrder based on new minimap DOM order
    const list = document.getElementById('minimapZoneList');
    mainZoneOrder = Array.from(list.querySelectorAll('.minimap-item'))
                         .map(li => li.dataset.zone);
    
    // Defer heavy UI render to allow the browser to paint the DOM swap instantly
    requestAnimationFrame(() => {
        renderReport();
    });
  }
  return false;
}

function handleMinimapDragEnd(e) {
  if (draggedMinimapItem) draggedMinimapItem.classList.remove('dragging');
  if (minimapPlaceholder.parentNode) minimapPlaceholder.remove();
  draggedMinimapItem = null;
}

// ─── Sidebar Pages Reordering ───────────────────────────────────────────────
document.addEventListener('pages:reordered', (e) => {
  const { newOrder } = e.detail;
  const pages = Store.getPages();
  const sortedPages = newOrder.map(id => pages.find(p => p.id === id)).filter(Boolean);
  
  if (sortedPages.length > 0) {
    Store.setPages(sortedPages);
    Store._forceNextSnapshot = true;
    Store.save();
  }
});

renderReport();

function openZoneColorPicker(e, zoneName, dot) {
    closeZonePopups();
    const p = document.createElement('div'); p.className = 'color-picker-popup'; p.id = '__zone-color-picker';
    const g = document.createElement('div'); g.className = 'color-grid';
    EVENT_PALETTE.forEach(c => {
        const o = document.createElement('div'); o.className = 'color-opt' + (zoneColors[zoneName] === c ? ' active' : ''); o.style.background = c;
        o.addEventListener('click', () => { 
            zoneColors[zoneName] = c; 
            renderReport(); 
            autosave();
            closeZonePopups(); 
        });
        g.appendChild(o);
    });
    p.appendChild(g); positionPopupZone(p, dot);
    setTimeout(() => document.addEventListener('click', closeZonePopups, { once: true }), 10);
}

function positionPopupZone(el, anchor) {
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth || 300, h = el.offsetHeight || 300;
    let l = r.left; if (l + w > window.innerWidth) l = window.innerWidth - w - 10;
    let t = r.bottom + 5; if (t + h > window.innerHeight) t = r.top - h - 5;
    el.style.position = 'fixed'; el.style.left = `${Math.max(10, l)}px`; el.style.top = `${Math.max(10, t)}px`;
    el.style.zIndex = '3000';
}

function closeZonePopups() {
    document.getElementById('__zone-color-picker')?.remove();
}
// ─── Undo / Redo Orchestration ──────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  const isZ = e.key.toLowerCase() === 'z';
  const isY = e.key.toLowerCase() === 'y';
  const isCtrl = e.ctrlKey || e.metaKey;

  if (!isCtrl || (!isZ && !isY)) return;

  // Focus guard: Don't hijack native undo in text fields
  const active = document.activeElement;
  const isTextEditing = active && (
    active.tagName === 'INPUT' || 
    active.tagName === 'TEXTAREA' || 
    active.isContentEditable
  );
  if (isTextEditing) return;

  e.preventDefault();

  const isRedo = isY || (isZ && e.shiftKey);
  
  Store.isRestoring = true; // Block autosaves during this render
  
  const newState = isRedo ? Store.redo() : Store.undo();

  if (newState) {
    const mainContainer = document.querySelector('.main-content') 
                       || document.querySelector('.content') 
                       || document.body;
    const scrollTop = mainContainer ? mainContainer.scrollTop : 0;

    // Synchronisation des données
    syncStateFromStore(newState);

    const restoredView = Store.__tempRestoredView;

    // Routage inconditionnel basé sur la variable restaurée (Contextual Snapshot)
    if (restoredView === 'inventory' || !restoredView) {
        Store.isRestoring = false; // CRUCIAL : Reset synchrone AVANT le switchView
        
        if (typeof switchView === 'function') switchView('inventory');
        if (typeof renderReport === 'function') renderReport();
        
        // Réveil des templates
        if (typeof TemplateDrawer !== 'undefined' && typeof TemplateDrawer.refreshQuickAccess === 'function') {
            TemplateDrawer.refreshQuickAccess();
        }
    } else {
        // Routage direct vers la page restaurée depuis le snapshot
        if (typeof switchView === 'function') switchView(restoredView);
        
        requestAnimationFrame(async () => {
            if (mainContainer) mainContainer.scrollTop = scrollTop;
            Store.isRestoring = false; // Reset APRÈS la stabilisation du DOM
            
            if (typeof TemplateDrawer !== 'undefined' && typeof TemplateDrawer.refreshQuickAccess === 'function') {
                await TemplateDrawer.refreshQuickAccess();
            }
        });
    }
  } else {
    Store.isRestoring = false;
  }
});
