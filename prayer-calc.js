/* Prayer times, calculated on this PC (no internet): the standard solar-angle method used by most prayer apps.
   times(date, lat, lon, method, asrFactor, tzHours?) -> { fajr, sunrise, dhuhr, asr, maghrib, isha } as Dates (null if the sun never reaches the angle) */
(function (root) {
  const R = Math.PI / 180, D = 180 / Math.PI;
  const sin = (d) => Math.sin(d * R), cos = (d) => Math.cos(d * R), tan = (d) => Math.tan(d * R);
  const asin = (x) => Math.asin(x) * D, acos = (x) => Math.acos(x) * D, atan2 = (y, x) => Math.atan2(y, x) * D, acot = (x) => Math.atan(1 / x) * D;
  const fix = (a, b) => a - b * Math.floor(a / b);
  const METHODS = {
    Morocco: { name: 'Morocco (Habous)', fajr: 19, isha: 17, adj: { sunrise: -3, dhuhr: 5, maghrib: 5 } },
    MWL: { name: 'Muslim World League', fajr: 18, isha: 17 },
    Egypt: { name: 'Egyptian authority', fajr: 19.5, isha: 17.5 },
    Karachi: { name: 'Karachi', fajr: 18, isha: 18 },
    ISNA: { name: 'North America (ISNA)', fajr: 15, isha: 15 },
    UmmAlQura: { name: 'Umm al-Qura (Makkah)', fajr: 18.5, ishaMin: 90 },
  };
  function times(date, lat, lon, method = 'MWL', asr = 1, tzHours) {
    const m = METHODS[method] || METHODS.MWL, adj = m.adj || {};
    const tz = tzHours ?? -date.getTimezoneOffset() / 60;
    const d = (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) - Date.UTC(2000, 0, 1, 12)) / 86400000; // days since J2000
    const g = fix(357.529 + 0.98560028 * d, 360), q = fix(280.459 + 0.98564736 * d, 360);
    const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360), e = 23.439 - 0.00000036 * d;
    const RA = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24), decl = asin(sin(e) * sin(L)), eqt = fix(q / 15 - RA + 12, 24) - 12;
    const noon = 12 + tz - lon / 15 - eqt;
    const T = (ang) => acos((-sin(ang) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    const A = (f) => acos((sin(acot(f + tan(Math.abs(lat - decl)))) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    const sunset = noon + T(0.833);
    const h = {
      fajr: noon - T(m.fajr), sunrise: noon - T(0.833) + (adj.sunrise || 0) / 60, dhuhr: noon + (1 + (adj.dhuhr || 0)) / 60, asr: noon + A(asr),
      sunset, maghrib: sunset + (adj.maghrib || 0) / 60, isha: m.ishaMin ? sunset + m.ishaMin / 60 : noon + T(m.isha),
    };
    // midnight of that day in the chosen zone (this PC's own zone unless tzHours is passed, which tests use)
    const base = tzHours == null ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - tz * 3600000, out = {};
    for (const k in h) out[k] = Number.isFinite(h[k]) ? new Date(base + h[k] * 3600000) : null;
    return out;
  }
  const api = { METHODS, times };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PrayerCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
