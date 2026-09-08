import { CONFIG } from './config.js';
import { fetchJSON, cache } from './util.js';

// Resolve the configured postcode to { lat, lon, label } once, then cache it
// forever (postcodes don't move). Falls back to a Maidenhead-centre guess.
const FALLBACK = { lat: 51.5225, lon: -0.7176, label: CONFIG.placeLabel };

export async function getCoords() {
  const hit = cache.get('coords2');
  if (hit && hit.value && hit.value.pc === CONFIG.postcode && hit.value.label === (CONFIG.placeLabel || '').toUpperCase()) {
    return hit.value;
  }

  const pc = CONFIG.postcode.replace(/\s+/g, '');
  try {
    const r = await fetchJSON(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if (r && r.result) {
      const out = {
        pc: CONFIG.postcode,
        lat: r.result.latitude,
        lon: r.result.longitude,
        label: (CONFIG.placeLabel || r.result.admin_district || '').toUpperCase(),
      };
      cache.set('coords2', out);
      return out;
    }
  } catch (e) {
    console.warn('postcode lookup failed, using fallback', e);
  }
  return { pc: CONFIG.postcode, ...FALLBACK };
}
