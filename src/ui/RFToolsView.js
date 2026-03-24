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
      passiveLosses: [
        { id: generateUID(), label: 'Connector', value: 0.5 }
      ]
    };
    data.calculations.push(newCalc);
    Store.data.rfTools = data;
    onSave();
    this.render(document.getElementById('rfToolsContent'), onSave);
  },

  createCard(calc, onSave) {
    const card = document.createElement('div');
    card.className = 'power-balance-card';
    
    // Migration: ensure passiveLosses exists
    if (!calc.passiveLosses) {
      calc.passiveLosses = [{ id: generateUID(), label: 'Default Loss', value: calc.passiveLoss || 0 }];
      delete calc.passiveLoss;
    }

    const totalPassive = calc.passiveLosses.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0);
    const cableLoss = getCableLoss(calc.cableId, calc.length, calc.freqMax);
    const totalResult = calc.antennaGain - cableLoss - totalPassive;

    card.innerHTML = `
      <div class="pb-left-section">
        <div class="pb-schematic-area">
          ${this.generateSchematicSVG(calc, cableLoss, totalPassive)}
        </div>
        <div class="pb-graph-area">
          <div class="pb-field-label">Frequency Response (470-694 MHz)</div>
          ${this.generateFrequencySparkline(calc, totalPassive)}
        </div>
      </div>

      <div class="pb-controls-area">
        <div class="pb-row">
          <div class="pb-field-group">
            <label class="pb-field-label">Assigned RF Zone</label>
            <div class="pb-select-wrapper">
              <select class="pb-input pb-zone-select">
                ${sharedState.parsedZones.map(z => `<option value="${z.name}" ${z.name === calc.zoneName ? 'selected' : ''}>${z.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="pb-field-group">
            <label class="pb-field-label">Antenna Model</label>
            <div class="pb-select-wrapper">
              <select class="pb-input pb-antenna-select">
                ${ANTENNA_LIBRARY.map(a => `<option value="${a.id}" ${a.id === calc.antennaId ? 'selected' : ''}>${a.brand} ${a.model}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="pb-row">
          <div class="pb-field-group">
            <label class="pb-field-label">Antenna Gain (dB)</label>
            <input type="number" class="pb-input pb-antenna-gain" value="${calc.antennaGain}" step="1">
          </div>
          <div class="pb-field-group">
            <label class="pb-field-label">Cable Type</label>
            <div class="pb-select-wrapper">
              <select class="pb-input pb-cable-select">
                ${CABLE_LIBRARY.map(c => `<option value="${c.id}" ${c.id === calc.cableId ? 'selected' : ''}>${c.label}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="pb-row">
          <div class="pb-field-group">
            <label class="pb-field-label">Length (meters)</label>
            <input type="number" class="pb-input pb-cable-length" value="${calc.length}" min="0">
          </div>
          <div class="pb-field-group">
            <label class="pb-field-label">Reference Frequency (MHz)</label>
            <input type="number" class="pb-input pb-freq" value="${calc.freqMax}" min="400" max="1000">
          </div>
        </div>

        <div class="pb-passive-section">
          <div class="pb-field-label">Passive Loss Points</div>
          <div class="pb-passive-list">
            ${calc.passiveLosses.map(p => `
              <div class="pb-passive-row" data-id="${p.id}">
                <input type="text" class="pb-input pb-passive-label" value="${p.label}" placeholder="Label">
                <input type="number" class="pb-input pb-passive-value" value="${p.value}" step="0.5" style="width:60px;">
                <button class="btn-pb-remove-loss" title="Remove point">×</button>
              </div>
            `).join('')}
          </div>
          <button class="btn-pb-add-loss">+ ADD POINT</button>
        </div>
      </div>

      <div class="pb-results-area">
        <div class="pb-result-value" style="color:${totalResult >= 0 ? 'var(--primary)' : '#ff4d4d'}">
          ${totalResult > 0 ? '+' : ''}${totalResult.toFixed(1)}
        </div>
        <div class="pb-result-unit">dB TOTAL GAIN</div>
        <div class="pb-result-meta">@ ${calc.freqMax} MHz</div>
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
      
      // Collect passive losses
      calc.passiveLosses = Array.from(card.querySelectorAll('.pb-passive-row')).map(row => ({
        id: row.dataset.id,
        label: row.querySelector('.pb-passive-label').value,
        value: parseFloat(row.querySelector('.pb-passive-value').value) || 0
      }));

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

    card.querySelector('.btn-pb-add-loss').addEventListener('click', () => {
      calc.passiveLosses.push({ id: generateUID(), label: 'New point', value: 0 });
      update();
    });

    card.querySelectorAll('.btn-pb-remove-loss').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.pb-passive-row').dataset.id;
        calc.passiveLosses = calc.passiveLosses.filter(p => p.id !== id);
        update();
      });
    });

    card.querySelector('.btn-pb-delete').addEventListener('click', () => {
      Store.data.rfTools.calculations = Store.data.rfTools.calculations.filter(c => c.id !== calc.id);
      onSave();
      this.render(document.getElementById('rfToolsContent'), onSave);
    });

    return card;
  },

  generateSchematicSVG(calc, cableLoss, totalPassive) {
    const isDark = document.body.classList.contains('dark-theme') || !document.body.classList.contains('light-theme');
    const strokeColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
    const textColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
    const boxStroke = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
    const boxFill = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';

    return `
      <svg width="100%" height="100%" viewBox="0 0 350 120" xmlns="http://www.w3.org/2000/svg">
        <style>
          .s-line { stroke: ${strokeColor}; stroke-width: 1.5; fill: none; }
          .s-text { fill: ${textColor}; font-family: 'Roboto Mono', monospace; font-size: 9px; font-weight: 700; }
          .s-val { fill: var(--primary); font-family: 'Roboto Mono', monospace; font-size: 10px; font-weight: 800; }
          .s-accent { stroke: var(--primary); stroke-width: 2; fill: none; stroke-dasharray: 4 2; }
          .s-box { fill: ${boxFill}; stroke: ${boxStroke}; stroke-width: 1; }
        </style>
        
        <!-- Antenna -->
        <rect x="10" y="40" width="45" height="40" rx="4" class="s-box" />
        <path d="M32.5 40 L32.5 15 M22.5 15 L42.5 15 M27.5 20 L37.5 20" class="s-line" />
        <text x="12" y="94" class="s-text">ANTENNA</text>
        <text x="12" y="106" class="s-val">${calc.antennaGain > 0 ? '+' : ''}${calc.antennaGain} dBi</text>

        <!-- Path (Cable) -->
        <path d="M55 60 L135 60" class="s-accent" />
        <text x="65" y="55" class="s-text" style="font-size:8px;">${calc.length}m ${calc.cableId.toUpperCase()}</text>
        <text x="65" y="72" class="s-val" style="fill:#ff4d4d">-${cableLoss.toFixed(1)} dB</text>

        <!-- Passive Node -->
        <rect x="135" y="40" width="45" height="40" rx="4" class="s-box" />
        <circle cx="157.5" cy="60" r="6" class="s-line" />
        <text x="137" y="94" class="s-text">PASSIVE</text>
        <text x="137" y="106" class="s-val" style="fill:#ff9f43">-${totalPassive.toFixed(1)} dB</text>

        <!-- Final Path -->
        <path d="M180 60 L260 60" class="s-line" />
        <text x="190" y="55" class="s-text" style="font-size:8px;">PATCHING</text>

        <!-- Receiver -->
        <rect x="260" y="40" width="60" height="40" rx="4" class="s-box" />
        <rect x="270" y="50" width="20" height="2" fill="${strokeColor}" opacity="0.3" />
        <rect x="270" y="58" width="30" height="2" fill="${strokeColor}" opacity="0.3" />
        <rect x="270" y="66" width="25" height="2" fill="${strokeColor}" opacity="0.3" />
        <text x="265" y="94" class="s-text">RECEIVER</text>
      </svg>
    `;
  },

  generateFrequencySparkline(calc, totalPassive) {
    const isDark = document.body.classList.contains('dark-theme') || !document.body.classList.contains('light-theme');
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
    
    // Calculate 5 points from 470 to 694
    const freqs = [470, 526, 582, 638, 694];
    const gains = freqs.map(f => {
      const cLoss = getCableLoss(calc.cableId, calc.length, f);
      return calc.antennaGain - cLoss - totalPassive;
    });

    const minGain = Math.min(...gains, -10);
    const maxGain = Math.max(...gains, 10);
    const range = maxGain - minGain;

    const width = 350;
    const height = 60;
    const padding = 10;
    
    const points = gains.map((g, i) => {
      const x = (i / (freqs.length - 1)) * (width - 2 * padding) + padding;
      const y = height - ((g - minGain) / range) * (height - 2 * padding) - padding;
      return `${x},${y}`;
    }).join(' ');

    return `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:rgba(0,0,0,0.1);border-radius:4px;margin-top:6px;">
        <!-- Grid -->
        <line x1="${padding}" y1="0" x2="${padding}" y2="${height}" stroke="${gridColor}" />
        <line x1="${width - padding}" y1="0" x2="${width - padding}" y2="${height}" stroke="${gridColor}" />
        <line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="${gridColor}" />
        
        <!-- Axis Labels -->
        <text x="${padding}" y="${height - 2}" class="s-text" style="fill:${textColor};font-size:7px;">470M</text>
        <text x="${width - padding}" y="${height - 2}" class="s-text" style="fill:${textColor};font-size:7px;text-anchor:end;">694M</text>
        
        <!-- Plot -->
        <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="1.5" />
        ${gains.map((g, i) => {
          const x = (i / (freqs.length - 1)) * (width - 2 * padding) + padding;
          const y = height - ((g - minGain) / range) * (height - 2 * padding) - padding;
          return `<circle cx="${x}" cy="${y}" r="2" fill="var(--primary)" />`;
        }).join('')}
      </svg>
    `;
  }
};
