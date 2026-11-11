// ============================================================
// DEPREM VE TERMAL HARİTA
// ============================================================
// Güvenlik notları:
// - Bu dosyada hiçbir API anahtarı yoktur ve olmamalıdır (site herkese açık bir depodan yayınlanır).
// - Termal noktalar NASA'nın anahtarsız açık görüntü servisinden okunur.
// - Dış kaynaktan gelen metinler (yer adı vb.) sayfaya yalnızca textContent ile yazılır.
(function () {
    'use strict';

    const mapEl = document.getElementById('map');
    if (!mapEl || typeof L === 'undefined') return;

    const BOUNDS = { minLat: 35, maxLat: 43, minLon: 25, maxLon: 45 };
    const RANGE_HOURS = { '8_hours': 8, '1_day': 24, '7_days': 168 };
    const WORKER_RANGE = { '8_hours': 'last_8_hours', '1_day': 'last_24_hours', '7_days': 'last_7_days' };
    const REFRESH_MS = 90 * 1000;
    const MGM_URL = 'https://mgm-uyari-toplayici.sonerdnrekhesap.workers.dev/raw';
    const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
    // [plaka, il, enlem, boylam] (il merkezi)
    const PROVINCES = [[1,"Adana",37.0,35.3],[2,"Adıyaman",37.8,38.3],[3,"Afyonkarahisar",38.8,30.5],[4,"Ağrı",39.7,43.0],[5,"Amasya",40.7,35.8],[6,"Ankara",39.9,32.9],[7,"Antalya",36.9,30.7],[8,"Artvin",41.2,41.8],[9,"Aydın",37.8,27.8],[10,"Balıkesir",39.6,27.9],[11,"Bilecik",40.1,30.0],[12,"Bingöl",38.9,40.5],[13,"Bitlis",38.4,42.1],[14,"Bolu",40.7,31.6],[15,"Burdur",37.7,30.3],[16,"Bursa",40.2,29.1],[17,"Çanakkale",40.2,26.4],[18,"Çankırı",40.6,33.6],[19,"Çorum",40.5,34.9],[20,"Denizli",37.8,29.1],[21,"Diyarbakır",37.9,40.2],[22,"Edirne",41.7,26.6],[23,"Elazığ",38.7,39.2],[24,"Erzincan",39.8,39.5],[25,"Erzurum",39.9,41.3],[26,"Eskişehir",39.8,30.5],[27,"Gaziantep",37.1,37.4],[28,"Giresun",40.9,38.4],[29,"Gümüşhane",40.5,39.5],[30,"Hakkari",37.6,43.7],[31,"Hatay",36.4,36.2],[32,"Isparta",37.8,30.6],[33,"Mersin",36.8,34.6],[34,"İstanbul",41.0,28.9],[35,"İzmir",38.4,27.1],[36,"Kars",40.6,43.1],[37,"Kastamonu",41.4,33.8],[38,"Kayseri",38.7,35.5],[39,"Kırklareli",41.7,27.2],[40,"Kırşehir",39.1,34.2],[41,"Kocaeli",40.8,29.9],[42,"Konya",37.9,32.5],[43,"Kütahya",39.4,29.9],[44,"Malatya",38.4,38.3],[45,"Manisa",38.6,27.4],[46,"Kahramanmaraş",37.6,36.9],[47,"Mardin",37.3,40.7],[48,"Muğla",37.2,28.4],[49,"Muş",38.7,41.5],[50,"Nevşehir",38.6,34.7],[51,"Niğde",37.9,34.7],[52,"Ordu",40.9,37.9],[53,"Rize",41.0,40.5],[54,"Sakarya",40.8,30.4],[55,"Samsun",41.3,36.3],[56,"Siirt",37.9,41.9],[57,"Sinop",42.0,35.2],[58,"Sivas",39.7,37.0],[59,"Tekirdağ",40.9,27.5],[60,"Tokat",40.3,36.6],[61,"Trabzon",41.0,39.7],[62,"Tunceli",39.1,39.5],[63,"Şanlıurfa",37.2,38.8],[64,"Uşak",38.7,29.4],[65,"Van",38.5,43.4],[66,"Yozgat",39.8,34.8],[67,"Zonguldak",41.5,31.8],[68,"Aksaray",38.4,34.0],[69,"Bayburt",40.3,40.2],[70,"Karaman",37.2,33.2],[71,"Kırıkkale",39.8,33.5],[72,"Batman",37.9,41.1],[73,"Şırnak",37.5,42.5],[74,"Bartın",41.6,32.3],[75,"Ardahan",41.1,42.7],[76,"Iğdır",39.9,44.0],[77,"Yalova",40.7,29.3],[78,"Karabük",41.2,32.6],[79,"Kilis",36.7,37.1],[80,"Osmaniye",37.1,36.2],[81,"Düzce",40.8,31.2]];
    const POPUP_OPTS = { autoPanPaddingTopLeft: [12, 70], maxWidth: 300 };

    const statusEl = document.getElementById('mapStatus');
    const minMagSelect = document.getElementById('minMag');
    const timeRangeSelect = document.getElementById('timeRange');
    const alertDaySelect = document.getElementById('alertDay');
    const refreshBtn = document.getElementById('refreshMap');
    const locateBtn = document.getElementById('locateMe');
    const tabButtons = [...document.querySelectorAll('.map-tab[data-mode]')];
    const modeOnlyEls = [...document.querySelectorAll('[data-mode-only]')];

    // Her katmanın kendi durum metni vardır; ekranda yalnızca açık olan katmanınki görünür.
    let activeMode = 'quakes';
    const statusByMode = {};
    function setModeStatus(mode, text, isError) {
        statusByMode[mode] = { text, isError: Boolean(isError) };
        if (mode !== activeMode || !statusEl) return;
        statusEl.textContent = text;
        statusEl.classList.toggle('map-status-error', Boolean(isError));
    }
    function clockNow() {
        return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
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
            name: 'Kandilli Rasathanesi (KOERI)', short: 'KOERI',
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
            name: 'EMSC', short: 'EMSC',
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
                        place: p.flynn_region, time: p.time, magType: p.magtype, agency: p.auth };
                });
            }
        },
        {
            name: 'USGS', short: 'USGS',
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
                magType: typeof raw.magType === 'string' ? raw.magType.slice(0, 4) : '',
                agency: typeof raw.agency === 'string' ? raw.agency.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) : ''
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

    function sourceLabel(reading) {
        if (reading.source === 'EMSC' && reading.agency && reading.agency.toUpperCase() !== 'EMSC') {
            return `${reading.agency.toUpperCase()} (EMSC üzerinden)`;
        }
        return reading.sourceName;
    }

    function trTime(ms, withDate) {
        return new Date(ms).toLocaleString('tr-TR', Object.assign({ timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' },
            withDate ? { year: 'numeric', month: '2-digit', day: '2-digit' } : { second: '2-digit' }));
    }

    function quakePopup(event) {
        const eq = event.primary;
        const color = magnitudeColor(eq.mag);
        const box = document.createElement('div');
        box.className = 'eq-popup';
        const title = document.createElement('strong');
        title.className = 'eq-popup-title';
        title.style.color = color;
        title.textContent = `${eq.magType ? eq.magType.toUpperCase() : 'M'} ${eq.mag.toFixed(1)}`;
        box.appendChild(title);
        const place = event.readings.map((r) => r.place).find(Boolean);
        if (place) popupRow(box, 'Konum', place);
        if (Number.isFinite(eq.depth)) popupRow(box, 'Derinlik', `${eq.depth.toFixed(1)} km`);
        popupRow(box, 'Zaman', `${trTime(eq.timeMs, true)} (TSİ)`);

        // Aynı depremi bildiren kaynakların ölçümleri yan yana.
        const head = document.createElement('div');
        head.className = 'eq-src-head';
        head.textContent = event.readings.length > 1
            ? `Kaynaklara göre (${event.readings.length} kaynak)` : 'Kaynak';
        box.appendChild(head);
        const table = document.createElement('table');
        table.className = 'eq-src-table';
        event.readings.forEach((r) => {
            const tr = document.createElement('tr');
            const cells = [
                sourceLabel(r),
                `${r.magType ? r.magType.toUpperCase() : 'M'} ${r.mag.toFixed(1)}`,
                Number.isFinite(r.depth) ? `${r.depth.toFixed(0)} km` : '–',
                trTime(r.timeMs, false)
            ];
            cells.forEach((text, i) => {
                const td = document.createElement('td');
                td.textContent = text;
                if (i === 0) td.className = 'eq-src-name';
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });
        box.appendChild(table);
        if (event.readings.length > 1) {
            const note = document.createElement('div');
            note.className = 'eq-popup-note';
            note.textContent = 'Kurumlar aynı depremi farklı yöntemle ölçer; büyüklük ve saat küçük farklar gösterebilir.';
            box.appendChild(note);
        }
        return box;
    }

    function createMarker(event) {
        const eq = event.primary;
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
        marker.bindPopup(quakePopup(event), POPUP_OPTS);
        return marker;
    }

    // ---- Harita ----
    const map = L.map(mapEl, { center: [39.0, 35.0], zoom: 6, minZoom: 5, maxZoom: 12, zoomControl: false,
        scrollWheelZoom: false });
    // Fare tekerleği: sayfa kaydırılırken harita tekerleği yutmasın. Haritaya tıklanınca tekerlekle
    // yakınlaştırma açılır, fare haritadan çıkınca kapanır.
    const wheelHint = document.createElement('div');
    wheelHint.className = 'map-wheel-hint';
    wheelHint.textContent = 'Tekerlekle yakınlaştırmak için haritaya tıklayın';
    wheelHint.hidden = true;
    mapEl.appendChild(wheelHint);
    let wheelHintTimer = null;
    map.on('click', () => { map.scrollWheelZoom.enable(); wheelHint.hidden = true; });
    mapEl.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
    mapEl.addEventListener('wheel', () => {
        if (map.scrollWheelZoom.enabled()) return;
        wheelHint.hidden = false;
        clearTimeout(wheelHintTimer);
        wheelHintTimer = setTimeout(() => { wheelHint.hidden = true; }, 1600);
    }, { passive: true });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    // İl alanları ayrı bir bölmede ve "multiply" karışımıyla çizilir: renk haritayı boyar ama
    // alttaki şehir adları ve yollar silikleşmez.
    const shapePane = map.createPane('shapes');
    shapePane.style.zIndex = 350;
    shapePane.style.mixBlendMode = 'multiply';
    const shapeRenderer = L.svg({ pane: 'shapes' });
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

    // ---- Termal harita ----
    // Kaynak: NASA GIBS (anahtar gerektirmeyen açık servis), VIIRS uydularının sıcak noktaları.
    // Servis noktaları yalnızca görüntü olarak verir ve her yakınlaştırmada 5 piksel çizer; yaklaşınca
    // noktalar küçük ve seyrek kalır. Bu yüzden tüm Türkiye için tek bir görüntü alınır, içindeki
    // noktalar okunur ve haritaya sabit boyutlu, tıklanabilir işaretler olarak eklenir.
    const MERC_R = 20037508.342789244;
    const mercX = (lon) => lon * MERC_R / 180;
    const mercY = (lat) => Math.log(Math.tan((90 + lat) * Math.PI / 360)) * MERC_R / Math.PI;
    const THERMAL = {
        width: 2048, height: 1056,
        minX: mercX(BOUNDS.minLon), maxX: mercX(BOUNDS.maxLon),
        minY: mercY(BOUNDS.minLat), maxY: mercY(BOUNDS.maxLat),
        refreshMs: 30 * 60 * 1000
    };
    // Sürekli sıcak görünen tesisler: buradaki noktalar yangın değil, sanayi kaynağı olarak etiketlenir.
    const INDUSTRIAL_ZONES = [
        { lat: 40.85, lon: 29.30, r: 0.05, name: 'Tuzla sanayi bölgesi' },
        { lat: 40.95, lon: 28.70, r: 0.03, name: 'Ambarlı santrali' },
        { lat: 38.80, lon: 26.95, r: 0.04, name: 'Aliağa sanayi bölgesi' },
        { lat: 40.77, lon: 29.93, r: 0.04, name: 'İzmit sanayi bölgesi' },
        { lat: 38.20, lon: 36.90, r: 0.03, name: 'Afşin-Elbistan santrali' },
        { lat: 39.20, lon: 27.60, r: 0.03, name: 'Soma santrali' },
        { lat: 37.05, lon: 28.35, r: 0.03, name: 'Yatağan santrali' },
        { lat: 36.85, lon: 28.20, r: 0.03, name: 'Kemerköy santrali' },
        { lat: 36.60, lon: 36.20, r: 0.03, name: 'İskenderun demir-çelik' },
        { lat: 41.20, lon: 32.65, r: 0.03, name: 'Karabük demir-çelik' },
        { lat: 41.30, lon: 31.40, r: 0.03, name: 'Ereğli demir-çelik' }
    ];
    const thermalRenderer = L.canvas({ padding: 0.5 });
    const thermalLayer = L.layerGroup();
    let thermalSeq = 0;

    function utcDay(offsetDays) {
        return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
    }

    function loadThermalImage(day) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, 25000);
            img.onload = () => { clearTimeout(timer); resolve(img); };
            img.onerror = () => { clearTimeout(timer); reject(new Error('image_error')); };
            img.src = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi' +
                '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
                '&LAYERS=VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_NOAA21_Thermal_Anomalies_375m_All' +
                `&WIDTH=${THERMAL.width}&HEIGHT=${THERMAL.height}&TIME=${day}` +
                `&BBOX=${THERMAL.minX},${THERMAL.minY},${THERMAL.maxX},${THERMAL.maxY}`;
        });
    }

    // Görüntüdeki dolu piksel kümelerini bulur; her nokta yaklaşık 5 piksellik bir lekedir.
    // Bitişik noktaların oluşturduğu büyük lekeler 5 piksellik ızgarayla ayrı noktalara bölünür.
    function extractHotspots(img) {
        const w = THERMAL.width, h = THERMAL.height;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const filled = (x, y) => data[(y * w + x) * 4 + 3] > 100;
        const seen = new Uint8Array(w * h);
        const pixels = [];
        const stack = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (seen[y * w + x] || !filled(x, y)) continue;
                let minX = x, maxX = x, minY = y, maxY = y, sumX = 0, sumY = 0, n = 0;
                stack.push(x, y); seen[y * w + x] = 1;
                while (stack.length) {
                    const cy = stack.pop(), cx = stack.pop();
                    n++; sumX += cx; sumY += cy;
                    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
                    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        if (seen[ny * w + nx] || !filled(nx, ny)) continue;
                        seen[ny * w + nx] = 1; stack.push(nx, ny);
                    }
                }
                if (n < 6) continue; // kenar yumuşatma artığı
                if (maxX - minX <= 7 && maxY - minY <= 7) {
                    pixels.push([sumX / n, sumY / n]);
                } else {
                    for (let gy = minY + 2; gy <= maxY; gy += 5) {
                        for (let gx = minX + 2; gx <= maxX; gx += 5) {
                            if (filled(Math.min(gx, w - 1), Math.min(gy, h - 1))) pixels.push([gx, gy]);
                        }
                    }
                }
            }
        }
        return pixels.map(([px, py]) => {
            const mx = THERMAL.minX + (px + 0.5) / w * (THERMAL.maxX - THERMAL.minX);
            const my = THERMAL.maxY - (py + 0.5) / h * (THERMAL.maxY - THERMAL.minY);
            return {
                lon: mx / MERC_R * 180,
                lat: Math.atan(Math.sinh(my / MERC_R * Math.PI)) * 180 / Math.PI
            };
        });
    }

    function industrialZoneOf(point) {
        return INDUSTRIAL_ZONES.find((z) => Math.hypot(point.lat - z.lat, point.lon - z.lon) <= z.r) || null;
    }

    function thermalMarker(point, day, isToday) {
        const zone = industrialZoneOf(point);
        const fill = zone ? '#6d4c41' : (isToday ? '#e53935' : '#fb8c00');
        const marker = L.circleMarker([point.lat, point.lon], {
            renderer: thermalRenderer, radius: 6, color: '#ffffff', weight: 1.5,
            fillColor: fill, fillOpacity: 0.9
        });
        const box = document.createElement('div');
        box.className = 'eq-popup';
        const title = document.createElement('strong');
        title.className = 'eq-popup-title';
        title.style.color = fill;
        title.textContent = zone ? 'Sanayi kaynaklı sıcak nokta' : 'Uydu sıcak noktası';
        box.appendChild(title);
        if (zone) popupRow(box, 'Tesis', zone.name);
        popupRow(box, 'Uydu geçiş günü', `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`);
        popupRow(box, 'Yaklaşık konum', `${point.lat.toFixed(2)}°K, ${point.lon.toFixed(2)}°D`);
        const note = document.createElement('div');
        note.className = 'eq-popup-note';
        note.textContent = zone
            ? 'Bu bölgede sürekli çalışan tesisler uyduda sıcak görünür.'
            : 'Yangın, anız yakma veya başka bir ısı kaynağı olabilir. Her nokta yangın değildir.';
        box.appendChild(note);
        marker.bindPopup(box, POPUP_OPTS);
        return marker;
    }

    let thermalLoadedAt = 0;
    async function loadThermal(force) {
        if (!force && Date.now() - thermalLoadedAt < THERMAL.refreshMs) return;
        const seq = ++thermalSeq;
        setModeStatus('thermal', 'Isı haritası yükleniyor…', false);
        const days = [{ day: utcDay(1), isToday: false }, { day: utcDay(0), isToday: true }];
        const results = await Promise.allSettled(days.map((d) => loadThermalImage(d.day).then(extractHotspots)));
        if (seq !== thermalSeq) return;
        if (results.every((r) => r.status === 'rejected')) {
            setModeStatus('thermal', 'Isı haritası verisi şu an alınamıyor.', true);
            return;
        }
        thermalLayer.clearLayers();
        let total = 0;
        results.forEach((r, i) => {
            if (r.status !== 'fulfilled') return;
            r.value.forEach((p) => thermalLayer.addLayer(thermalMarker(p, days[i].day, days[i].isToday)));
            total += r.value.length;
        });
        thermalLoadedAt = Date.now();
        setModeStatus('thermal', total
            ? `Son iki günde ${total} sıcak nokta · Kaynak: NASA VIIRS uyduları · Güncellendi: ${clockNow()}`
            : `Son iki günde sıcak nokta algılanmadı · Kaynak: NASA VIIRS uyduları · Güncellendi: ${clockNow()}`, false);
    }

    // ---- Hava tahmini (il merkezleri) ----
    const WMO = [
        [[0], '☀️', 'Açık'], [[1], '🌤️', 'Az bulutlu'], [[2], '⛅', 'Parçalı bulutlu'], [[3], '☁️', 'Kapalı'],
        [[45, 48], '🌫️', 'Sisli'], [[51, 53, 55, 56, 57], '🌦️', 'Çisenti'],
        [[61, 63, 65, 66, 67], '🌧️', 'Yağmurlu'], [[71, 73, 75, 77], '🌨️', 'Kar yağışlı'],
        [[80, 81, 82], '🌧️', 'Sağanak yağışlı'], [[85, 86], '🌨️', 'Kar sağanağı'],
        [[95, 96, 99], '⛈️', 'Gök gürültülü sağanak']
    ];
    function wmoInfo(code) {
        const hit = WMO.find((w) => w[0].includes(Number(code)));
        return hit ? { icon: hit[1], text: hit[2] } : { icon: '🌡️', text: 'Bilinmiyor' };
    }
    const weatherLayer = L.layerGroup();
    let weatherLoadedAt = 0;
    let weatherSeq = 0;

    function weatherBox(provinceName, w, compact) {
        const now = wmoInfo(w.current.weather_code);
        const temp = Math.round(Number(w.current.temperature_2m));
        const box = document.createElement('div');
        box.className = compact ? '' : 'eq-popup';
        const title = document.createElement(compact ? 'div' : 'strong');
        title.className = compact ? 'alert-tip-name' : 'eq-popup-title';
        title.textContent = provinceName;
        box.appendChild(title);
        popupRow(box, 'Şu an', `${now.icon} ${temp}°C, ${now.text.toLowerCase()}`);
        popupRow(box, 'Rüzgâr', `${Math.round(Number(w.current.wind_speed_10m))} km/sa`);
        const days = (w.daily && w.daily.time) || [];
        days.forEach((iso, i) => {
            const d = wmoInfo(w.daily.weather_code[i]);
            const label = i === 0 ? 'Bugün' : i === 1 ? 'Yarın'
                : new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long' });
            const rain = w.daily.precipitation_probability_max ? w.daily.precipitation_probability_max[i] : null;
            popupRow(box, label,
                `${d.icon} ${Math.round(w.daily.temperature_2m_max[i])}° / ${Math.round(w.daily.temperature_2m_min[i])}°` +
                (rain != null ? ` · yağış %${rain}` : ''));
        });
        if (!compact) {
            const note = document.createElement('div');
            note.className = 'eq-popup-note';
            note.textContent = 'İl merkezi için tahmin. Kaynak: Open-Meteo.';
            box.appendChild(note);
        }
        return box;
    }

    // Sıcaklık renkleri (°C alt sınırı → renk). Açık tonlar: alttaki harita yazıları okunur kalır.
    const TEMP_SCALE = [
        [35, '#f4511e'], [30, '#fb8c00'], [25, '#ffb74d'], [20, '#ffd54f'], [15, '#fff176'],
        [10, '#dce775'], [5, '#aed581'], [0, '#80cbc4'], [-5, '#81d4fa'], [-10, '#90caf9'], [-100, '#b39ddb']
    ];
    function tempColor(t) {
        const hit = TEMP_SCALE.find((step) => t >= step[0]);
        return hit ? hit[1] : '#b39ddb';
    }

    function weatherStyle(temp, hovered) {
        return { color: hovered ? '#263238' : '#546e7a', weight: hovered ? 2.5 : 0.7, opacity: hovered ? 1 : 0.6,
            fillColor: tempColor(temp), fillOpacity: 1 };
    }

    // İl merkezindeki kısa etiket (simge + sıcaklık). Üst üste binenler gizlenir.
    function weatherLabel(province, w) {
        const now = wmoInfo(w.current.weather_code);
        const temp = Math.round(Number(w.current.temperature_2m));
        const icon = L.divIcon({
            html: `<div class="wx-label">${now.icon}<b>${temp}°</b></div>`,
            className: 'wx-marker', iconSize: [54, 22], iconAnchor: [27, 11]
        });
        return L.marker([province[2], province[3]], { icon, interactive: false, keyboard: false });
    }

    let weatherLabels = [];
    function declutterWeatherLabels() {
        if (!map.hasLayer(weatherLayer)) return;
        const placed = [];
        // Büyük şehirler önce yerleşsin diye plaka sırası yerine sabit öncelik listesi.
        const priority = [34, 6, 35, 1, 16, 7, 42, 27, 21, 55, 25, 61, 65, 38, 58, 63, 44, 33, 20, 48];
        const ordered = weatherLabels.slice().sort((x, y) => {
            const ix = priority.indexOf(x.plate), iy = priority.indexOf(y.plate);
            return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
        });
        for (const item of ordered) {
            const pt = map.latLngToContainerPoint(item.marker.getLatLng());
            const box = { x1: pt.x - 29, y1: pt.y - 13, x2: pt.x + 29, y2: pt.y + 13 };
            const clash = placed.some((p) => box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1);
            const el = item.marker.getElement();
            if (el) el.style.visibility = clash ? 'hidden' : 'visible';
            if (!clash) placed.push(box);
        }
    }
    map.on('zoomend moveend', declutterWeatherLabels);

    async function renderWeather(data, seq) {
        let shapes = null;
        try { shapes = await loadProvinceShapes(); } catch (error) { shapes = null; }
        if (seq !== weatherSeq) return false;
        weatherLayer.clearLayers();
        weatherLabels = [];
        const byPlate = new Map();
        data.forEach((w, i) => {
            if (w && w.current && Number.isFinite(Number(w.current.temperature_2m))) byPlate.set(PROVINCES[i][0], w);
        });
        if (shapes && Array.isArray(shapes.features)) {
            weatherLayer.addLayer(L.geoJSON(shapes, {
                pane: 'shapes', renderer: shapeRenderer,
                filter: (feature) => byPlate.has(feature.properties.p),
                style: (feature) => weatherStyle(Number(byPlate.get(feature.properties.p).current.temperature_2m), false),
                onEachFeature: (feature, layer) => {
                    const w = byPlate.get(feature.properties.p);
                    const name = String(feature.properties.n || '');
                    const temp = Number(w.current.temperature_2m);
                    layer.bindPopup(weatherBox(name, w, false), POPUP_OPTS);
                    if (canHover) {
                        layer.bindTooltip(weatherBox(name, w, true), { sticky: true, direction: 'auto', offset: [14, 0], className: 'alert-tip', opacity: 1 });
                        layer.on('mouseover', () => { layer.setStyle(weatherStyle(temp, true)); layer.bringToFront(); });
                        layer.on('mouseout', () => layer.setStyle(weatherStyle(temp, false)));
                    }
                }
            }));
        }
        for (const province of PROVINCES) {
            const w = byPlate.get(province[0]);
            if (!w) continue;
            const marker = weatherLabel(province, w);
            // Sınır dosyası alınamadıysa etiketler tıklanabilir kalır (bilgi kaybolmasın).
            if (!shapes) {
                marker.options.interactive = true;
                marker.bindPopup(weatherBox(province[1], w, false), POPUP_OPTS);
            }
            weatherLayer.addLayer(marker);
            weatherLabels.push({ plate: province[0], marker });
        }
        declutterWeatherLabels();
        return true;
    }

    async function loadWeather(force) {
        if (!force && Date.now() - weatherLoadedAt < 15 * 60 * 1000) return;
        const seq = ++weatherSeq;
        setModeStatus('weather', 'Hava tahmini yükleniyor…', false);
        const url = `${WEATHER_URL}?latitude=${PROVINCES.map((p) => p[2]).join(',')}` +
            `&longitude=${PROVINCES.map((p) => p[3]).join(',')}` +
            '&current=temperature_2m,weather_code,wind_speed_10m' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
            '&forecast_days=3&timezone=Europe%2FIstanbul';
        try {
            const data = await fetchJson(url, 20000);
            if (seq !== weatherSeq) return;
            if (!Array.isArray(data) || data.length !== PROVINCES.length) throw new Error('bad_format');
            if (!(await renderWeather(data, seq))) return;
            weatherLoadedAt = Date.now();
            setModeStatus('weather', `81 il merkezi için anlık durum ve 3 günlük tahmin · Kaynak: Open-Meteo · Güncellendi: ${clockNow()}`, false);
        } catch (error) {
            if (seq !== weatherSeq) return;
            setModeStatus('weather', 'Hava tahmini şu an alınamıyor.', true);
        }
    }

    // ---- MGM meteorolojik uyarılar ----
    const ALERT_LEVELS = {
        yellow: { rank: 1, color: '#fdd835', fill: '#ffee58', edge: '#f9a825', text: '#3e2723', label: 'Sarı uyarı' },
        orange: { rank: 2, color: '#fb8c00', fill: '#ff9800', edge: '#e65100', text: '#ffffff', label: 'Turuncu uyarı' },
        red: { rank: 3, color: '#e53935', fill: '#f44336', edge: '#b71c1c', text: '#ffffff', label: 'Kırmızı uyarı' }
    };
    const HAZARDS = {
        wind: ['💨', 'Kuvvetli rüzgâr / fırtına'], rain: ['🌧️', 'Kuvvetli yağış'], snow: ['❄️', 'Kar'],
        thunderstorm: ['⛈️', 'Gök gürültülü sağanak'], fog: ['🌫️', 'Sis'], hot: ['🌡️', 'Aşırı sıcak'],
        cold: ['🥶', 'Aşırı soğuk'], ice: ['🧊', 'Buzlanma ve don'], frost: ['🧊', 'Zirai don'],
        avalanche: ['🏔️', 'Çığ'], dust: ['🌪️', 'Toz taşınımı'], flood: ['🌊', 'Sel'], snowmelt: ['💧', 'Kar erimesi']
    };
    function hazardInfo(key) {
        const hit = HAZARDS[String(key).toLowerCase()];
        return hit ? { icon: hit[0], text: hit[1] } : { icon: '⚠️', text: String(key).slice(0, 40) };
    }
    const alertLayer = L.layerGroup();
    const alertCache = {}; // gün → { at, provinces }
    let alertSeq = 0;

    // MGM kaydı ilçe kodlarıyla gelir (9PPNN; PP = il plakası). İl bazında en yüksek seviye alınır.
    function aggregateAlerts(list) {
        const byPlate = new Map();
        for (const alert of list) {
            if (!alert || typeof alert !== 'object') continue;
            for (const level of Object.keys(ALERT_LEVELS)) {
                const towns = alert.towns && Array.isArray(alert.towns[level]) ? alert.towns[level] : [];
                if (!towns.length) continue;
                const hazards = alert.weather && Array.isArray(alert.weather[level]) ? alert.weather[level] : [];
                const text = alert.text && typeof alert.text[level] === 'string' ? alert.text[level] : '';
                const plates = new Set();
                for (const town of towns) {
                    const m = /^9(\d{2})\d{2}$/.exec(String(town));
                    if (m) plates.add(Number(m[1]));
                }
                for (const plate of plates) {
                    if (!byPlate.has(plate)) byPlate.set(plate, { level: null, items: [] });
                    const entry = byPlate.get(plate);
                    if (!entry.level || ALERT_LEVELS[level].rank > ALERT_LEVELS[entry.level].rank) entry.level = level;
                    entry.items.push({ level, hazards, text: text.slice(0, 1200), begin: alert.begin, end: alert.end });
                }
            }
        }
        return byPlate;
    }

    function formatRange(begin, end) {
        const fmt = (iso) => {
            const ms = Date.parse(iso);
            return Number.isFinite(ms) ? new Date(ms).toLocaleString('tr-TR', {
                timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            }) : null;
        };
        const a = fmt(begin), b = fmt(end);
        return a && b ? `${a} – ${b} (TSİ)` : null;
    }

    function alertMarker(province, entry) {
        const lvl = ALERT_LEVELS[entry.level];
        const top = entry.items.filter((i) => i.level === entry.level);
        const iconChar = hazardInfo((top[0] && top[0].hazards[0]) || '').icon;
        const icon = L.divIcon({
            html: `<div class="alert-dot" style="background-color:${lvl.color};">${iconChar}</div>`,
            className: 'alert-marker', iconSize: [38, 38], iconAnchor: [19, 19]
        });
        const marker = L.marker([province[2], province[3]], { icon, title: `${province[1]}: ${lvl.label}` });
        marker.bindPopup(alertPopupBox(province[1], entry), POPUP_OPTS);
        return marker;
    }

    function alertPopupBox(provinceName, entry) {
        const lvl = ALERT_LEVELS[entry.level];
        const box = document.createElement('div');
        box.className = 'eq-popup';
        const title = document.createElement('strong');
        title.className = 'eq-popup-title';
        title.textContent = provinceName;
        box.appendChild(title);
        const badge = document.createElement('span');
        badge.className = 'alert-badge';
        badge.style.backgroundColor = lvl.color;
        badge.style.color = lvl.text;
        badge.textContent = lvl.label;
        box.appendChild(badge);
        entry.items
            .slice()
            .sort((x, y) => ALERT_LEVELS[y.level].rank - ALERT_LEVELS[x.level].rank)
            .slice(0, 3)
            .forEach((item) => {
                const kinds = item.hazards.map((h) => hazardInfo(h).text).join(', ');
                if (kinds) popupRow(box, ALERT_LEVELS[item.level].label, kinds);
                const range = formatRange(item.begin, item.end);
                if (range) popupRow(box, 'Geçerlilik', range);
                if (item.text) {
                    const p = document.createElement('div');
                    p.className = 'alert-text';
                    p.textContent = item.text;
                    box.appendChild(p);
                }
            });
        const note = document.createElement('div');
        note.className = 'eq-popup-note';
        note.textContent = 'Kaynak: Meteoroloji Genel Müdürlüğü (MGM) MeteoUyarı. Uyarı ilin bir bölümü için geçerli olabilir.';
        box.appendChild(note);
        return box;
    }

    // İl sınırları (sitede barınan küçültülmüş dosya; yalnızca bu katman açılınca indirilir).
    let shapesPromise = null;
    function loadProvinceShapes() {
        if (!shapesPromise) {
            shapesPromise = fetchJson('data/tr-provinces.json?v=2', 25000).catch((error) => {
                shapesPromise = null;
                throw error;
            });
        }
        return shapesPromise;
    }

    function hazardSummary(entry) {
        const kinds = [];
        entry.items.filter((i) => i.level === entry.level).forEach((item) => {
            item.hazards.forEach((h) => {
                const info = hazardInfo(h);
                if (!kinds.some((k) => k.text === info.text)) kinds.push(info);
            });
        });
        return kinds;
    }

    // Fareyle üzerine gelince görünen kısa bilgi kutusu.
    function alertTooltip(provinceName, entry) {
        const box = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'alert-tip-name';
        name.textContent = provinceName;
        box.appendChild(name);
        if (!entry) {
            const none = document.createElement('div');
            none.className = 'alert-tip-none';
            none.textContent = 'Yürürlükte uyarı yok';
            box.appendChild(none);
            return box;
        }
        const lvl = ALERT_LEVELS[entry.level];
        const badge = document.createElement('span');
        badge.className = 'alert-badge';
        badge.style.backgroundColor = lvl.color;
        badge.style.color = lvl.text;
        badge.textContent = lvl.label;
        box.appendChild(badge);
        hazardSummary(entry).forEach((k) => {
            const row = document.createElement('div');
            row.className = 'alert-tip-row';
            row.textContent = `${k.icon} ${k.text}`;
            box.appendChild(row);
        });
        const first = entry.items.find((i) => i.level === entry.level);
        const range = first ? formatRange(first.begin, first.end) : null;
        if (range) {
            const when = document.createElement('div');
            when.className = 'alert-tip-when';
            when.textContent = range;
            box.appendChild(when);
        }
        const hint = document.createElement('div');
        hint.className = 'alert-tip-hint';
        hint.textContent = 'Uyarı metni için tıklayın';
        box.appendChild(hint);
        return box;
    }

    const canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    const shapeLayersByPlate = new Map();

    function provinceStyle(entry, hovered) {
        if (!entry) {
            // Uyarısı olmayan iller çizilmez (deniz üzerindeki sınır çizgileri haritayı karıştırmasın);
            // üzerine gelince hafifçe belirir.
            return { color: '#546e7a', weight: hovered ? 1.5 : 0, opacity: hovered ? 0.9 : 0,
                fillColor: '#ffffff', fillOpacity: hovered ? 0.35 : 0 };
        }
        const lvl = ALERT_LEVELS[entry.level];
        return { color: hovered ? '#263238' : lvl.edge, weight: hovered ? 2.5 : 1, opacity: 1,
            fillColor: lvl.fill, fillOpacity: 1 };
    }

    // Uyarı olan iller, alanları uyarı rengine boyanarak gösterilir. Sınır dosyası alınamazsa
    // il merkezine işaret konur (bilgi kaybolmasın).
    async function renderAlerts(byPlate, seq) {
        let shapes = null;
        try { shapes = await loadProvinceShapes(); } catch (error) { shapes = null; }
        if (seq !== alertSeq) return -1;
        alertLayer.clearLayers();
        shapeLayersByPlate.clear();
        let count = 0;
        if (!shapes || !Array.isArray(shapes.features)) {
            for (const province of PROVINCES) {
                const entry = byPlate.get(province[0]);
                if (!entry || !entry.level) continue;
                alertLayer.addLayer(alertMarker(province, entry));
                count++;
            }
            return count;
        }
        const geo = L.geoJSON(shapes, {
            pane: 'shapes', renderer: shapeRenderer,
            style: (feature) => provinceStyle(byPlate.get(feature.properties.p), false),
            onEachFeature: (feature, layer) => {
                const plate = feature.properties.p;
                const name = String(feature.properties.n || '');
                const entry = byPlate.get(plate) || null;
                shapeLayersByPlate.set(plate, layer);
                if (entry) {
                    count++;
                    layer.bindPopup(alertPopupBox(name, entry), POPUP_OPTS);
                }
                if (canHover) {
                    layer.bindTooltip(alertTooltip(name, entry), { sticky: true, direction: 'auto', offset: [14, 0], className: 'alert-tip', opacity: 1 });
                    layer.on('mouseover', () => { layer.setStyle(provinceStyle(entry, true)); if (entry) layer.bringToFront(); });
                    layer.on('mouseout', () => layer.setStyle(provinceStyle(entry, false)));
                }
            }
        });
        // Uyarılı iller üstte çizilsin (kenarlıkları komşu illerin altında kalmasın).
        geo.eachLayer((layer) => { if (byPlate.get(layer.feature.properties.p)) layer.bringToFront(); });
        alertLayer.addLayer(geo);
        geo.eachLayer((layer) => { if (byPlate.get(layer.feature.properties.p)) layer.bringToFront(); });
        return count;
    }

    // Haritanın altındaki özet: aynı uyarıyı alan iller tek kartta.
    const alertSummaryEl = document.getElementById('alertSummary');
    function renderAlertSummary(byPlate) {
        if (!alertSummaryEl) return;
        alertSummaryEl.textContent = '';
        const groups = new Map();
        for (const province of PROVINCES) {
            const entry = byPlate.get(province[0]);
            if (!entry || !entry.level) continue;
            const kinds = hazardSummary(entry);
            const first = entry.items.find((i) => i.level === entry.level);
            const range = first ? formatRange(first.begin, first.end) : null;
            const key = `${entry.level}|${kinds.map((k) => k.text).join(',')}|${range || ''}`;
            if (!groups.has(key)) groups.set(key, { level: entry.level, kinds, range, provinces: [] });
            groups.get(key).provinces.push(province);
        }
        [...groups.values()]
            .sort((a, b) => ALERT_LEVELS[b.level].rank - ALERT_LEVELS[a.level].rank)
            .forEach((group) => {
                const lvl = ALERT_LEVELS[group.level];
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'alert-card';
                card.style.borderLeftColor = lvl.color;
                const head = document.createElement('div');
                head.className = 'alert-card-head';
                const badge = document.createElement('span');
                badge.className = 'alert-badge';
                badge.style.backgroundColor = lvl.color;
                badge.style.color = lvl.text;
                badge.textContent = lvl.label;
                head.appendChild(badge);
                const kindsEl = document.createElement('span');
                kindsEl.className = 'alert-card-kinds';
                kindsEl.textContent = group.kinds.map((k) => `${k.icon} ${k.text}`).join(' · ');
                head.appendChild(kindsEl);
                card.appendChild(head);
                if (group.range) {
                    const when = document.createElement('div');
                    when.className = 'alert-card-when';
                    when.textContent = group.range;
                    card.appendChild(when);
                }
                const names = document.createElement('div');
                names.className = 'alert-card-names';
                names.textContent = `${group.provinces.length} il: ${group.provinces.map((p) => p[1]).join(', ')}`;
                card.appendChild(names);
                // Karta basınca harita o illere yaklaşır.
                card.addEventListener('click', () => {
                    const bounds = L.latLngBounds([]);
                    group.provinces.forEach((p) => {
                        const layer = shapeLayersByPlate.get(p[0]);
                        if (layer && layer.getBounds) bounds.extend(layer.getBounds()); else bounds.extend([p[2], p[3]]);
                    });
                    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 70], maxZoom: 8 });
                    mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                alertSummaryEl.appendChild(card);
            });
    }

    async function loadAlerts(force) {
        const day = alertDaySelect && alertDaySelect.value === 'tomorrow' ? 'tomorrow' : 'today';
        const dayLabel = day === 'today' ? 'bugün' : 'yarın';
        const seq = ++alertSeq;
        let cached = alertCache[day];
        if (force || !cached || Date.now() - cached.at > 10 * 60 * 1000) {
            setModeStatus('alerts', 'MGM uyarıları yükleniyor…', false);
            try {
                const data = await fetchJson(`${MGM_URL}?which=${day}`, 15000);
                if (seq !== alertSeq) return;
                if (!data || data.ok !== true || !Array.isArray(data.data)) throw new Error('unavailable');
                cached = alertCache[day] = { at: Date.now(), provinces: aggregateAlerts(data.data) };
            } catch (error) {
                if (seq !== alertSeq) return;
                // Kaynağa ulaşılamadıysa "uyarı yok" denmez.
                alertLayer.clearLayers();
                if (alertSummaryEl) alertSummaryEl.textContent = '';
                setModeStatus('alerts', 'MGM uyarılarına şu an ulaşılamıyor. Güncel uyarılar için mgm.gov.tr adresine bakın.', true);
                return;
            }
        }
        const count = await renderAlerts(cached.provinces, seq);
        if (count < 0 || seq !== alertSeq) return;
        renderAlertSummary(cached.provinces);
        const clock = new Date(cached.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        setModeStatus('alerts', count
            ? `${count} ilde ${dayLabel} için meteorolojik uyarı var · Kaynak: MGM · Güncellendi: ${clock}`
            : `MGM'ye göre ${dayLabel} için yürürlükte meteorolojik uyarı yok · Güncellendi: ${clock}`, false);
        // Bugün uyarı yoksa yarın için yayımlanmış uyarı olup olmadığı da belirtilir.
        if (!count && day === 'today') {
            try {
                const next = await fetchJson(`${MGM_URL}?which=tomorrow`, 15000);
                if (seq !== alertSeq || !next || next.ok !== true || !Array.isArray(next.data)) return;
                alertCache.tomorrow = { at: Date.now(), provinces: aggregateAlerts(next.data) };
                const n = alertCache.tomorrow.provinces.size;
                if (n) {
                    setModeStatus('alerts', `MGM'ye göre bugün için yürürlükte uyarı yok; yarın için ${n} ilde uyarı var ("Uyarı günü"nden Yarın'ı seçin) · Güncellendi: ${clock}`, false);
                }
            } catch (error) { /* yarın bilgisi alınamadıysa bugünkü durum metni kalır */ }
        }
    }

    // ---- Rüzgâr haritası (hareketli) ----
    // Veri: Open-Meteo, 1°'lik ızgarada anlık rüzgâr hızı ve yönü. Izgara aralarında doğrusal ara
    // değer alınır; parçacıklar rüzgâr yönünde akar, zemin rüzgâr hızına göre renklenir.
    const WIND = { minLat: 34, maxLat: 44, minLon: 24, maxLon: 46, step: 1, refreshMs: 30 * 60 * 1000 };
    WIND.rows = (WIND.maxLat - WIND.minLat) / WIND.step + 1;
    WIND.cols = (WIND.maxLon - WIND.minLon) / WIND.step + 1;
    // km/sa → renk (açık tonlar; zemin haritayla çarpılarak boyanır, yazılar okunur kalır)
    const WIND_SCALE = [
        [0, [140, 190, 235]], [10, [80, 170, 235]], [20, [60, 190, 150]], [30, [185, 210, 70]],
        [40, [250, 190, 50]], [50, [250, 140, 40]], [65, [230, 70, 70]], [85, [160, 80, 190]]
    ];
    function windColor(speed) {
        for (let i = WIND_SCALE.length - 1; i > 0; i--) {
            const [s0, c0] = WIND_SCALE[i - 1], [s1, c1] = WIND_SCALE[i];
            if (speed >= s0) {
                const t = Math.min(1, (speed - s0) / (s1 - s0));
                return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t));
            }
        }
        return WIND_SCALE[0][1];
    }
    const COMPASS = ['kuzeyden', 'kuzeydoğudan', 'doğudan', 'güneydoğudan', 'güneyden', 'güneybatıdan', 'batıdan', 'kuzeybatıdan'];

    const windBgPane = map.createPane('windbg');
    windBgPane.style.zIndex = 345;
    windBgPane.style.mixBlendMode = 'multiply';
    windBgPane.style.pointerEvents = 'none';
    const windPane = map.createPane('wind');
    windPane.style.zIndex = 360;
    windPane.style.pointerEvents = 'none';
    const windBgCanvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', windBgPane);
    const windCanvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', windPane);
    const windCtx = windCanvas.getContext('2d');
    windBgPane.style.display = 'none';
    windPane.style.display = 'none';
    const windLayer = L.layerGroup(); // katman düğmeleri için yer tutucu
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let windField = null; // { u, v, gust } Float32Array (rows × cols), km/sa
    let windLoadedAt = 0;
    let windSeq = 0;
    let windParticles = [];
    let windFrame = null;
    let windRunning = false;

    function windAt(lat, lon) {
        if (!windField) return null;
        const y = (lat - WIND.minLat) / WIND.step, x = (lon - WIND.minLon) / WIND.step;
        if (x < 0 || y < 0 || x > WIND.cols - 1 || y > WIND.rows - 1) return null;
        const x0 = Math.min(WIND.cols - 2, Math.floor(x)), y0 = Math.min(WIND.rows - 2, Math.floor(y));
        const fx = x - x0, fy = y - y0;
        const at = (arr, r, c) => arr[r * WIND.cols + c];
        const mix = (arr) => at(arr, y0, x0) * (1 - fx) * (1 - fy) + at(arr, y0, x0 + 1) * fx * (1 - fy) +
            at(arr, y0 + 1, x0) * (1 - fx) * fy + at(arr, y0 + 1, x0 + 1) * fx * fy;
        const u = mix(windField.u), v = mix(windField.v);
        return { u, v, speed: Math.hypot(u, v), gust: mix(windField.gust) };
    }

    function sizeWindCanvases() {
        const size = map.getSize();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const topLeft = map.containerPointToLayerPoint([0, 0]);
        [windCanvas, windBgCanvas].forEach((canvas) => {
            L.DomUtil.setPosition(canvas, topLeft);
            canvas.style.width = `${size.x}px`;
            canvas.style.height = `${size.y}px`;
        });
        windCanvas.width = Math.round(size.x * ratio);
        windCanvas.height = Math.round(size.y * ratio);
        windCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
        return size;
    }

    // Zemin: düşük çözünürlükte hesaplanıp yumuşatılarak büyütülür.
    function drawWindBackground(size) {
        const cell = 8;
        const w = Math.ceil(size.x / cell), h = Math.ceil(size.y / cell);
        const small = document.createElement('canvas');
        small.width = w; small.height = h;
        const sctx = small.getContext('2d');
        const image = sctx.createImageData(w, h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const ll = map.containerPointToLatLng([x * cell + cell / 2, y * cell + cell / 2]);
                const wind = windAt(ll.lat, ll.lng);
                const i = (y * w + x) * 4;
                if (!wind) { image.data[i + 3] = 0; continue; }
                const c = windColor(wind.speed);
                image.data[i] = c[0]; image.data[i + 1] = c[1]; image.data[i + 2] = c[2]; image.data[i + 3] = 235;
            }
        }
        sctx.putImageData(image, 0, 0);
        windBgCanvas.width = size.x; windBgCanvas.height = size.y;
        const ctx = windBgCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, size.x, size.y);
        ctx.drawImage(small, 0, 0, w, h, 0, 0, size.x, size.y);
    }

    function spawnParticle(size) {
        return { x: Math.random() * size.x, y: Math.random() * size.y, age: Math.floor(Math.random() * 60), life: 60 + Math.random() * 60 };
    }

    function resetWind() {
        if (!windField) return;
        const size = sizeWindCanvases();
        drawWindBackground(size);
        windCtx.clearRect(0, 0, size.x, size.y);
        const count = Math.round(Math.min(1400, Math.max(300, size.x * size.y / 520)));
        windParticles = Array.from({ length: count }, () => spawnParticle(size));
        if (reducedMotion) drawWindArrows(size);
    }

    // Hareket azaltma tercihi olanlar için: akan parçacık yerine sabit oklar.
    function drawWindArrows(size) {
        windCtx.strokeStyle = 'rgba(38, 50, 56, 0.8)';
        windCtx.lineWidth = 1.4;
        for (let y = 30; y < size.y; y += 46) {
            for (let x = 30; x < size.x; x += 46) {
                const ll = map.containerPointToLatLng([x, y]);
                const wind = windAt(ll.lat, ll.lng);
                if (!wind || wind.speed < 1) continue;
                const len = Math.min(18, 6 + wind.speed / 4);
                const ax = wind.u / wind.speed, ay = -wind.v / wind.speed;
                windCtx.beginPath();
                windCtx.moveTo(x - ax * len, y - ay * len);
                windCtx.lineTo(x + ax * len, y + ay * len);
                windCtx.lineTo(x + ax * len - (ax * 5 - ay * 4), y + ay * len - (ay * 5 + ax * 4));
                windCtx.moveTo(x + ax * len, y + ay * len);
                windCtx.lineTo(x + ax * len - (ax * 5 + ay * 4), y + ay * len - (ay * 5 - ax * 4));
                windCtx.stroke();
            }
        }
    }

    function stepWind() {
        windFrame = null;
        if (!windRunning || !windField) return;
        const size = map.getSize();
        // Önceki kareyi soldur: izler kuyruk bırakır.
        windCtx.globalCompositeOperation = 'destination-in';
        windCtx.fillStyle = 'rgba(0, 0, 0, 0.93)';
        windCtx.fillRect(0, 0, size.x, size.y);
        windCtx.globalCompositeOperation = 'source-over';
        windCtx.lineWidth = 1.7;
        windCtx.lineCap = 'round';
        windCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        windCtx.beginPath();
        const pxPerKmh = 0.055 * Math.pow(1.35, map.getZoom() - 6); // yaklaşınca akış da hızlanır
        for (const p of windParticles) {
            const ll = map.containerPointToLatLng([p.x, p.y]);
            const wind = windAt(ll.lat, ll.lng);
            if (!wind || wind.speed < 0.8 || p.age > p.life || p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) {
                Object.assign(p, spawnParticle(size), { age: 0 });
                continue;
            }
            const nx = p.x + wind.u * pxPerKmh, ny = p.y - wind.v * pxPerKmh;
            windCtx.moveTo(p.x, p.y);
            windCtx.lineTo(nx, ny);
            p.x = nx; p.y = ny; p.age++;
        }
        windCtx.stroke();
        // Beyaz izlerin açık zeminde de seçilmesi için ince koyu gölge.
        windCtx.globalCompositeOperation = 'destination-over';
        windCtx.strokeStyle = 'rgba(20, 40, 60, 0.35)';
        windCtx.lineWidth = 3.2;
        windCtx.stroke();
        windCtx.globalCompositeOperation = 'source-over';
        windFrame = requestAnimationFrame(stepWind);
    }

    function windStart() {
        windBgPane.style.display = '';
        windPane.style.display = '';
        if (!windField) return;
        resetWind();
        windRunning = !reducedMotion;
        if (windRunning && !windFrame) windFrame = requestAnimationFrame(stepWind);
    }
    function windStop(hide) {
        windRunning = false;
        if (windFrame) { cancelAnimationFrame(windFrame); windFrame = null; }
        if (hide) { windBgPane.style.display = 'none'; windPane.style.display = 'none'; }
    }
    map.on('moveend zoomend resize', () => { if (activeMode === 'wind' && windField) resetWind(); });
    document.addEventListener('visibilitychange', () => {
        if (activeMode !== 'wind') return;
        if (document.hidden) windStop(false); else windStart();
    });
    map.on('click', (e) => {
        if (activeMode !== 'wind') return;
        const wind = windAt(e.latlng.lat, e.latlng.lng);
        if (!wind) return;
        const from = (Math.atan2(-wind.u, -wind.v) * 180 / Math.PI + 360) % 360; // rüzgârın geldiği yön
        const box = document.createElement('div');
        box.className = 'eq-popup';
        const title = document.createElement('strong');
        title.className = 'eq-popup-title';
        title.textContent = `Rüzgâr: ${Math.round(wind.speed)} km/sa`;
        box.appendChild(title);
        popupRow(box, 'Yön', `${COMPASS[Math.round(from / 45) % 8]} (${Math.round(from)}°)`);
        popupRow(box, 'Hamle', `${Math.round(wind.gust)} km/sa`);
        const note = document.createElement('div');
        note.className = 'eq-popup-note';
        note.textContent = 'Yerden 10 m yükseklik için model tahmini. Kaynak: Open-Meteo.';
        box.appendChild(note);
        L.popup(POPUP_OPTS).setLatLng(e.latlng).setContent(box).openOn(map);
    });

    async function loadWind(force) {
        if (!force && windField && Date.now() - windLoadedAt < WIND.refreshMs) { if (activeMode === 'wind') windStart(); return; }
        const seq = ++windSeq;
        if (!windField) setModeStatus('wind', 'Rüzgâr verisi yükleniyor…', false);
        const lats = [], lons = [];
        for (let r = 0; r < WIND.rows; r++) {
            for (let c = 0; c < WIND.cols; c++) { lats.push(WIND.minLat + r * WIND.step); lons.push(WIND.minLon + c * WIND.step); }
        }
        try {
            const data = await fetchJson(`${WEATHER_URL}?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
                '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh', 25000);
            if (seq !== windSeq) return;
            if (!Array.isArray(data) || data.length !== lats.length) throw new Error('bad_format');
            const field = { u: new Float32Array(data.length), v: new Float32Array(data.length), gust: new Float32Array(data.length) };
            let max = 0, maxAt = 0;
            data.forEach((d, i) => {
                const speed = Number(d && d.current && d.current.wind_speed_10m) || 0;
                const dir = (Number(d && d.current && d.current.wind_direction_10m) || 0) * Math.PI / 180;
                field.u[i] = -speed * Math.sin(dir);
                field.v[i] = -speed * Math.cos(dir);
                field.gust[i] = Number(d && d.current && d.current.wind_gusts_10m) || speed;
                if (speed > max) { max = speed; maxAt = i; }
            });
            windField = field;
            windLoadedAt = Date.now();
            setModeStatus('wind', `Anlık rüzgâr · bölgede en yüksek ${Math.round(max)} km/sa · Kaynak: Open-Meteo · Güncellendi: ${clockNow()}`, false);
            if (activeMode === 'wind') windStart();
        } catch (error) {
            if (seq !== windSeq) return;
            if (!windField) setModeStatus('wind', 'Rüzgâr verisi şu an alınamıyor.', true);
        }
    }

    // ---- Yağış radarı ----
    const rainLayer = L.layerGroup();
    let rainLoadedAt = 0;
    let rainSeq = 0;
    async function loadRain(force) {
        if (!force && Date.now() - rainLoadedAt < 5 * 60 * 1000) return;
        const seq = ++rainSeq;
        if (!rainLoadedAt) setModeStatus('rain', 'Yağış radarı yükleniyor…', false);
        try {
            const data = await fetchJson('https://api.rainviewer.com/public/weather-maps.json', 15000);
            if (seq !== rainSeq) return;
            const frames = data && data.radar && Array.isArray(data.radar.past) ? data.radar.past : [];
            const last = frames[frames.length - 1];
            if (!last || data.host !== 'https://tilecache.rainviewer.com' || !/^\/v2\/radar\/[A-Za-z0-9_]+$/.test(String(last.path))) throw new Error('bad_format');
            rainLayer.clearLayers();
            rainLayer.addLayer(L.tileLayer(`${data.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`, {
                opacity: 0.75, maxNativeZoom: 7, attribution: 'Yağış radarı: RainViewer'
            }));
            rainLoadedAt = Date.now();
            const at = new Date(last.time * 1000).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
            setModeStatus('rain', `Yağış radarı · son görüntü ${at} (TSİ) · Kaynak: RainViewer`, false);
        } catch (error) {
            if (seq !== rainSeq) return;
            if (!rainLoadedAt) setModeStatus('rain', 'Yağış radarı şu an alınamıyor.', true);
        }
    }

    // ---- Orman yangını tehlikesi (EFFIS / Copernicus) ----
    // Avrupa Orman Yangını Bilgi Sistemi'nin günlük yangın hava indeksi (FWI) tahmini; anahtar gerektirmez.
    const fireDangerToggle = document.getElementById('fireDanger');
    const fireGroup = L.layerGroup([thermalLayer]);
    let fireDangerLayer = null;
    function syncFireDanger() {
        const wanted = !fireDangerToggle || fireDangerToggle.checked;
        if (wanted && !fireDangerLayer) {
            fireDangerLayer = L.tileLayer.wms('https://maps.effis.emergency.copernicus.eu/effis', {
                layers: 'mf010.fwi', format: 'image/png', transparent: true, version: '1.1.1',
                time: new Date().toISOString().slice(0, 10), pane: 'shapes', opacity: 0.6,
                attribution: 'Yangın tehlikesi: EFFIS (Copernicus)'
            });
            fireGroup.addLayer(fireDangerLayer);
        } else if (!wanted && fireDangerLayer) {
            fireGroup.removeLayer(fireDangerLayer);
            fireDangerLayer = null;
        }
    }
    if (fireDangerToggle) fireDangerToggle.addEventListener('change', syncFireDanger);
    syncFireDanger();

    // ---- Deprem yükleme ----
    let loadController = null;
    let loadSeq = 0;
    const quakeListEl = document.getElementById('quakeList');

    function distanceKm(a, b) {
        const rad = Math.PI / 180;
        const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
        return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    // Farklı kaynakların bildirdiği aynı deprem tek kayıt olur (uygulamadaki kuralla aynı):
    // zaman farkı ≤ 60 sn, uzaklık ≤ 75 km, büyüklük farkı ≤ 1,5. Kaynak önceliği listedeki sıradır;
    // gösterilen değerler önceliği en yüksek kaynağınkidir.
    const MATCH = { seconds: 60, km: 75, magnitude: 1.5 };
    function mergeQuakes(listsInPriorityOrder) {
        const events = [];
        for (const list of listsInPriorityOrder) {
            for (const q of list) {
                let best = null, bestDt = Infinity;
                for (const ev of events) {
                    if (ev.readings.some((r) => r.source === q.source)) continue; // aynı kaynaktan iki kayıt birleşmez
                    const dt = Math.abs(ev.primary.timeMs - q.timeMs);
                    if (dt > MATCH.seconds * 1000 || dt >= bestDt) continue;
                    if (Math.abs(ev.primary.mag - q.mag) > MATCH.magnitude) continue;
                    if (distanceKm(ev.primary, q) > MATCH.km) continue;
                    best = ev; bestDt = dt;
                }
                if (best) best.readings.push(q);
                else events.push({ primary: q, readings: [q] });
            }
        }
        return events.sort((a, b) => b.primary.timeMs - a.primary.timeMs);
    }

    function relativeTime(ms) {
        const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
        if (min < 1) return 'az önce';
        if (min < 60) return `${min} dk önce`;
        const h = Math.floor(min / 60);
        if (h < 24) return `${h} sa ${min % 60} dk önce`;
        return `${Math.floor(h / 24)} gün önce`;
    }

    function renderQuakeList(events, markers) {
        if (!quakeListEl) return;
        quakeListEl.textContent = '';
        events.slice(0, 10).forEach((event, i) => {
            const eq = event.primary;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'quake-row';
            const mag = document.createElement('span');
            mag.className = 'quake-mag';
            mag.style.backgroundColor = magnitudeColor(eq.mag);
            mag.textContent = eq.mag.toFixed(1);
            row.appendChild(mag);
            const body = document.createElement('span');
            body.className = 'quake-body';
            const place = document.createElement('span');
            place.className = 'quake-place';
            place.textContent = event.readings.map((r) => r.place).find(Boolean) || 'Konum bilgisi yok';
            body.appendChild(place);
            const meta = document.createElement('span');
            meta.className = 'quake-meta';
            const depth = Number.isFinite(eq.depth) ? ` · ${eq.depth.toFixed(0)} km derinlik` : '';
            meta.textContent = `${relativeTime(eq.timeMs)} · ${trTime(eq.timeMs, true)}${depth} · ` +
                (event.readings.length > 1 ? `${event.readings.length} kaynak` : sourceLabel(eq));
            body.appendChild(meta);
            row.appendChild(body);
            row.addEventListener('click', () => {
                const marker = markers[i];
                mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (quakeLayer.zoomToShowLayer) quakeLayer.zoomToShowLayer(marker, () => marker.openPopup());
                else { map.setView(marker.getLatLng(), 9); marker.openPopup(); }
            });
            quakeListEl.appendChild(row);
        });
    }

    async function loadEarthquakes() {
        const range = (timeRangeSelect && timeRangeSelect.value) || '1_day';
        const minMag = Number((minMagSelect && minMagSelect.value) || 3.0);
        // Eşleştirme için kaynaklardan biraz daha küçük depremler de istenir (büyüklükler kaynağa göre değişir).
        const fetchMin = Math.max(0, minMag - 0.5);
        if (loadController) loadController.abort();
        loadController = new AbortController();
        const seq = ++loadSeq;
        if (!statusByMode.quakes) setModeStatus('quakes', 'Deprem verisi yükleniyor…', false);

        // Bütün kaynaklara aynı anda sorulur; yanıt verenler birleştirilir.
        const results = await Promise.allSettled(SOURCES.map((source) =>
            fetchJson(source.url(range, fetchMin), source.timeoutMs, loadController.signal)
                .then((data) => normalize(source.parse(data)).map((q) => Object.assign(q, { source: source.short, sourceName: source.name })))));
        if (seq !== loadSeq) return;

        const lists = [], okNames = [], failedNames = [];
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') { lists.push(r.value); okNames.push(`${SOURCES[i].short} (${r.value.filter((q) => q.mag >= minMag).length})`); }
            else failedNames.push(SOURCES[i].short);
        });
        if (!lists.length) {
            // Hiçbir kaynak yanıt vermedi: eski işaretler kalır, "deprem yok" izlenimi verilmez.
            setModeStatus('quakes', 'Deprem verisi şu an alınamıyor. Resmî bilgi için AFAD ve Kandilli Rasathanesi\'ni takip edin.', true);
            return;
        }

        // Kaynaklardan herhangi biri depremi seçilen büyüklüğün üzerinde ölçtüyse gösterilir
        // (bir kurum 2,9, diğeri 3,1 dediğinde deprem listeden düşmesin).
        const events = mergeQuakes(lists).filter((ev) => ev.readings.some((r) => r.mag >= minMag));
        quakeLayer.clearLayers();
        const markers = events.map((ev) => createMarker(ev));
        markers.forEach((m) => quakeLayer.addLayer(m));
        renderQuakeList(events, markers);

        const matched = events.filter((ev) => ev.readings.length > 1).length;
        const parts = [
            events.length ? `${events.length} deprem` : `Seçilen aralıkta M ${minMag.toFixed(1)} ve üzeri deprem yok`,
            `Kaynaklar: ${okNames.join(', ')}`
        ];
        if (matched) parts.push(`${matched} deprem birden çok kaynakta eşleşti`);
        if (failedNames.length) parts.push(`ulaşılamayan: ${failedNames.join(', ')}`);
        parts.push(`Güncellendi: ${clockNow()}`);
        setModeStatus('quakes', parts.join(' · '), false);
    }

    // ---- Katman düğmeleri ve kontroller ----
    const MODES = {
        quakes: { layer: quakeLayer, load: () => loadEarthquakes() },
        weather: { layer: weatherLayer, load: (force) => loadWeather(force) },
        alerts: { layer: alertLayer, load: (force) => loadAlerts(force) },
        wind: { layer: windLayer, load: (force) => loadWind(force) },
        rain: { layer: rainLayer, load: (force) => loadRain(force) },
        thermal: { layer: fireGroup, load: (force) => loadThermal(force) }
    };

    function setMode(mode, remember) {
        if (!MODES[mode]) mode = 'quakes';
        activeMode = mode;
        map.closePopup();
        Object.keys(MODES).forEach((key) => {
            const layer = MODES[key].layer;
            if (key === mode) { if (!map.hasLayer(layer)) map.addLayer(layer); }
            else if (map.hasLayer(layer)) map.removeLayer(layer);
        });
        // Isı haritasının çizim yüzeyi (canvas) haritanın tamamını kaplar; katman kapalıyken haritada
        // kalırsa il alanlarının üzerine gelmeyi ve tıklamayı engeller. Kapalıyken kaldırılır,
        // katman yeniden açılınca Leaflet kendisi geri ekler.
        if (mode !== 'thermal' && map.hasLayer(thermalRenderer)) map.removeLayer(thermalRenderer);
        if (mode !== 'wind') windStop(true);
        tabButtons.forEach((btn) => {
            const on = btn.dataset.mode === mode;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        modeOnlyEls.forEach((el) => { el.hidden = !el.dataset.modeOnly.split(' ').includes(mode); });
        const st = statusByMode[mode];
        if (statusEl) {
            statusEl.textContent = st ? st.text : 'Yükleniyor…';
            statusEl.classList.toggle('map-status-error', Boolean(st && st.isError));
        }
        if (remember) writePref('erkenuyar_mapMode', mode);
        MODES[mode].load(false);
        declutterWeatherLabels();
    }

    const savedMinMag = readPref('erkenuyar_minMag');
    if (savedMinMag && minMagSelect && [...minMagSelect.options].some((o) => o.value === savedMinMag)) {
        minMagSelect.value = savedMinMag;
    }
    const savedRange = readPref('erkenuyar_timeRange');
    if (savedRange && timeRangeSelect && RANGE_HOURS[savedRange]) {
        timeRangeSelect.value = savedRange;
    }

    tabButtons.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode, true)));
    if (minMagSelect) minMagSelect.addEventListener('change', () => {
        writePref('erkenuyar_minMag', minMagSelect.value);
        loadEarthquakes();
    });
    if (timeRangeSelect) timeRangeSelect.addEventListener('change', () => {
        writePref('erkenuyar_timeRange', timeRangeSelect.value);
        loadEarthquakes();
    });
    if (alertDaySelect) alertDaySelect.addEventListener('change', () => loadAlerts(false));
    if (refreshBtn) refreshBtn.addEventListener('click', () => MODES[activeMode].load(true));
    // Konum yalnızca kullanıcı düğmeye basınca istenir (sayfa açılır açılmaz izin sorulmaz).
    if (locateBtn) {
        if (!navigator.geolocation) {
            locateBtn.hidden = true;
        } else {
            locateBtn.addEventListener('click', () => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 8),
                    () => {
                        // Konum hatası katmanın kendi durum metninin yerine kalıcı olarak geçmesin.
                        const mode = activeMode;
                        const previous = statusByMode[mode];
                        setModeStatus(mode, 'Konum alınamadı. Tarayıcı konum iznini kontrol edin.', true);
                        setTimeout(() => {
                            const now = statusByMode[mode];
                            if (previous && now && now.text.startsWith('Konum alınamadı')) setModeStatus(mode, previous.text, previous.isError);
                        }, 4000);
                    },
                    { maximumAge: 5 * 60 * 1000, timeout: 10000 }
                );
            });
        }
    }

    setMode(readPref('erkenuyar_mapMode') || 'quakes', false);
    // Açık olan katman kendini yeniler (deprem 90 sn; diğerleri kendi sürelerine göre).
    let mapOnScreen = true;
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            const wasOff = !mapOnScreen;
            mapOnScreen = entries[0].isIntersecting;
            if (activeMode === 'wind') { if (mapOnScreen) windStart(); else windStop(false); }
            if (mapOnScreen && wasOff) MODES[activeMode].load(false); // geri gelince hemen tazele
        }).observe(mapEl);
    }
    setInterval(() => { if (!document.hidden && mapOnScreen) MODES[activeMode].load(false); }, REFRESH_MS);
    setTimeout(() => map.invalidateSize(), 250);
    window.addEventListener('load', () => map.invalidateSize());
})();
