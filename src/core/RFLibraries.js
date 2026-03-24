/**
 * RFLibraries.js - Database of standard RF components.
 */

export const ANTENNA_LIBRARY = [
  { id: 'shure-ua874', brand: 'Shure', model: 'UA874', type: 'Active Directional', gainSteps: [-6, 0, 6, 12], defaultGain: 0 },
  { id: 'shure-ua864', brand: 'Shure', model: 'UA864', type: 'Active Wallmount', gainSteps: [-20, -10, 0, 10], defaultGain: 0 },
  { id: 'shure-ua860', brand: 'Shure', model: 'UA860', type: 'Passive Omni', gainSteps: [0], defaultGain: 0 },
  { id: 'shure-pa805', brand: 'Shure', model: 'PA805', type: 'Passive Directional', gainSteps: [0], defaultGain: 0 },
  { id: 'senn-ad3700', brand: 'Sennheiser', model: 'AD 3700', type: 'Active Directional', gainSteps: [0], defaultGain: 10 },
  { id: 'senn-a2003', brand: 'Sennheiser', model: 'A 2003', type: 'Passive Directional', gainSteps: [0], defaultGain: 0 },
  { id: 'wisy-lfa', brand: 'Wisycom', model: 'LFA', type: 'Active Omni', gainSteps: [-12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27], defaultGain: 0 },
  { id: 'wisy-adfa', brand: 'Wisycom', model: 'ADFA', type: 'Active Directional', gainSteps: [-12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27], defaultGain: 0 },
  { id: 'generic-passive', brand: 'Generic', model: 'Passive Fin', type: 'Passive', gainSteps: [0], defaultGain: 0 }
];

export const CABLE_LIBRARY = [
  // Attenuation is dB per 100 meters
  { id: 'rg58', label: 'RG58', atten400: 35, atten600: 45, atten800: 55 },
  { id: 'rg213', label: 'RG213', atten400: 15, atten600: 19, atten800: 23 },
  { id: 'rg8', label: 'RG8', atten400: 13, atten600: 16, atten800: 19 },
  { id: 'lmr400', label: 'LMR400', atten400: 8.9, atten600: 10.8, atten800: 12.8 },
  { id: 'lmr600', label: 'LMR600', atten400: 5.6, atten600: 7.2, atten800: 8.5 }
];

/**
 * Interpolates cable attenuation for a specific frequency.
 */
export function getCableLoss(cableId, lengthMeters, frequencyMhz) {
  const cable = CABLE_LIBRARY.find(c => c.id === cableId);
  if (!cable) return 0;

  let dbPer100 = cable.atten600; // default
  if (frequencyMhz <= 400) dbPer100 = cable.atten400;
  else if (frequencyMhz >= 800) dbPer100 = cable.atten800;
  else {
    // Basic linear interpolation
    if (frequencyMhz < 600) {
      const t = (frequencyMhz - 400) / 200;
      dbPer100 = cable.atten400 + t * (cable.atten600 - cable.atten400);
    } else {
      const t = (frequencyMhz - 600) / 200;
      dbPer100 = cable.atten600 + t * (cable.atten800 - cable.atten600);
    }
  }

  return (dbPer100 * lengthMeters) / 100;
}
