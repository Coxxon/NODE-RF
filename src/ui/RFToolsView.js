/**
 * RFToolsView.js - Industrial workspace for RF calculations.
 */
import { Store } from '../core/Store.js';
import { sharedState } from '../core/StateProvider.js';
import { ANTENNA_LIBRARY, CABLE_LIBRARY, getCableLoss } from '../core/RFLibraries.js';
import { generateUID } from '../utils.js';

export const RFToolsView = {
  render(container, onSave) {
    if (!container) return;
    const data = Store.data.rfTools || { calculations: [] };
    const zones = sharedState.parsedZones || [];

    if (data.calculations.length === 0) {
      this.renderEmptyState(container, zones, onSave);
      return;
    }

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'rf-tools-container';

    // Group by Zone
    const grouped = {};
    zones.forEach(z => grouped[z.name] = []);
    data.calculations.forEach(calc => {
      const zName = calc.zoneName || 'Unassigned';
      if (!grouped[zName]) grouped[zName] = [];
      grouped[zName].push(calc);
    });

    Object.entries(grouped).forEach(([zoneName, calcs]) => {
      const section = document.createElement('section');
      section.className = 'rf-tools-zone-section';

      section.innerHTML = `
        <header class="rf-tools-zone-header">
          <span>ZONE: ${zoneName}</span>
          <button class="btn-pb-add" data-zone="${zoneName}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            ADD POWER BALANCE
          </button>
        </header>
      `;

      calcs.forEach(calc => {
        const card = this.createCard(calc, onSave);
        section.appendChild(card);
      });

      if (calcs.length > 0 || zoneName !== 'Unassigned') {
          wrapper.appendChild(section);
      }
    });

    container.appendChild(wrapper);

    // Global listeners
    wrapper.querySelectorAll('.btn-pb-add').forEach(btn => {
      btn.addEventListener('click', () => {
        this.addCalculation(btn.dataset.zone, onSave);
      });
    });
  },

  renderEmptyState(container, zones, onSave) {
    container.innerHTML = `
      <div class="rf-tools-container">
        <div class="rf-tools-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.2;margin-bottom:16px;"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>
          <p>No power balance calculations yet.</p>
          <button class="btn primary" id="btnInitPB" style="margin-top:20px;">Create First Calculation</button>
        </div>
      </div>
    `;
    container.querySelector('#btnInitPB')?.addEventListener('click', () => {
      const firstZone = zones[0]?.name || 'Primary';
      this.addCalculation(firstZone, onSave);
    });
  },

  addCalculation(zoneName, onSave) {
    const data = Store.data.rfTools || { calculations: [] };
    const newCalc = {
      id: generateUID(),
      zoneName: zoneName,
      label: 'New Signal Path',
      antennaId: ANTENNA_LIBRARY[0].id,
      antennaGain: ANTENNA_LIBRARY[0].defaultGain,
      cableId: CABLE_LIBRARY[0].id,
      length: 25,
      freqMax: 600,
      passiveLoss: 0
    };
    data.calculations.push(newCalc);
    Store.data.rfTools = data;
    onSave();
    this.render(document.getElementById('rfToolsContent'), onSave);
  },

  createCard(calc, onSave) {
    const card = document.createElement('div');
    card.className = 'power-balance-card';
    
    // Calculate final value
    const cableLoss = getCableLoss(calc.cableId, calc.length, calc.freqMax);
    const totalResult = calc.antennaGain - cableLoss - calc.passiveLoss;

    card.innerHTML = `
      <div class="pb-schematic-area">
        ${this.generateSchematicSVG(calc)}
      </div>
      <div class="pb-controls-area">
        <div class="pb-field-group">
          <label class="pb-field-label">Assigned RF Zone</label>
          <select class="pb-input pb-zone-select">
            ${sharedState.parsedZones.map(z => `<option value="${z.name}" ${z.name === calc.zoneName ? 'selected' : ''}>${z.name}</option>`).join('')}
          </select>
        </div>
        <div class="pb-field-group">
          <label class="pb-field-label">Antenna Model</label>
          <select class="pb-input pb-antenna-select">
            ${ANTENNA_LIBRARY.map(a => `<option value="${a.id}" ${a.id === calc.antennaId ? 'selected' : ''}>${a.brand} ${a.model}</option>`).join('')}
          </select>
        </div>
        <div class="pb-field-group">
          <label class="pb-field-label">Antenna Gain (dB)</label>
          <input type="number" class="pb-input pb-antenna-gain" value="${calc.antennaGain}" step="1">
        </div>
        <div class="pb-field-group">
          <label class="pb-field-label">Cable Type</label>
          <select class="pb-input pb-cable-select">
            ${CABLE_LIBRARY.map(c => `<option value="${c.id}" ${c.id === calc.cableId ? 'selected' : ''}>${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="pb-field-group">
          <label class="pb-field-label">Length (meters)</label>
          <input type="number" class="pb-input pb-cable-length" value="${calc.length}" min="0">
        </div>
        <div class="pb-field-group">
          <label class="pb-field-label">Frequency (MHz)</label>
          <input type="number" class="pb-input pb-freq" value="${calc.freqMax}" min="400" max="1000">
        </div>
        <div class="pb-field-group">
          <label class="pb-field-label">Passive Loss (dB)</label>
          <input type="number" class="pb-input pb-passive" value="${calc.passiveLoss}" step="0.5">
        </div>
      </div>
      <div class="pb-results-area">
        <div class="pb-result-value">${totalResult > 0 ? '+' : ''}${totalResult.toFixed(1)}</div>
        <div class="pb-result-unit">dB TOTAL GAIN</div>
      </div>
      <button class="btn-pb-delete" title="Delete calculation" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text-dim);cursor:pointer;padding:5px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    // Listeners
    const update = () => {
      calc.zoneName = card.querySelector('.pb-zone-select').value;
      calc.antennaId = card.querySelector('.pb-antenna-select').value;
      calc.antennaGain = parseFloat(card.querySelector('.pb-antenna-gain').value) || 0;
      calc.cableId = card.querySelector('.pb-cable-select').value;
      calc.length = parseFloat(card.querySelector('.pb-cable-length').value) || 0;
      calc.freqMax = parseFloat(card.querySelector('.pb-freq').value) || 600;
      calc.passiveLoss = parseFloat(card.querySelector('.pb-passive').value) || 0;
      
      onSave();
      this.render(document.getElementById('rfToolsContent'), onSave);
    };

    card.querySelector('.pb-antenna-select').addEventListener('change', (e) => {
      const lib = ANTENNA_LIBRARY.find(a => a.id === e.target.value);
      if (lib) card.querySelector('.pb-antenna-gain').value = lib.defaultGain;
      update();
    });
    card.querySelectorAll('.pb-input').forEach(input => {
      input.addEventListener('change', update);
    });
    card.querySelector('.btn-pb-delete').addEventListener('click', () => {
      Store.data.rfTools.calculations = Store.data.rfTools.calculations.filter(c => c.id !== calc.id);
      onSave();
      this.render(document.getElementById('rfToolsContent'), onSave);
    });

    return card;
  },

  generateSchematicSVG(calc) {
    // Industrial Blueprint Style
    return `
      <svg width="100%" height="100%" viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sketch-line { stroke: rgba(255,255,255,0.4); stroke-width: 1.5; fill: none; }
          .sketch-text { fill: rgba(255,255,255,0.4); font-family: 'Roboto Mono', monospace; font-size: 8px; font-weight: 700; }
          .accent-line { stroke: var(--primary); stroke-width: 2; fill: none; stroke-dasharray: 4 2; }
          .node-box { fill: var(--bg-surface); stroke: rgba(255,255,255,0.2); stroke-width: 1; }
        </style>
        
        <!-- Antenna -->
        <rect x="20" y="55" width="40" height="40" rx="2" class="node-box" />
        <path d="M40 55 L40 30 M30 30 L50 30 M35 35 L45 35" class="sketch-line" />
        <text x="25" y="110" class="sketch-text">ANTENNA</text>
        <text x="25" y="122" class="sketch-text" style="fill:var(--primary)">${calc.antennaGain}dB</text>

        <!-- Path -->
        <path d="M60 75 L120 75" class="accent-line" />
        <text x="75" y="70" class="sketch-text">${calc.length}m ${calc.cableId.toUpperCase()}</text>

        <!-- Passive/Booster Node -->
        <rect x="120" y="55" width="40" height="40" rx="2" class="node-box" />
        <circle cx="140" cy="75" r="5" class="sketch-line" />
        <text x="120" y="110" class="sketch-text">PASSIVE</text>
        <text x="120" y="122" class="sketch-text" style="fill:#ff9f43">-${calc.passiveLoss}dB</text>

        <!-- Final Path -->
        <path d="M160 75 L220 75" class="sketch-line" />

        <!-- Receiver -->
        <rect x="220" y="55" width="50" height="40" rx="2" class="node-box" />
        <path d="M230 65 H260 M230 75 H260 M230 85 H250" class="sketch-line" opacity="0.3" />
        <text x="225" y="110" class="sketch-text">RECEIVER</text>
      </svg>
    `;
  }
};
