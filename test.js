import fs from 'fs';

const csvText = fs.readFileSync('d:/Utilisateur/Documents/Sites_web/Coordination Report/Report.csv', 'utf8');

const lines = csvText.split(/\r?\n/);
let parsedZones = [];

let currentZone = null;
let currentGroup = null; 
let currentSubgroup = null; 
let headerMap = {};

for (let i = 0; i < lines.length; i++) {
  const rawLine = lines[i].trim();
  if (!rawLine) continue;
  
  const row = rawLine.split(',').map(s => s.replace(/^"|"$/g, '').trim());
  
  if (row[0] && row[0].startsWith('RF Zone:')) {
    currentZone = { 
      name: row[0].replace('RF Zone:', '').trim(),
      groups: []
    };
    parsedZones.push(currentZone);
    currentGroup = null;
    continue;
  }
  
  if (!currentZone) continue;
  
  if (row[0].startsWith('Active Channels') || row[0].startsWith('Backup Frequencies')) {
    currentGroup = {
      name: row[0],
      subgroups: []
    };
    currentZone.groups.push(currentGroup);
    currentSubgroup = null;
    continue;
  }
  
  if (!currentGroup) continue;
  
  if (row[0] === 'Series' || row[0] === 'Channel Name') {
    headerMap = {
      ChannelName: row.indexOf('Channel Name'),
      Series: row.indexOf('Series'),
      Band: row.indexOf('Band'),
      Source: row.indexOf('Source')
    };
    continue;
  }
  
  if (row[0] && !row[1] && !row[2] && row[0].includes('(') && row[0].includes(')')) {
    currentSubgroup = {
      name: row[0],
      rows: []
    };
    currentGroup.subgroups.push(currentSubgroup);
    continue;
  }
  
  // Exclude meaningless metadata lines generated manually
  if (row[0].startsWith('Created on') || row[0].startsWith('Generated using')) continue;
  
  if (row[0] && row[1]) {
    if (!currentSubgroup) {
      currentSubgroup = { name: 'Devices', rows: [] };
      currentGroup.subgroups.push(currentSubgroup);
    }
    
    let freqString = "";
    let mhzIndex = -1;
    for (let j = 0; j < row.length; j++) {
      if (row[j].endsWith('MHz')) {
        mhzIndex = j;
        freqString = row[j-1] ? `${row[j-1]},${row[j]}` : row[j];
        break;
      }
    }
    
    let groupChanString = "";
    if (mhzIndex > 1) {
      groupChanString = row[mhzIndex - 2] || "";
    }
    
    const getVal = (idx) => idx !== -1 && row[idx] ? row[idx] : "";
    
    const parsedRow = {
      channelName: getVal(headerMap.ChannelName),
      series: getVal(headerMap.Series),
      band: getVal(headerMap.Band),
      source: getVal(headerMap.Source),
      groupChannel: groupChanString,
      frequency: freqString,
      isSpare: getVal(headerMap.ChannelName).toLowerCase().includes('spare')
    };
    
    currentSubgroup.rows.push(parsedRow);
  }
}

console.log(JSON.stringify(parsedZones, null, 2));
