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
    const PROVINCES = [[1,"Adana",37.0,35.3],[2,"Adıyaman",37.8,38.3],[3,"Afyonkarahisar",38.8,30.5],[4,"Ağrı",39.7,43.0],[5,"Amasya",40.7,35.8],[6,"Ankara",39.9,32.9],[7,"Antalya",36.9,30.7],[8,"Artvin",41.2,41.8],[9,"Aydın",37.8,27.8],[10,"Balıkesir",39.6,27.9],[11,"Bilecik",40.1,30.0],[12,"Bingöl",38.9,40.5],[13,"Bitlis",38.4,42.1],[14,"Bolu",40.7,31.6],[15,"Burdur",37.7,30.3],[16,"Bursa",40.2,29.1],[17,"Çanakkale",40.15,26.41],[18,"Çankırı",40.6,33.6],[19,"Çorum",40.5,34.9],[20,"Denizli",37.8,29.1],[21,"Diyarbakır",37.9,40.2],[22,"Edirne",41.7,26.6],[23,"Elazığ",38.7,39.2],[24,"Erzincan",39.8,39.5],[25,"Erzurum",39.9,41.3],[26,"Eskişehir",39.8,30.5],[27,"Gaziantep",37.1,37.4],[28,"Giresun",40.9,38.4],[29,"Gümüşhane",40.5,39.5],[30,"Hakkari",37.6,43.7],[31,"Hatay",36.4,36.2],[32,"Isparta",37.8,30.6],[33,"Mersin",36.8,34.6],[34,"İstanbul",41.0,28.9],[35,"İzmir",38.4,27.1],[36,"Kars",40.6,43.1],[37,"Kastamonu",41.4,33.8],[38,"Kayseri",38.7,35.5],[39,"Kırklareli",41.7,27.2],[40,"Kırşehir",39.1,34.2],[41,"Kocaeli",40.8,29.9],[42,"Konya",37.9,32.5],[43,"Kütahya",39.4,29.9],[44,"Malatya",38.4,38.3],[45,"Manisa",38.6,27.4],[46,"Kahramanmaraş",37.6,36.9],[47,"Mardin",37.3,40.7],[48,"Muğla",37.2,28.4],[49,"Muş",38.7,41.5],[50,"Nevşehir",38.6,34.7],[51,"Niğde",37.9,34.7],[52,"Ordu",40.9,37.9],[53,"Rize",41.0,40.5],[54,"Sakarya",40.8,30.4],[55,"Samsun",41.3,36.3],[56,"Siirt",37.9,41.9],[57,"Sinop",42.02,35.15],[58,"Sivas",39.7,37.0],[59,"Tekirdağ",40.98,27.51],[60,"Tokat",40.3,36.6],[61,"Trabzon",41.0,39.7],[62,"Tunceli",39.1,39.5],[63,"Şanlıurfa",37.2,38.8],[64,"Uşak",38.7,29.4],[65,"Van",38.5,43.4],[66,"Yozgat",39.8,34.8],[67,"Zonguldak",41.45,31.79],[68,"Aksaray",38.4,34.0],[69,"Bayburt",40.3,40.2],[70,"Karaman",37.2,33.2],[71,"Kırıkkale",39.8,33.5],[72,"Batman",37.9,41.1],[73,"Şırnak",37.5,42.5],[74,"Bartın",41.6,32.3],[75,"Ardahan",41.1,42.7],[76,"Iğdır",39.9,44.0],[77,"Yalova",40.65,29.27],[78,"Karabük",41.2,32.6],[79,"Kilis",36.7,37.1],[80,"Osmaniye",37.1,36.2],[81,"Düzce",40.8,31.2]];
    const POPUP_OPTS = { autoPanPaddingTopLeft: [12, 70], autoPanPaddingBottomRight: [60, 12], maxWidth: 300 };
    // Açılışta gösterilen alan (Türkiye) ve haritanın gezilebildiği en geniş alan. Rüzgâr verisi bu
    // geniş alanın tamamı için alınır; harita bunun dışına çıkamadığından kenarda boşluk kalmaz.
    const TURKEY_BOUNDS = [[35.8, 25.7], [42.2, 44.9]];
    const VIEW_BOUNDS = [[24.5, 14.5], [51.0, 56.0]];
    // Harita kartının durumu: küçük (önizleme) ya da büyük; geçiş sürerken animating doğrudur.
    let expanded = false, animating = false;

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

    // Yer adları: Kandilli adları büyük harfle ve Türkçe karaktersiz yayımlar ("AKOLUK-FEKE (ADANA)").
    // Ayrıntı (köy-ilçe) korunur, il adı eşleşmişse düzgün yazımıyla eklenir.
    function titleCase(text, locale) {
        return String(text).toLocaleLowerCase(locale).replace(/(^|[\s\-(/])([^\s\-(/])/g, (m, sep, ch) => sep + ch.toLocaleUpperCase(locale));
    }
    function koeriPlace(raw, matched) {
        const rawText = typeof raw === 'string' ? raw.trim() : '';
        const matchedText = typeof matched === 'string' ? matched.trim() : '';
        if (matchedText.includes('(')) return titleCase(matchedText, 'tr');
        const detail = titleCase(rawText.replace(/\s*\([^)]*\)\s*$/, '').replace(/-+$/, ''), 'en');
        if (matchedText) return detail && detail.toLocaleLowerCase('tr') !== matchedText.toLocaleLowerCase('tr') ? `${detail} (${matchedText})` : matchedText;
        return titleCase(rawText, 'en');
    }
    // EMSC bölge adları İngilizcedir; sık görülenler Türkçeleştirilir.
    const REGION_TR = {
        'WESTERN TURKEY': 'Batı Türkiye', 'CENTRAL TURKEY': 'Orta Türkiye', 'EASTERN TURKEY': 'Doğu Türkiye',
        'NEAR THE COAST OF WESTERN TURKEY': 'Batı Türkiye kıyıları', 'AEGEAN SEA': 'Ege Denizi', 'BLACK SEA': 'Karadeniz',
        'SEA OF MARMARA': 'Marmara Denizi', 'EASTERN MEDITERRANEAN SEA': 'Doğu Akdeniz', 'CYPRUS REGION': 'Kıbrıs bölgesi',
        'TURKEY-SYRIA BORDER REGION': 'Türkiye-Suriye sınır bölgesi', 'TURKEY-IRAN BORDER REGION': 'Türkiye-İran sınır bölgesi',
        'TURKEY-IRAQ BORDER REGION': 'Türkiye-Irak sınır bölgesi', 'TURKEY-SYRIA-IRAQ BORDER REGION': 'Türkiye-Suriye-Irak sınır bölgesi',
        'GEORGIA-ARMENIA-TURKEY BORDER REG': 'Gürcistan-Ermenistan-Türkiye sınır bölgesi', 'ARMENIA-AZERBAIJAN-IRAN BORD REG': 'Ermenistan-Azerbaycan-İran sınır bölgesi',
        'DODECANESE ISLANDS, GREECE': 'Onikiada (Yunanistan)', 'DODECANESE IS.-TURKEY BORDER REG': 'Onikiada-Türkiye sınır bölgesi',
        'CRETE, GREECE': 'Girit (Yunanistan)', 'GREECE': 'Yunanistan', 'BULGARIA': 'Bulgaristan', 'SYRIA': 'Suriye', 'IRAQ': 'Irak',
        'ARMENIA': 'Ermenistan', 'NORTHWESTERN IRAN': 'Kuzeybatı İran', 'WESTERN IRAN': 'Batı İran', 'IRAN-IRAQ BORDER REGION': 'İran-Irak sınır bölgesi',
        "GEORGIA (SAK'ART'VELO)": 'Gürcistan', 'GREECE-BULGARIA BORDER REGION': 'Yunanistan-Bulgaristan sınır bölgesi'
    };
    function regionPlace(name) {
        const key = typeof name === 'string' ? name.trim().toUpperCase() : '';
        if (!key) return '';
        return REGION_TR[key] || titleCase(key, 'en');
    }

    // Deprem kaynakları. Hepsine aynı anda sorulur; yanıt verenler birleştirilir. Sıra, önceliktir.
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
                    place: koeriPlace(i.raw_place, i.matched_place),
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
                        place: regionPlace(p.flynn_region), time: p.time, magType: p.magtype, agency: p.auth };
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
        for (const raw of list.slice(0, 2000)) {
            if (!raw || typeof raw !== 'object') continue;
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
        const marker = L.marker([eq.lat, eq.lon], { icon, title: `M ${magText}`, mag: eq.mag });
        marker.bindPopup(quakePopup(event), POPUP_OPTS);
        return marker;
    }

    // ---- Harita ----
    // Küçükken harita önizlemedir: sürüklenmez, yakınlaşmaz (telefonda sayfa kaydırmayı tutmasın).
    // Büyütülünce bütün hareketler açılır (aşağıda, "Büyüt / küçült" bölümünde).
    const map = L.map(mapEl, { center: [39.0, 35.3], zoom: 5, minZoom: 4, maxZoom: 12, zoomSnap: 0.25, zoomDelta: 0.5,
        wheelPxPerZoomLevel: 90, zoomControl: false, maxBounds: VIEW_BOUNDS, maxBoundsViscosity: 1,
        dragging: false, touchZoom: false, doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false, keyboard: false });
    function fitTurkey(animate) {
        map.fitBounds(TURKEY_BOUNDS, { paddingTopLeft: [8, 56], paddingBottomRight: [8, 8], animate: Boolean(animate) });
    }
    // En uzak yakınlaştırma: görünen alan gezilebilir alanın dışına taşmayacak kadar.
    function syncMinZoom() {
        const size = map.getSize();
        if (animating || !size.x || !size.y) return;
        const min = Math.min(8, map.getBoundsZoom(VIEW_BOUNDS, true));
        // Önce (animasyonsuz) yakınlaştır: setMinZoom kendi başına animasyonlu yakınlaştırır ve hemen
        // ardından gelen "Türkiye'ye oturt" çağrısını geri alır.
        if (map.getZoom() < min) map.setView(map.getCenter(), min, { animate: false });
        map.setMinZoom(min);
    }
    map.on('resize', () => { syncMinZoom(); if (!expanded && !animating) fitTurkey(false); });
    syncMinZoom();
    fitTurkey(false);
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
            // Küme nötr renktedir ve içindeki sayı adettir; halka, kümedeki en büyük depremin rengidir.
            iconCreateFunction: (cluster) => {
                const maxMag = cluster.getAllChildMarkers().reduce((m, c) => Math.max(m, c.options.mag || 0), 0);
                return L.divIcon({
                    html: `<div class="eq-cluster" style="border-color:${magnitudeColor(maxMag)};" title="${cluster.getChildCount()} deprem, en büyüğü M ${maxMag.toFixed(1)}">${cluster.getChildCount()}<small>×</small></div>`,
                    className: 'earthquake-marker',
                    iconSize: [40, 40]
                });
            }
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
        { lat: 40.87, lon: 29.34, r: 0.06, name: 'Tuzla sanayi bölgesi' },
        { lat: 40.98, lon: 28.69, r: 0.04, name: 'Ambarlı santrali' },
        { lat: 38.81, lon: 26.94, r: 0.05, name: 'Aliağa sanayi bölgesi' },
        { lat: 40.76, lon: 29.93, r: 0.05, name: 'İzmit sanayi bölgesi' },
        { lat: 38.35, lon: 36.99, r: 0.05, name: 'Afşin-Elbistan santrali' },
        { lat: 39.19, lon: 27.64, r: 0.04, name: 'Soma santrali' },
        { lat: 37.33, lon: 28.10, r: 0.04, name: 'Yatağan santrali' },
        { lat: 37.03, lon: 27.90, r: 0.04, name: 'Kemerköy santrali' },
        { lat: 36.71, lon: 36.21, r: 0.05, name: 'İskenderun demir-çelik' },
        { lat: 41.18, lon: 32.63, r: 0.04, name: 'Karabük demir-çelik' },
        { lat: 41.26, lon: 31.42, r: 0.04, name: 'Ereğli demir-çelik' }
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
        thermalStatusText = total
            ? `Son iki günde ${total} sıcak nokta · Kaynak: NASA VIIRS uyduları · Güncellendi: ${clockNow()}`
            : `Son iki günde sıcak nokta algılanmadı · Kaynak: NASA VIIRS uyduları · Güncellendi: ${clockNow()}`;
        showThermalStatus();
    }

    // ---- Hava tahmini (il merkezleri) ----
    const WMO = [
        [[0], '☀️', 'Açık'], [[1], '🌤️', 'Az bulutlu'], [[2], '⛅', 'Parçalı bulutlu'], [[3], '☁️', 'Kapalı'],
        [[45, 48], '🌫️', 'Sisli'], [[51, 53, 55, 56, 57], '🌦️', 'Çisenti'],
        [[61, 63, 65, 66, 67], '🌧️', 'Yağmurlu'], [[71, 73, 75, 77], '🌨️', 'Kar yağışlı'],
        [[80, 81, 82], '🌧️', 'Sağanak yağışlı'], [[85, 86], '🌨️', 'Kar sağanağı'],
        [[95, 96, 99], '⛈️', 'Gök gürültülü sağanak']
    ];
    function wmoInfo(code, isNight) {
        const hit = WMO.find((w) => w[0].includes(Number(code)));
        if (!hit) return { icon: '🌡️', text: 'Bilinmiyor' };
        // Gece: açık ve az bulutlu havada güneş yerine ay.
        const icon = isNight && Number(code) <= 1 ? '🌙' : (isNight && Number(code) === 2 ? '☁️' : hit[1]);
        return { icon, text: hit[2] };
    }
    const isNightNow = (w) => w && w.current && Number(w.current.is_day) === 0;
    const weatherLayer = L.layerGroup();
    let weatherLoadedAt = 0;
    let weatherSeq = 0;

    function weatherBox(provinceName, w, compact) {
        const now = wmoInfo(w.current.weather_code, isNightNow(w));
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
        const now = wmoInfo(w.current.weather_code, isNightNow(w));
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
            '&current=temperature_2m,weather_code,wind_speed_10m,is_day' +
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
    let alertShown = null; // haritada şu an çizili olan önbellek kaydı
    let alertSeq = 0;

    // MGM kaydı ilçe kodlarıyla gelir (9PPNN; PP = il plakası). İl bazında en yüksek seviye alınır.
    function aggregateAlerts(list) {
        const byPlate = new Map();
        for (const alert of list.slice(0, 300)) {
            if (!alert || typeof alert !== 'object') continue;
            for (const level of Object.keys(ALERT_LEVELS)) {
                const towns = alert.towns && Array.isArray(alert.towns[level]) ? alert.towns[level].slice(0, 2000) : [];
                if (!towns.length) continue;
                const hazards = alert.weather && Array.isArray(alert.weather[level]) ? alert.weather[level].slice(0, 8) : [];
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
                    setExpanded(true, () => {
                        if (bounds.isValid()) map.flyToBounds(bounds, { paddingTopLeft: [30, 70], paddingBottomRight: [30, 30], maxZoom: 8, duration: 0.6 });
                    });
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
                alertShown = null;
                alertLayer.clearLayers();
                if (alertSummaryEl) alertSummaryEl.textContent = '';
                setModeStatus('alerts', 'MGM uyarılarına şu an ulaşılamıyor. Güncel uyarılar için mgm.gov.tr adresine bakın.', true);
                return;
            }
        }
        if (alertShown === cached) return; // aynı veri zaten haritada
        const count = await renderAlerts(cached.provinces, seq);
        if (count < 0 || seq !== alertSeq) return;
        alertShown = cached;
        renderAlertSummary(cached.provinces);
        const clock = new Date(cached.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        setModeStatus('alerts', count
            ? `${count} ilde ${dayLabel} için meteorolojik uyarı var · Kaynak: MGM · Güncellendi: ${clock}`
            : `MGM'ye göre ${dayLabel} için yürürlükte meteorolojik uyarı yok · Güncellendi: ${clock}`, false);
        // Bugün uyarı yoksa yarın için yayımlanmış uyarı olup olmadığı da belirtilir.
        if (!count && day === 'today') {
            try {
                if (!alertCache.tomorrow || Date.now() - alertCache.tomorrow.at > 10 * 60 * 1000) {
                    const next = await fetchJson(`${MGM_URL}?which=tomorrow`, 15000);
                    if (seq !== alertSeq || !next || next.ok !== true || !Array.isArray(next.data)) return;
                    alertCache.tomorrow = { at: Date.now(), provinces: aggregateAlerts(next.data) };
                }
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
    // İki ızgara: Türkiye üzerinde sık (1°), gezilebilir alanın tamamında seyrek (2,5°). İkisi sınırda
    // yumuşakça birbirine karışır; böylece uzaklaşınca da haritanın her yerinde rüzgâr görünür.
    function makeGrid(minLat, maxLat, minLon, maxLon, step) {
        return { minLat, maxLat, minLon, maxLon, step, rows: Math.round((maxLat - minLat) / step) + 1, cols: Math.round((maxLon - minLon) / step) + 1 };
    }
    const WIND_INNER = makeGrid(34, 44, 24, 46, 1);
    const WIND_OUTER = makeGrid(24, 51.5, 14, 56.5, 2.5);
    const WIND = { refreshMs: 30 * 60 * 1000, blendDeg: 1.5 };
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

    let windField = null; // { inner, outer }; her biri { u, v, gust } Float32Array (rows × cols), km/sa ya da null
    let windLastTs = 0;
    let windLoadedAt = 0;
    let windSeq = 0;
    let windParticles = [];
    let windFrame = null;
    let windRunning = false;

    function sampleGrid(grid, field, lat, lon) {
        if (!field) return null;
        const y = (lat - grid.minLat) / grid.step, x = (lon - grid.minLon) / grid.step;
        if (x < 0 || y < 0 || x > grid.cols - 1 || y > grid.rows - 1) return null;
        const x0 = Math.min(grid.cols - 2, Math.floor(x)), y0 = Math.min(grid.rows - 2, Math.floor(y));
        const fx = x - x0, fy = y - y0;
        const at = (arr, r, c) => arr[r * grid.cols + c];
        const mix = (arr) => at(arr, y0, x0) * (1 - fx) * (1 - fy) + at(arr, y0, x0 + 1) * fx * (1 - fy) +
            at(arr, y0 + 1, x0) * (1 - fx) * fy + at(arr, y0 + 1, x0 + 1) * fx * fy;
        return { u: mix(field.u), v: mix(field.v), gust: mix(field.gust) };
    }
    function windAt(lat, lon) {
        if (!windField) return null;
        const inner = sampleGrid(WIND_INNER, windField.inner, lat, lon);
        const outer = sampleGrid(WIND_OUTER, windField.outer, lat, lon);
        let w = inner || outer;
        if (inner && outer) {
            // Sık ızgaranın kenarına yaklaştıkça seyrek ızgaraya geçilir (dikiş izi kalmasın).
            const edge = Math.min(lat - WIND_INNER.minLat, WIND_INNER.maxLat - lat, lon - WIND_INNER.minLon, WIND_INNER.maxLon - lon);
            const k = Math.max(0, Math.min(1, edge / WIND.blendDeg));
            w = { u: outer.u + (inner.u - outer.u) * k, v: outer.v + (inner.v - outer.v) * k, gust: outer.gust + (inner.gust - outer.gust) * k };
        }
        if (!w) return null;
        w.speed = Math.hypot(w.u, w.v);
        return w;
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
        return { x: Math.random() * size.x, y: Math.random() * size.y, age: Math.random() * 2, life: 2.5 + Math.random() * 3 };
    }

    function resetWind() {
        if (!windField) return;
        const size = sizeWindCanvases();
        drawWindBackground(size);
        windCtx.clearRect(0, 0, size.x, size.y);
        const count = Math.round(Math.min(1600, Math.max(300, size.x * size.y / 520)));
        windParticles = Array.from({ length: count }, () => spawnParticle(size));
        windLastTs = 0;
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

    // Akış hızı kare sayısına değil geçen süreye bağlıdır (120 Hz ekranda iki kat hızlı akmasın).
    // 6. yakınlaştırmada 20 km/sa'lik rüzgâr saniyede yaklaşık 17 piksel ilerler: yön okunur, göz yorulmaz.
    function stepWind(ts) {
        windFrame = null;
        if (!windRunning || !windField) return;
        const dt = windLastTs ? Math.min(0.05, (ts - windLastTs) / 1000) : 0.016;
        windLastTs = ts;
        const size = map.getSize();
        // Önceki kareyi soldur: izler kuyruk bırakır.
        windCtx.globalCompositeOperation = 'destination-in';
        windCtx.fillStyle = `rgba(0, 0, 0, ${Math.pow(0.955, dt * 60).toFixed(4)})`;
        windCtx.fillRect(0, 0, size.x, size.y);
        windCtx.globalCompositeOperation = 'source-over';
        windCtx.lineWidth = 1.5;
        windCtx.lineCap = 'round';
        windCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        windCtx.beginPath();
        const pxPerKmh = 0.85 * Math.pow(1.22, map.getZoom() - 6) * dt;
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
            p.x = nx; p.y = ny; p.age += dt;
        }
        windCtx.stroke();
        // Beyaz izlerin açık zeminde de seçilmesi için ince koyu gölge.
        windCtx.globalCompositeOperation = 'destination-over';
        windCtx.strokeStyle = 'rgba(20, 40, 60, 0.3)';
        windCtx.lineWidth = 3;
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
    map.on('moveend zoomend resize', () => { if (activeMode === 'wind' && windField && !animating) resetWind(); });
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

    function windUrl(grid) {
        const lats = [], lons = [];
        for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) { lats.push(grid.minLat + r * grid.step); lons.push(grid.minLon + c * grid.step); }
        }
        return `${WEATHER_URL}?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
            '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh';
    }
    function windFieldFrom(grid, data) {
        const n = grid.rows * grid.cols;
        if (!Array.isArray(data) || data.length !== n) throw new Error('bad_format');
        const field = { u: new Float32Array(n), v: new Float32Array(n), gust: new Float32Array(n), max: 0 };
        data.forEach((d, i) => {
            const speed = Number(d && d.current && d.current.wind_speed_10m) || 0;
            const dir = (Number(d && d.current && d.current.wind_direction_10m) || 0) * Math.PI / 180;
            field.u[i] = -speed * Math.sin(dir);
            field.v[i] = -speed * Math.cos(dir);
            field.gust[i] = Number(d && d.current && d.current.wind_gusts_10m) || speed;
            if (speed > field.max) field.max = speed;
        });
        return field;
    }

    async function loadWind(force) {
        if (!force && windField && Date.now() - windLoadedAt < WIND.refreshMs) { if (activeMode === 'wind') windStart(); return; }
        const seq = ++windSeq;
        if (!windField) setModeStatus('wind', 'Rüzgâr verisi yükleniyor…', false);
        const [inner, outer] = await Promise.allSettled([
            fetchJson(windUrl(WIND_INNER), 25000).then((d) => windFieldFrom(WIND_INNER, d)),
            fetchJson(windUrl(WIND_OUTER), 25000).then((d) => windFieldFrom(WIND_OUTER, d))
        ]);
        if (seq !== windSeq) return;
        if (inner.status !== 'fulfilled' && outer.status !== 'fulfilled') {
            if (!windField) setModeStatus('wind', 'Rüzgâr verisi şu an alınamıyor.', true);
            return;
        }
        // Biri alınamadıysa eldeki eski veri korunur.
        windField = {
            inner: inner.status === 'fulfilled' ? inner.value : (windField && windField.inner) || null,
            outer: outer.status === 'fulfilled' ? outer.value : (windField && windField.outer) || null
        };
        windLoadedAt = Date.now();
        const max = windField.inner ? windField.inner.max : windField.outer.max;
        setModeStatus('wind', `Anlık rüzgâr · Türkiye ve çevresinde en yüksek ${Math.round(max)} km/sa · Kaynak: Open-Meteo · Güncellendi: ${clockNow()}` +
            (windField.inner && windField.outer ? '' : ' · verinin bir bölümü alınamadı'), false);
        if (activeMode === 'wind') windStart();
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
    const fwiLegendEl = document.getElementById('fwiLegend');
    let fwiState = 'idle'; // idle | ok | failed
    let thermalStatusText = '';
    function showThermalStatus() {
        if (!thermalStatusText) return;
        const wanted = !fireDangerToggle || fireDangerToggle.checked;
        setModeStatus('thermal', thermalStatusText + (wanted && fwiState === 'failed'
            ? ' · Orman yangını tehlikesi katmanı şu an alınamıyor (kaynak: EFFIS)' : ''), false);
    }
    function syncFwiLegend() {
        const wanted = !fireDangerToggle || fireDangerToggle.checked;
        if (fwiLegendEl) fwiLegendEl.hidden = activeMode !== 'thermal' || !wanted || fwiState === 'failed';
    }
    // Aynı veri (EFFIS yangın hava indeksi) Avrupa Komisyonu'nun iki adresinden yayımlanır. Biri yanıt
    // vermezse (sertifika sorunu, kesinti) öbürü denenir; ikisi de vermezse durum satırında söylenir.
    const FWI_HOSTS = ['https://maps.effis.emergency.copernicus.eu/effis', 'https://maps.wild-fire.eu/effis'];
    let fwiHost = 0;
    function addFireDangerLayer() {
        let loaded = 0, failed = 0;
        const layer = L.tileLayer.wms(FWI_HOSTS[fwiHost], {
            layers: 'mf010.fwi', format: 'image/png', transparent: true, version: '1.1.1',
            time: new Date().toISOString().slice(0, 10), pane: 'shapes', opacity: 0.6,
            attribution: 'Yangın tehlikesi: EFFIS (Copernicus)'
        });
        const settle = () => {
            if (layer !== fireDangerLayer) return;
            if (!loaded && failed && fwiHost < FWI_HOSTS.length - 1) {
                // Bu adres yanıt vermiyor: sıradakine geç (sonraki açılışlarda da ondan başlanır).
                fwiHost++;
                fireGroup.removeLayer(layer);
                addFireDangerLayer();
                return;
            }
            const next = loaded ? 'ok' : (failed ? 'failed' : fwiState);
            if (next === fwiState) return;
            fwiState = next; syncFwiLegend(); showThermalStatus();
        };
        layer.on('tileload', () => { loaded++; settle(); });
        layer.on('tileerror', () => { failed++; settle(); });
        fireDangerLayer = layer;
        fireGroup.addLayer(layer);
    }
    function syncFireDanger() {
        const wanted = !fireDangerToggle || fireDangerToggle.checked;
        if (wanted && !fireDangerLayer) {
            fwiState = 'idle';
            addFireDangerLayer();
        } else if (!wanted && fireDangerLayer) {
            fireGroup.removeLayer(fireDangerLayer);
            fireDangerLayer = null;
            fwiState = 'idle';
        }
        syncFwiLegend(); showThermalStatus();
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
                setExpanded(true, () => {
                    if (quakeLayer.zoomToShowLayer) quakeLayer.zoomToShowLayer(marker, () => marker.openPopup());
                    else { map.setView(marker.getLatLng(), 9); marker.openPopup(); }
                });
            });
            quakeListEl.appendChild(row);
        });
    }

    let quakeSig = '';
    let openQuakeKey = null;
    const quakeKey = (ev) => `${ev.primary.source}:${ev.primary.id || ev.primary.timeMs}`;

    // byUser: kullanıcı bir seçimi değiştirdi ya da Yenile'ye bastı (hemen "yükleniyor" yazılır).
    async function loadEarthquakes(byUser) {
        const range = (timeRangeSelect && timeRangeSelect.value) || '1_day';
        const minMag = Number((minMagSelect && minMagSelect.value) || 3.0);
        // Eşleştirme için kaynaklardan biraz daha küçük depremler de istenir (büyüklükler kaynağa göre değişir).
        const fetchMin = Math.max(0, minMag - 0.5);
        if (loadController) loadController.abort();
        loadController = new AbortController();
        const seq = ++loadSeq;
        if (byUser || !statusByMode.quakes) setModeStatus('quakes', 'Depremler yükleniyor…', false);

        const lists = SOURCES.map(() => null), state = SOURCES.map(() => 'pending'), rawCounts = SOURCES.map(() => 0);

        const render = () => {
            const pending = state.includes('pending');
            const have = lists.filter(Boolean);
            if (!have.length) {
                // Hiçbir kaynak yanıt vermedi: eski işaretler kalır, "deprem yok" izlenimi verilmez.
                if (!pending) setModeStatus('quakes', 'Deprem verisi şu an alınamıyor. Resmî bilgi için AFAD ve Kandilli Rasathanesi\'ni takip edin.', true);
                return;
            }
            // Süzgeç, haritada yazan (öncelikli kaynağın) büyüklüğe göre uygulanır: "3.0+" seçiliyken
            // işaretinde 2,9 yazan deprem görünmez.
            const events = mergeQuakes(have).filter((ev) => ev.primary.mag >= minMag);
            const sig = `${range}|${minMag}|` + events.map((ev) => `${quakeKey(ev)}:${ev.primary.mag}:${ev.readings.length}`).join(',');
            // Veri değişmediyse harita yeniden çizilmez (açık bilgi kutusu ve açılmış kümeler bozulmasın).
            if (sig !== quakeSig) {
                quakeSig = sig;
                const reopen = openQuakeKey;
                quakeLayer.clearLayers();
                const markers = events.map((ev) => {
                    const marker = createMarker(ev), key = quakeKey(ev);
                    marker.on('popupopen', () => { openQuakeKey = key; });
                    marker.on('popupclose', () => { if (openQuakeKey === key) openQuakeKey = null; });
                    return marker;
                });
                markers.forEach((m) => quakeLayer.addLayer(m));
                renderQuakeList(events, markers);
                if (reopen) {
                    const i = events.findIndex((ev) => quakeKey(ev) === reopen);
                    const shown = i >= 0 && (!quakeLayer.getVisibleParent || quakeLayer.getVisibleParent(markers[i]) === markers[i]);
                    if (shown) markers[i].openPopup();
                }
            }
            const names = (wanted) => SOURCES.filter((s, i) => state[i] === wanted).map((s) => s.short).join(', ');
            const parts = [
                events.length ? `${events.length} deprem` : `Seçilen aralıkta M ${minMag.toFixed(1)} ve üzeri deprem yok`,
                `Kaynaklar: ${names('ok')}`
            ];
            if (pending) parts.push(`bekleniyor: ${names('pending')}`);
            if (names('failed')) parts.push(`ulaşılamayan: ${names('failed')}`);
            if (rawCounts[0] >= 300) parts.push('Kandilli listesi en yeni 300 kayıtla sınırlı; eski günler eksik olabilir');
            if (!pending) parts.push(`Güncellendi: ${clockNow()}`);
            setModeStatus('quakes', parts.join(' · '), false);
        };

        // Bütün kaynaklara aynı anda sorulur. Öncelikli kaynak (Kandilli) yanıt verince harita hemen
        // çizilir; geç gelen kaynaklar eklendikçe güncellenir. En yavaş kaynak beklenmez.
        await Promise.all(SOURCES.map((source, i) =>
            fetchJson(source.url(range, fetchMin), source.timeoutMs, loadController.signal)
                .then((data) => {
                    const parsed = source.parse(data);
                    rawCounts[i] = parsed.length;
                    lists[i] = normalize(parsed).map((q) => Object.assign(q, { source: source.short, sourceName: source.name }));
                    state[i] = 'ok';
                })
                .catch(() => { state[i] = 'failed'; })
                .then(() => {
                    if (seq !== loadSeq) return;
                    if (state[0] !== 'pending' || !state.includes('pending')) render();
                })));
    }

    // ---- Katman düğmeleri ve kontroller ----
    const MODES = {
        quakes: { layer: quakeLayer, load: (force) => loadEarthquakes(force) },
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
        syncFwiLegend();
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

    // Yenile düğmesi yükleme sürerken döner.
    function runLoad(force) {
        if (refreshBtn) refreshBtn.classList.add('is-busy');
        return Promise.resolve(MODES[activeMode].load(force)).catch(() => {})
            .then(() => { if (refreshBtn) refreshBtn.classList.remove('is-busy'); });
    }
    // Geçici bilgi (konum hatası vb.) katmanın kendi durum metninin yerine kalıcı olarak geçmez.
    function flashStatus(text) {
        const mode = activeMode;
        const previous = statusByMode[mode];
        setModeStatus(mode, text, true);
        setTimeout(() => {
            const now = statusByMode[mode];
            if (previous && now && now.text === text) setModeStatus(mode, previous.text, previous.isError);
        }, 4000);
    }

    // ---- Büyüt / küçült ----
    // Kart, bulunduğu yerden ekranı kaplayacak biçimde büyür; harita da onunla birlikte ölçeklenir.
    // Dışına dokununca, Esc'ye ya da telefonun geri tuşuna basınca eski yerine küçülür.
    const shellEl = document.getElementById('mapShell');
    const cardEl = document.getElementById('mapCard');
    const backdropEl = document.getElementById('mapBackdrop');
    const coverEl = document.getElementById('mapCover');
    const toggleBtn = document.getElementById('mapToggle');
    const INTERACTIONS = ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard'];
    const ANIM_MS = 420;
    const idleQueue = [];

    function syncInteractions() {
        INTERACTIONS.forEach((name) => { if (map[name]) map[name][expanded ? 'enable' : 'disable'](); });
        if (toggleBtn) {
            const label = expanded ? 'Haritayı küçült' : 'Haritayı büyüt';
            toggleBtn.setAttribute('aria-label', label);
            toggleBtn.title = label;
        }
    }
    function setCardRect(rect) {
        cardEl.style.top = `${rect.top}px`; cardEl.style.left = `${rect.left}px`;
        cardEl.style.width = `${rect.width}px`; cardEl.style.height = `${rect.height}px`;
    }
    function finishResize() {
        animating = false;
        cardEl.classList.remove('is-animating');
        ['top', 'left', 'width', 'height', 'transition', 'borderRadius'].forEach((k) => { cardEl.style[k] = ''; });
        if (!expanded) {
            shellEl.style.minHeight = '';
            backdropEl.hidden = true;
            document.documentElement.classList.remove('map-open');
        }
        map.options.zoomSnap = 0.25;
        map.invalidateSize({ pan: false, animate: false });
        syncMinZoom();
        fitTurkey(false);
        syncInteractions();
        if (activeMode === 'wind') windStart();
        declutterWeatherLabels();
        idleQueue.splice(0).forEach((fn) => fn());
    }
    function setExpanded(next, after) {
        if (!cardEl || !shellEl || !backdropEl) { if (after) after(); return; }
        if (animating) { if (after && next) idleQueue.push(after); return; }
        if (next === expanded) { if (after) after(); return; }
        if (after) idleQueue.push(after);
        const first = cardEl.getBoundingClientRect();
        if (next) {
            shellEl.style.minHeight = `${shellEl.offsetHeight}px`;
            backdropEl.hidden = false;
            document.documentElement.classList.add('map-open');
            try { history.pushState({ erkenuyarMap: true }, ''); } catch (e) { /* geçmiş kullanılamıyorsa sorun değil */ }
        } else {
            map.closePopup();
        }
        expanded = next;
        cardEl.classList.toggle('is-expanded', next);
        const last = cardEl.getBoundingClientRect();
        requestAnimationFrame(() => backdropEl.classList.toggle('show', next));
        if (activeMode === 'wind') windStop(true);
        if (reducedMotion) { finishResize(); return; }

        animating = true;
        cardEl.classList.add('is-animating');
        setCardRect(first);
        cardEl.style.borderRadius = next ? '22px' : '26px';
        void cardEl.offsetWidth; // başlangıç ölçüsü uygulansın
        const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
        cardEl.style.transition = ['top', 'left', 'width', 'height', 'border-radius'].map((k) => `${k} ${ANIM_MS}ms ${ease}`).join(', ');
        setCardRect(last);
        cardEl.style.borderRadius = '';
        // Geçiş boyunca harita her karede yeni ölçüye oturtulur: Türkiye kartla birlikte büyür.
        map.options.zoomSnap = 0;
        map.setMinZoom(2);
        const tick = () => {
            if (!animating) return;
            map.invalidateSize({ pan: false, animate: false });
            fitTurkey(false);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(finishResize, ANIM_MS + 40);
    }
    function collapse() {
        if (!expanded) return;
        // Büyütürken geçmişe bir adım eklenmişti; geri alınınca "popstate" küçültür.
        if (history.state && history.state.erkenuyarMap) history.back(); else setExpanded(false);
    }
    window.addEventListener('popstate', () => { if (expanded) setExpanded(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && expanded) collapse(); });
    if (coverEl) coverEl.addEventListener('click', () => setExpanded(true));
    if (backdropEl) backdropEl.addEventListener('click', collapse);
    if (toggleBtn) toggleBtn.addEventListener('click', () => { if (expanded) collapse(); else setExpanded(true); });
    syncInteractions();

    // ---- Konum ----
    let meLayer = null;
    function showMyLocation(pos) {
        const here = L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (!L.latLngBounds(VIEW_BOUNDS).contains(here)) { flashStatus('Konumunuz haritanın kapsadığı alanın dışında.'); return; }
        if (meLayer) map.removeLayer(meLayer);
        meLayer = L.layerGroup();
        const accuracy = Number(pos.coords.accuracy);
        if (Number.isFinite(accuracy) && accuracy > 50 && accuracy < 50000) {
            meLayer.addLayer(L.circle(here, { radius: accuracy, color: '#0a84ff', weight: 1, opacity: 0.5,
                fillColor: '#0a84ff', fillOpacity: 0.12, interactive: false }));
        }
        meLayer.addLayer(L.marker(here, {
            icon: L.divIcon({ html: '<div class="me-dot"></div>', className: 'me-marker', iconSize: [18, 18], iconAnchor: [9, 9] }),
            interactive: false, keyboard: false, zIndexOffset: 1000
        }));
        meLayer.addTo(map);
        if (locateBtn) locateBtn.classList.add('is-on');
        map.flyTo(here, Math.max(map.getZoom(), 8), { duration: 0.8 });
    }

    tabButtons.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode, true)));
    if (minMagSelect) minMagSelect.addEventListener('change', () => {
        writePref('erkenuyar_minMag', minMagSelect.value);
        runLoad(true);
    });
    if (timeRangeSelect) timeRangeSelect.addEventListener('change', () => {
        writePref('erkenuyar_timeRange', timeRangeSelect.value);
        runLoad(true);
    });
    if (alertDaySelect) alertDaySelect.addEventListener('change', () => loadAlerts(false));
    if (refreshBtn) refreshBtn.addEventListener('click', () => runLoad(true));
    // Konum yalnızca kullanıcı düğmeye basınca istenir (sayfa açılır açılmaz izin sorulmaz).
    if (locateBtn) {
        if (!navigator.geolocation) {
            locateBtn.hidden = true;
        } else {
            locateBtn.addEventListener('click', () => {
                locateBtn.classList.add('is-busy');
                navigator.geolocation.getCurrentPosition(
                    (pos) => { locateBtn.classList.remove('is-busy'); setExpanded(true, () => showMyLocation(pos)); },
                    () => { locateBtn.classList.remove('is-busy'); flashStatus('Konum alınamadı. Tarayıcı konum iznini kontrol edin.'); },
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
            if (animating) return;
            if (activeMode === 'wind') { if (mapOnScreen) windStart(); else windStop(false); }
            if (mapOnScreen && wasOff) MODES[activeMode].load(false); // geri gelince hemen tazele
        }).observe(mapEl);
    }
    setInterval(() => { if (!document.hidden && mapOnScreen && !animating) MODES[activeMode].load(false); }, REFRESH_MS);
    const settle = () => { if (animating) return; map.invalidateSize({ pan: false }); if (!expanded) fitTurkey(false); };
    setTimeout(settle, 250);
    window.addEventListener('load', settle);
    // Harita kutusunun ölçüsü pencere değişmeden de değişebilir (büyük hâlde alttaki bölmenin içeriği
    // katmana göre uzayıp kısalır). Leaflet bunu kendisi fark etmez: haritanın altında boş şerit kalır,
    // rüzgâr zemini kısa çizilir. Kutu izlenir, ölçü değişince harita yeniden oturtulur.
    if ('ResizeObserver' in window) {
        let resizeTimer = null;
        new ResizeObserver(() => {
            if (animating) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (animating) return;
                const before = map.getSize();
                map.invalidateSize({ pan: false, animate: false });
                const after = map.getSize();
                if (before.x === after.x && before.y === after.y) return;
                if (!expanded) fitTurkey(false);
            }, 60);
        }).observe(mapEl);
    }
})();
