// Weather for an event's days, from Open-Meteo (free, no key, CC BY 4.0):
// the location text is looked up once (geocoding), then the daily forecast for
// the event's dates, up to 16 days ahead. Both are cached on this device.
// Also: links that open a location in Waze or Google Maps.
import Alpine from 'alpinejs';
import { addDays, today } from './dates';
import { N_, t } from './i18n';

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AHEAD_DAYS = 15; // the forecast reaches today + 15
const PLACE_TTL = 30 * 24 * 60 * 60 * 1000;
const FORECAST_TTL = 3 * 60 * 60 * 1000;

// --- Maps ---------------------------------------------------------------------------
export function mapLinks(location) {
    const q = encodeURIComponent(location.trim());
    return {
        waze: `https://waze.com/ul?q=${q}&navigate=yes`,
        google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    };
}

// --- Weather codes (WMO) -> emoji + words ------------------------------------------
const CODES = [
    [[0], '☀️', N_('Sunny')],
    [[1, 2], '🌤️', N_('Partly cloudy')],
    [[3], '☁️', N_('Cloudy')],
    [[45, 48], '🌫️', N_('Foggy')],
    [[51, 53, 55, 56, 57], '🌦️', N_('Drizzle')],
    [[61, 63, 66, 80, 81], '🌧️', N_('Rain')],
    [[65, 67, 82], '🌧️', N_('Heavy rain')],
    [[71, 73, 75, 77, 85, 86], '🌨️', N_('Snow')],
    [[95, 96, 99], '⛈️', N_('Thunderstorms')],
];
export function describe(code) {
    const [, emoji, label] = CODES.find(([codes]) => codes.includes(code)) ?? [[], '🌡️', N_('Weather')];
    return { emoji, label: t(label) };
}

// --- Cache (localStorage; quietly skipped when unavailable) --------------------------
function cached(key, ttl) {
    try {
        const item = JSON.parse(localStorage.getItem(key) ?? 'null');
        return item && Date.now() - item.at < ttl ? item.value : undefined;
    } catch {
        return undefined;
    }
}
function remember(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
    } catch {
        // storage full or blocked: fine, we just look it up again next time
    }
}

/**
 * Coordinates for free text like "Lexis Hibiscus, Port Dickson": the whole
 * text first, then each comma-separated part from the last (usually the
 * town), in Malaysia first. null when nothing matches.
 */
async function place(location) {
    const key = `planly.place.${location.toLowerCase()}`;
    const hit = cached(key, PLACE_TTL);
    if (hit !== undefined) return hit;

    const parts = location.split(',').map((p) => p.trim()).filter(Boolean).reverse();
    const names = [...new Set([location.trim(), ...parts])];
    let found = null;
    search: for (const country of ['MY', null]) {
        for (const name of names) {
            const url = new URL(GEOCODE);
            url.search = new URLSearchParams({ name, count: '1', format: 'json', ...(country ? { countryCode: country } : {}) });
            const response = await fetch(url);
            if (!response.ok) throw new Error(`geocoding ${response.status}`);
            const r = (await response.json()).results?.[0];
            if (r) {
                found = { lat: r.latitude, lon: r.longitude, name: r.name };
                break search;
            }
        }
    }
    remember(key, found);
    return found;
}

async function daily(spot, start, end) {
    const key = `planly.forecast.${spot.lat.toFixed(2)},${spot.lon.toFixed(2)}.${start}.${end}`;
    const hit = cached(key, FORECAST_TTL);
    if (hit !== undefined) return hit;

    const url = new URL(FORECAST);
    url.search = new URLSearchParams({
        latitude: String(spot.lat),
        longitude: String(spot.lon),
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'Asia/Kuala_Lumpur',
        start_date: start,
        end_date: end,
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`forecast ${response.status}`);
    const d = (await response.json()).daily;
    const days = d.time.map((date, i) => ({
        date,
        code: d.weather_code[i],
        max: Math.round(d.temperature_2m_max[i]),
        min: Math.round(d.temperature_2m_min[i]),
        rain: d.precipitation_probability_max[i],
    }));
    remember(key, days);
    return days;
}

/** The days of [start, end] the forecast can cover (today .. today + 15), or null. */
export function forecastWindow(start, end, now = today()) {
    const from = start > now ? start : now;
    const last = addDays(now, AHEAD_DAYS);
    const to = end < last ? end : last;
    return from <= to ? { from, to } : null;
}

// $store.weather.for(event) -> { status: 'loading'|'ready'|'none', place, days } | null
Alpine.store('weather', {
    entries: {},

    for(event) {
        if (!event?.location || event.status !== 'confirmed' || !event.finalDate) return null;
        const range = forecastWindow(event.finalDate, event.finalEndDate ?? event.finalDate);
        if (!range) return null;
        const key = `${event.location}|${range.from}|${range.to}`;
        if (!this.entries[key]) {
            this.entries[key] = { status: 'loading', place: null, days: [] };
            this.load(key, event.location, range);
        }
        return this.entries[key];
    },

    async load(key, location, { from, to }) {
        try {
            const spot = await place(location);
            if (!spot) {
                this.entries[key] = { status: 'none', place: null, days: [] };
                return;
            }
            const days = await daily(spot, from, to);
            this.entries[key] = { status: 'ready', place: spot.name, days };
        } catch (e) {
            console.warn('Weather unavailable:', e);
            this.entries[key] = { status: 'none', place: null, days: [] };
        }
    },

    describe,
});

Alpine.magic('maps', () => mapLinks);
