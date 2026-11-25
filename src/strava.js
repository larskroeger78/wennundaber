// Fahrt-Aufzeichnung und Export als TCX (fuer Strava-Upload: Aktivitaet hochladen -> Datei waehlen)
// Aufgezeichnet wird etwa einmal pro Sekunde: Zeit, Strecke, Position, Hoehe, Tempo, Watt, Trittfrequenz, Puls.
export class Rec {
  constructor() { this.reset(); }
  reset() { this.s = []; this.t0 = new Date(); this._last = -9; }
  add(t, o) { if (t - this._last < 1) return; this._last = t; this.s.push(Object.assign({ t }, o)); }
  get length() { return this.s.length; }
}
const esc = x => String(x).replace(/[<>&"]/g, '');
const iso = ms => new Date(ms).toISOString();
export function buildTCX(rec, meta) {
  const s = rec.s; if (s.length < 2) return '';
  const t0 = rec.t0.getTime(), last = s[s.length - 1], dist = last.d, secs = Math.max(1, Math.round(last.t));
  let maxHr = 0, sumHr = 0, nHr = 0, maxV = 0;
  for (const p of s) { if (p.hr > 0) { sumHr += p.hr; nHr++; if (p.hr > maxHr) maxHr = p.hr; } if (p.v > maxV) maxV = p.v; }
  const pts = s.map(p => '<Trackpoint><Time>' + iso(t0 + p.t * 1000) + '</Time>' +
    (p.lat != null ? '<Position><LatitudeDegrees>' + p.lat.toFixed(6) + '</LatitudeDegrees><LongitudeDegrees>' + p.lon.toFixed(6) + '</LongitudeDegrees></Position>' : '') +
    '<AltitudeMeters>' + (p.alt || 0).toFixed(1) + '</AltitudeMeters><DistanceMeters>' + p.d.toFixed(1) + '</DistanceMeters>' +
    (p.hr > 0 ? '<HeartRateBpm><Value>' + Math.round(p.hr) + '</Value></HeartRateBpm>' : '') +
    (p.cad > 0 ? '<Cadence>' + Math.round(p.cad) + '</Cadence>' : '') +
    '<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Speed>' + (p.v || 0).toFixed(2) + '</Speed><Watts>' + Math.max(0, Math.round(p.w || 0)) + '</Watts></TPX></Extensions></Trackpoint>').join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">' +
    '<Activities><Activity Sport="Biking"><Id>' + iso(t0) + '</Id><Lap StartTime="' + iso(t0) + '"><TotalTimeSeconds>' + secs + '</TotalTimeSeconds><DistanceMeters>' + dist.toFixed(1) + '</DistanceMeters>' +
    '<MaximumSpeed>' + maxV.toFixed(2) + '</MaximumSpeed><Calories>0</Calories>' +
    (nHr ? '<AverageHeartRateBpm><Value>' + Math.round(sumHr / nHr) + '</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>' + maxHr + '</Value></MaximumHeartRateBpm>' : '') +
    '<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>' + pts + '</Track></Lap>' +
    '<Notes>' + esc(meta && meta.name || 'MIWORU') + ' (virtuelle Fahrt)</Notes></Activity></Activities></TrainingCenterDatabase>';
}
export function downloadTCX(rec, meta) {
  const x = buildTCX(rec, meta); if (!x) return false;
  const name = ((meta && meta.name) || 'MIWORU').replace(/[^A-Za-z0-9_-]+/g, '_') + '_' + rec.t0.toISOString().slice(0, 10) + '.tcx';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([x], { type: 'application/vnd.garmin.tcx+xml' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return true;
}
