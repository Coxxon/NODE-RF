/**
 * RFUtils.js — RF related utility functions
 */
import { sharedState } from './StateProvider.js';

export function getRFInfo(id) {
  if (!id) return null;
  const all = getAllRFChannels();
  const original = all.find(c => c.id === id);
  if (!original) return null;

  // If there's an active backup, use its frequency but keep original name
  const backupId = sharedState.activeBackups[id];
  if (backupId) {
    // Look for backup in all channels (including custom ones)
    const backup = all.find(c => c.id === backupId);
    if (backup) {
      return { 
        ...original, 
        freq: backup.freq || backup.frequency,
        isBackupActive: true 
      };
    }
  }
  return original;
}

export function getAllRFChannels(zoneFilter = null) {
  const rawChannels = [];
  sharedState.parsedZones.forEach(z => {
    if (zoneFilter && z.name !== zoneFilter) return;
    z.groups.forEach(g => g.subgroups.forEach(sg => sg.rows.forEach(r => {
      if (!r.isCustom) {
        rawChannels.push({ 
          id: r.id, 
          freq: r.frequency, 
          name: sharedState.rfNames[r.id] || r.channelName, 
          zone: z.name 
        });
      } else {
        const custom = sharedState.customFreqData[r.id];
        rawChannels.push({
          id: r.id,
          freq: custom?.frequency || '',
          name: sharedState.rfNames[r.id] || custom?.channelName || 'Custom',
          zone: z.name
        });
      }
    })));
  });

  // Resolve backups
  return rawChannels.map(ch => {
    const backupId = sharedState.activeBackups[ch.id];
    if (backupId) {
      const backup = rawChannels.find(b => b.id === backupId);
      if (backup) {
        return { ...ch, freq: backup.freq, isBackupActive: true };
      }
    }
    return ch;
  });
}
