// Mobile Menu Toggle
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');

if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        menuToggle.classList.toggle('active');
    });
}

// Close menu when clicking on a link
const navLinks = document.querySelectorAll('.nav-link');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (!navMenu || !menuToggle) return;
        navMenu.classList.remove('active');
        menuToggle.classList.remove('active');
    });
});

// Active navigation link on scroll
const sections = document.querySelectorAll('section[id]');

function scrollActive() {
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');

        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
}

window.addEventListener('scroll', scrollActive);

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 80;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// Fade-in animation removed to ensure content is always visible
// Content visibility is now handled purely by CSS

// FAQ Accordion
document.addEventListener('DOMContentLoaded', () => {
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const isExpanded = question.getAttribute('aria-expanded') === 'true';
            const answer = document.getElementById(question.getAttribute('aria-controls'));
            
            // Close all other FAQ items
            faqQuestions.forEach(q => {
                if (q !== question) {
                    q.setAttribute('aria-expanded', 'false');
                }
            });
            
            // Toggle current item
            question.setAttribute('aria-expanded', !isExpanded);
            
            // Let CSS handle the animation via aria-expanded attribute
            // The max-height is controlled by CSS based on aria-expanded
        });
    });
});

// ============================================================
// DEPREM VE TERMAL HARİTA
// ============================================================
// Güvenlik notları:
// - Bu dosyada hiçbir API anahtarı yoktur ve olmamalıdır (site herkese açık bir depodan yayınlanır).
// - Dış kaynaktan gelen metinler (yer adı vb.) sayfaya yalnızca textContent ile yazılır.
(function () {
    'use strict';

    const mapEl = document.getElementById('map');
    if (!mapEl || typeof L === 'undefined') return;

    const BOUNDS = { minLat: 35, maxLat: 43, minLon: 25, maxLon: 45 };
    const RANGE_HOURS = { '8_hours': 8, '1_day': 24, '7_days': 168 };
    const WORKER_RANGE = { '8_hours': 'last_8_hours', '1_day': 'last_24_hours', '7_days': 'last_7_days' };
    const REFRESH_MS = 90 * 1000;

    const statusEl = document.getElementById('mapStatus');
    const minMagSelect = document.getElementById('minMag');
    const timeRangeSelect = document.getElementById('timeRange');
    const thermalCheckbox = document.getElementById('showFires');
    const refreshBtn = document.getElementById('refreshMap');
    const locateBtn = document.getElementById('locateMe');

    function setStatus(text, isError) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.classList.toggle('map-status-error', Boolean(isError));
    }

    function readPref(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function writePref(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* özel sekme vb. */ }
    }

    function sinceIso(range) {
        const hours = RANGE_HOURS[range] || 24;
        return new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 19);
    }

    // Deprem kaynakları, sırayla denenir. İlk yanıt veren kullanılır.
    const SOURCES = [
        {
            name: 'Kandilli Rasathanesi (KOERI)',
            timeoutMs: 6000,
            url: (range, minMag) =>
                'https://erkenuyar-worker.sonerdnrekhesap.workers.dev/api/earthquakes/tr/recent' +
                `?range=${WORKER_RANGE[range] || 'last_24_hours'}&min_mw=${minMag}&limit=300`,
            parse: (data) => {
                if (!data || data.ok !== true || !Array.isArray(data.items)) throw new Error('bad_format');
                return data.items.map((i) => ({
                    id: i.event_key || i.id,
                    lat: i.lat, lon: i.lon, mag: i.magnitude, depth: i.depth_km,
                    place: i.matched_place || i.raw_place,
                    time: i.occurred_at_utc, magType: i.magnitude_type
                }));
            }
        },
        {
            name: 'EMSC',
            timeoutMs: 12000,
            url: (range, minMag) =>
                'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=500' +
                `&start=${sinceIso(range)}&minmag=${minMag}` +
                `&minlat=${BOUNDS.minLat}&maxlat=${BOUNDS.maxLat}&minlon=${BOUNDS.minLon}&maxlon=${BOUNDS.maxLon}`,
            parse: (data) => {
                if (!data || !Array.isArray(data.features)) throw new Error('bad_format');
                return data.features.map((f) => {
                    const p = f.properties || {};
                    return { id: f.id, lat: p.lat, lon: p.lon, mag: p.mag, depth: p.depth,
                        place: p.flynn_region, time: p.time, magType: p.magtype };
                });
            }
        },
        {
            name: 'USGS',
            timeoutMs: 12000,
            url: (range, minMag) =>
                'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
                `&starttime=${sinceIso(range)}&minmagnitude=${minMag}` +
                `&minlatitude=${BOUNDS.minLat}&maxlatitude=${BOUNDS.maxLat}&minlongitude=${BOUNDS.minLon}&maxlongitude=${BOUNDS.maxLon}`,
            parse: (data) => {
                if (!data || !Array.isArray(data.features)) throw new Error('bad_format');
                return data.features.map((f) => {
                    const p = f.properties || {};
                    const c = (f.geometry && f.geometry.coordinates) || [];
                    return { id: f.id, lat: c[1], lon: c[0], mag: p.mag, depth: c[2],
                        place: p.place, time: p.time, magType: p.magType };
                });
            }
        }
    ];

    function normalize(list) {
        const seen = new Set();
        const out = [];
        for (const raw of list) {
            const eq = {
                id: String(raw.id ?? ''),
                lat: Number(raw.lat), lon: Number(raw.lon), mag: Number(raw.mag),
                depth: Math.abs(Number(raw.depth)),
                place: typeof raw.place === 'string' ? raw.place.slice(0, 120) : '',
                timeMs: typeof raw.time === 'number' ? raw.time : Date.parse(raw.time),
                magType: typeof raw.magType === 'string' ? raw.magType.slice(0, 4) : ''
            };
            if (!Number.isFinite(eq.lat) || !Number.isFinite(eq.lon) || !Number.isFinite(eq.mag)) continue;
            if (!Number.isFinite(eq.timeMs) || eq.timeMs > Date.now() + 5 * 60 * 1000) continue;
            if (eq.lat < BOUNDS.minLat || eq.lat > BOUNDS.maxLat || eq.lon < BOUNDS.minLon || eq.lon > BOUNDS.maxLon) continue;
            if (eq.mag < 0 || eq.mag > 10) continue;
            const key = eq.id || `${eq.lat}|${eq.lon}|${eq.timeMs}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(eq);
        }
        return out.sort((a, b) => b.timeMs - a.timeMs);
    }

    async function fetchJson(url, timeoutMs, outerSignal) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const onOuterAbort = () => controller.abort();
        if (outerSignal) outerSignal.addEventListener('abort', onOuterAbort);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
                credentials: 'omit',
                referrerPolicy: 'no-referrer'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
            if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
        }
    }

    function magnitudeColor(mag) {
        if (mag >= 5.0) return '#d32f2f';
        if (mag >= 4.0) return '#f57c00';
        if (mag >= 3.0) return '#fbc02d';
        return '#1976d2';
    }

    function popupRow(parent, label, value) {
        const row = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        row.appendChild(strong);
        row.appendChild(document.createTextNode(value));
        parent.appendChild(row);
    }

    function createMarker(eq, sourceName) {
        const color = magnitudeColor(eq.mag);
        const magText = eq.mag.toFixed(1);
        const size = 32;
        const icon = L.divIcon({
            html: `<div class="eq-dot" style="background-color:${color};box-shadow:0 2px 6px rgba(0,0,0,.3),0 0 8px ${color}40;">${magText}</div>`,
            className: 'earthquake-marker',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });
        const marker = L.marker([eq.lat, eq.lon], { icon, title: `M ${magText}` });

        const box = document.createElement('div');
        box.className = 'eq-popup';
        const title = document.createElement('strong');
        title.className = 'eq-popup-title';
        title.style.color = color;
        title.textContent = `${eq.magType ? eq.magType.toUpperCase() : 'M'} ${magText}`;
        box.appendChild(title);
        if (eq.place) popupRow(box, 'Konum', eq.place);
        if (Number.isFinite(eq.depth)) popupRow(box, 'Derinlik', `${eq.depth.toFixed(1)} km`);
        popupRow(box, 'Zaman', new Date(eq.timeMs).toLocaleString('tr-TR', {
            timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }) + ' (TSİ)');
        popupRow(box, 'Kaynak', sourceName);
        marker.bindPopup(box);
        return marker;
    }

    // ---- Harita ----
    const map = L.map(mapEl, { center: [39.0, 35.0], zoom: 6, minZoom: 5, maxZoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> katkıcıları'
    }).addTo(map);

    const quakeLayer = typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({
            maxClusterRadius: 45,
            disableClusteringAtZoom: 11,
            iconCreateFunction: (cluster) => L.divIcon({
                html: `<div class="eq-cluster">${cluster.getChildCount()}</div>`,
                className: 'marker-cluster',
                iconSize: [40, 40]
            })
        })
        : L.layerGroup();
    map.addLayer(quakeLayer);

    // Termal harita: NASA GIBS (anahtar gerektirmeyen açık servis). VIIRS uydularının son iki günde
    // algıladığı sıcak noktalar (yangın, anız, sanayi tesisi) görüntü olarak bindirilir.
    function utcDay(offsetDays) {
        return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
    }
    function buildThermalLayer() {
        const days = [utcDay(1), utcDay(0)];
        return L.layerGroup(days.map((day) => L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
            layers: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_NOAA21_Thermal_Anomalies_375m_All',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            time: day,
            opacity: 0.95,
            attribution: 'Termal veri: NASA EOSDIS GIBS / FIRMS'
        })));
    }
    let thermalLayer = null;
    function syncThermal() {
        const wanted = !thermalCheckbox || thermalCheckbox.checked;
        if (wanted && !thermalLayer) {
            thermalLayer = buildThermalLayer();
            map.addLayer(thermalLayer);
        } else if (!wanted && thermalLayer) {
            map.removeLayer(thermalLayer);
            thermalLayer = null;
        }
    }

    // ---- Deprem yükleme ----
    let loadController = null;
    let loadSeq = 0;

    async function loadEarthquakes() {
        const range = (timeRangeSelect && timeRangeSelect.value) || '1_day';
        const minMag = Number((minMagSelect && minMagSelect.value) || 3.0);
        if (loadController) loadController.abort();
        loadController = new AbortController();
        const seq = ++loadSeq;
        setStatus('Deprem verisi yükleniyor…', false);

        for (const source of SOURCES) {
            try {
                const data = await fetchJson(source.url(range, minMag), source.timeoutMs, loadController.signal);
                if (seq !== loadSeq) return;
                const quakes = normalize(source.parse(data)).filter((q) => q.mag >= minMag);
                quakeLayer.clearLayers();
                quakes.forEach((q) => quakeLayer.addLayer(createMarker(q, source.name)));
                const clock = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                setStatus(quakes.length
                    ? `${quakes.length} deprem gösteriliyor · Kaynak: ${source.name} · Güncellendi: ${clock}`
                    : `Seçilen aralıkta M ${minMag.toFixed(1)} ve üzeri deprem yok · Kaynak: ${source.name} · Güncellendi: ${clock}`, false);
                return;
            } catch (error) {
                if (seq !== loadSeq) return; // yeni bir istek başladı
            }
        }
        // Hiçbir kaynak yanıt vermedi: eski işaretler kalır, "deprem yok" izlenimi verilmez.
        setStatus('Deprem verisi şu an alınamıyor. Resmî bilgi için AFAD ve Kandilli Rasathanesi\'ni takip edin.', true);
    }

    // ---- Kontroller ----
    const savedMinMag = readPref('erkenuyar_minMag');
    if (savedMinMag && minMagSelect && [...minMagSelect.options].some((o) => o.value === savedMinMag)) {
        minMagSelect.value = savedMinMag;
    }
    const savedRange = readPref('erkenuyar_timeRange');
    if (savedRange && timeRangeSelect && RANGE_HOURS[savedRange]) {
        timeRangeSelect.value = savedRange;
    }

    if (minMagSelect) minMagSelect.addEventListener('change', () => {
        writePref('erkenuyar_minMag', minMagSelect.value);
        loadEarthquakes();
    });
    if (timeRangeSelect) timeRangeSelect.addEventListener('change', () => {
        writePref('erkenuyar_timeRange', timeRangeSelect.value);
        loadEarthquakes();
    });
    if (thermalCheckbox) thermalCheckbox.addEventListener('change', syncThermal);
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        if (thermalLayer) { map.removeLayer(thermalLayer); thermalLayer = null; }
        syncThermal();
        loadEarthquakes();
    });
    // Konum yalnızca kullanıcı düğmeye basınca istenir (sayfa açılır açılmaz izin sorulmaz).
    if (locateBtn) {
        if (!navigator.geolocation) {
            locateBtn.hidden = true;
        } else {
            locateBtn.addEventListener('click', () => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 8),
                    () => setStatus('Konum alınamadı. Tarayıcı konum iznini kontrol edin.', true),
                    { maximumAge: 5 * 60 * 1000, timeout: 10000 }
                );
            });
        }
    }

    syncThermal();
    loadEarthquakes();
    setInterval(() => { if (!document.hidden) loadEarthquakes(); }, REFRESH_MS);
    setTimeout(() => map.invalidateSize(), 250);
    window.addEventListener('load', () => map.invalidateSize());
})();
