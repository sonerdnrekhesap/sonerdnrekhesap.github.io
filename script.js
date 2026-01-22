// Mobile Menu Toggle
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        menuToggle.classList.toggle('active');
    });
}

// Close menu when clicking on a link
const navLinks = document.querySelectorAll('.nav-link');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
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

// Handle form submissions (if any forms are added later)
document.addEventListener('submit', (e) => {
    e.preventDefault();
    // Handle form submission here if needed
});

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
// EARTHQUAKE & WILDFIRE MAP FUNCTIONALITY
// ============================================================

// Configuration
const EQ_API_URL = window.EQ_API_URL || "https://erkenuyar-worker.sonerdnrekhesap.workers.dev/api/earthquakes/tr/recent";
const NASA_FIRMS_API_KEY = "57fd874b0ee5f04c0d647b3fcc13d701";
const NASA_FIRMS_SOURCE = "VIIRS_SNPP_NRT";
const TURKEY_BBOX = "26.0,36.0,45.0,42.5"; // minLon,minLat,maxLon,maxLat
const FIRMS_DAYS = 8;

// Map state
let map = null;
let earthquakeClusterGroup = null;
let fireLayer = null;
let currentAbortController = null;
let lastEqDataCache = null;
let lastFireDataCache = null;
let updateInterval = null;
let fireUpdateInterval = null;
let viewportDebounceTimer = null;
let fireDebounceTimer = null;

// Industrial heat blacklist zones (lat, lon, radius in degrees)
const INDUSTRIAL_ZONES = [
    { lat: 40.85, lon: 29.30, radius: 0.05, name: "İstanbul Tuzla Endüstri" },
    { lat: 40.95, lon: 28.70, radius: 0.03, name: "Ambarlı Termik" },
    { lat: 38.80, lon: 26.95, radius: 0.04, name: "İzmir Aliağa Endüstri" },
    { lat: 40.77, lon: 29.93, radius: 0.04, name: "Kocaeli İzmit Endüstri" },
    { lat: 40.75, lon: 29.95, radius: 0.02, name: "Tüpraş Rafineri" },
    { lat: 38.20, lon: 36.90, radius: 0.03, name: "Afşin-Elbistan Termik" },
    { lat: 39.20, lon: 27.60, radius: 0.03, name: "Soma Termik" },
    { lat: 37.05, lon: 28.35, radius: 0.03, name: "Yatağan Termik" },
    { lat: 36.85, lon: 28.20, radius: 0.03, name: "Kemerköy Termik" },
    { lat: 36.60, lon: 36.20, radius: 0.03, name: "İskenderun Demir-Çelik" },
    { lat: 41.20, lon: 32.65, radius: 0.03, name: "Karabük Demir-Çelik" },
    { lat: 41.30, lon: 31.40, radius: 0.03, name: "Ereğli Demir-Çelik" }
];

// Initialize map
function initMap() {
    // Check if map is already initialized
    if (map) {
        console.warn('Map already initialized, skipping...');
        return;
    }
    
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('Map element not found');
        return;
    }

    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return;
    }

    if (mapElement.offsetHeight === 0) {
        mapElement.style.minHeight = '400px';
    }

    // Ensure map element has proper dimensions
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container element not found!');
        return;
    }
    
    console.log('Map container dimensions:', {
        width: mapContainer.offsetWidth,
        height: mapContainer.offsetHeight,
        computed: window.getComputedStyle(mapContainer).height
    });
    
    if (mapContainer.offsetHeight === 0 || mapContainer.offsetWidth === 0) {
        console.warn('Map container has no dimensions, setting defaults');
        mapContainer.style.height = '400px';
        mapContainer.style.width = '100%';
        // Force a reflow
        mapContainer.offsetHeight;
    }

    // Create map with constraints
    try {
        map = L.map('map', {
            center: [39.0, 35.0],
            zoom: 6,
            minZoom: 5.5,
            maxZoom: 12.0,
            zoomControl: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true,
            touchZoom: true
        });

        console.log('Map created successfully:', map);

        // Add OpenStreetMap tiles
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });
        osmLayer.addTo(map);
        console.log('OSM tiles added to map');
        
        // Verify tiles are loading
        osmLayer.on('tileload', () => {
            console.log('Tile loaded successfully');
        });
        
        osmLayer.on('tileerror', (error) => {
            console.error('Tile load error:', error);
        });
    } catch (error) {
        console.error('Error creating map:', error);
        throw error;
    }

    // Create cluster groups
    if (typeof L.markerClusterGroup !== 'undefined') {
        earthquakeClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 45,
            disableClusteringAtZoom: 11,
            iconCreateFunction: function(cluster) {
                const count = cluster.getChildCount();
                return L.divIcon({
                    html: `<div style="background-color: #d32f2f; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${count}</div>`,
                    className: 'marker-cluster',
                    iconSize: [40, 40]
                });
            }
        });
        map.addLayer(earthquakeClusterGroup);
        console.log('Earthquake cluster group created');
    } else {
        console.warn('MarkerCluster not available, using regular layer group');
        earthquakeClusterGroup = L.layerGroup();
        map.addLayer(earthquakeClusterGroup);
    }

    fireLayer = L.layerGroup();
    map.addLayer(fireLayer);
    console.log('Fire layer created');

    // Load saved preferences and get element references
    const minMagSelect = document.getElementById('minMag');
    const timeRangeSelect = document.getElementById('timeRange');
    const showFiresCheckbox = document.getElementById('showFires');
    
    const savedMinMag = localStorage.getItem('erkenuyar_minMag');
    if (savedMinMag && minMagSelect) {
        minMagSelect.value = savedMinMag;
    }

    // Viewport change handler for fires (debounced)
    map.on('moveend', () => {
        if (showFiresCheckbox?.checked && map.getZoom() >= 5.0) {
            clearTimeout(fireDebounceTimer);
            fireDebounceTimer = setTimeout(() => {
                loadFires();
            }, 500);
        }
    });

    // Initial load
    
    const initialMinMag = parseFloat(minMagSelect?.value || 3.0);
    const initialTimeRange = timeRangeSelect?.value || '1_day';
    loadEarthquakes(initialMinMag, false, initialTimeRange);
    
    if (showFiresCheckbox?.checked && map.getZoom() >= 5.0) {
        loadFires();
    }

    // Auto-refresh earthquakes every 90 seconds
    updateInterval = setInterval(() => {
        const minMagSelectEl = document.getElementById('minMag');
        const timeRangeSelectEl = document.getElementById('timeRange');
        const minMag = parseFloat(minMagSelectEl?.value || 3.0);
        const timeRange = timeRangeSelectEl?.value || '1_day';
        loadEarthquakes(minMag, false, timeRange);
    }, 90000);

    // Auto-refresh fires every 2 minutes
    fireUpdateInterval = setInterval(() => {
        const showFiresCheckboxEl = document.getElementById('showFires');
        if (showFiresCheckboxEl?.checked && map.getZoom() >= 5.0) {
            loadFires();
        }
    }, 120000);

    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            map.setView([position.coords.latitude, position.coords.longitude], 8.0);
        });
    }

    // Force map to render properly
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
            console.log('Map size invalidated');
            
            // Try again after a bit more delay
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                    console.log('Map size invalidated again');
                }
            }, 300);
        }
    }, 200);
    
    console.log('Map initialization complete');
}

// Fetch earthquakes from API
async function fetchEarthquakes(minMag = 3.0, timeRange = '1_day') {
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    try {
        // Convert timeRange to API format
        const timeRangeMap = {
            '8_hours': 'last_8_hours',
            '1_day': 'last_1_day',
            '7_days': 'last_7_days'
        };
        const apiTimeRange = timeRangeMap[timeRange] || 'last_1_day';

        const url = `${EQ_API_URL}?range=${apiTimeRange}&min_mw=${minMag}`;
        console.log('Fetching earthquakes from:', url);
        
        const response = await fetch(url, {
            signal: currentAbortController.signal,
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Earthquake API response:', data);
        return normalizeEarthquakeData(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            return null;
        }
        console.error('Error fetching earthquakes:', error);
        return [];
    }
}

// Normalize earthquake data
function normalizeEarthquakeData(data) {
    console.log('Normalizing earthquake data:', data);
    
    // Handle different response formats
    let earthquakes = [];
    if (Array.isArray(data)) {
        earthquakes = data;
    } else if (data && data.items && Array.isArray(data.items)) {
        earthquakes = data.items;
    } else if (data && data.data && Array.isArray(data.data)) {
        earthquakes = data.data;
    } else {
        console.warn('Unexpected data format:', data);
        return [];
    }
    
    console.log('Found', earthquakes.length, 'earthquakes');
    
    // Remove duplicates by ID
    const seen = new Set();
    const unique = earthquakes.filter(eq => {
        const id = eq.id || `${eq.latitude || eq.lat}-${eq.longitude || eq.lon}-${eq.time || eq.time_utc || eq.time_tr}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    const normalized = unique.map(eq => ({
        id: eq.id || `${eq.latitude || eq.lat}-${eq.longitude || eq.lon}-${eq.time || eq.time_utc || eq.time_tr || eq.acq_date}`,
        lat: parseFloat(eq.latitude || eq.lat),
        lon: parseFloat(eq.longitude || eq.lon),
        mag: parseFloat(eq.magnitude || eq.mw || eq.mag || eq.ml || 0),
        depth: parseFloat(eq.depthKm || eq.depth_km || eq.depth || 0),
        place: eq.place || 'Bilinmeyen konum',
        time: eq.time || eq.time_utc || eq.time_tr || new Date().toISOString(),
        source: eq.source || 'Bilinmeyen kaynak'
    })).filter(eq => {
        const valid = eq.lat && eq.lon && !isNaN(eq.lat) && !isNaN(eq.lon) && !isNaN(eq.mag) && eq.mag >= 0 && eq.lat >= 35 && eq.lat <= 43 && eq.lon >= 25 && eq.lon <= 45;
        if (!valid) {
            console.warn('Invalid earthquake data (filtered):', eq);
        }
        return valid;
    }).sort((a, b) => new Date(b.time) - new Date(a.time)); // Sort by time DESC

    console.log('Normalized', normalized.length, 'valid earthquakes');
    return normalized;
}

// Helper function to create earthquake marker
function createEarthquakeMarker(eq) {
    const color = getMagnitudeColor(eq.mag);
    const magText = eq.mag.toFixed(1);
    const radius = 32;
    const iconHtml = `
        <div style="
            width: ${radius}px;
            height: ${radius}px;
            border-radius: 50%;
            background-color: ${color};
            border: 3px solid #fff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3), 0 0 8px ${color}40;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 11px;
            color: #fff;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        ">${magText}</div>
    `;
    const customIcon = L.divIcon({
        html: iconHtml,
        className: 'earthquake-marker',
        iconSize: [radius, radius],
        iconAnchor: [radius / 2, radius / 2]
    });
    const marker = L.marker([eq.lat, eq.lon], { icon: customIcon });
    const timeStr = new Date(eq.time).toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    marker.bindPopup(`
        <div style="min-width: 200px;">
            <strong style="font-size: 1.1em; color: ${color};">M ${magText}</strong><br>
            <strong>Derinlik:</strong> ${eq.depth.toFixed(1)} km<br>
            <strong>Konum:</strong> ${eq.place}<br>
            <strong>Zaman:</strong> ${timeStr}<br>
            <strong>Kaynak:</strong> ${eq.source}
        </div>
    `);
    return marker;
}

// Load and display earthquakes
async function loadEarthquakes(minMag = 3.0, forceRefresh = false, timeRange = '1_day') {
    console.log('loadEarthquakes called:', { minMag, timeRange, forceRefresh });
    
    if (!map) {
        console.error('Map not initialized');
        return;
    }
    
    if (!earthquakeClusterGroup) {
        console.error('earthquakeClusterGroup not initialized');
        return;
    }

    const cacheKey = `eq-${minMag}-${timeRange}`;
    
    // If cache key changed, clear old cache
    if (lastEqDataCache && lastEqDataCache.key !== cacheKey) {
        console.log('Cache key changed, clearing old cache');
        lastEqDataCache = null;
    }
    
    if (!forceRefresh && lastEqDataCache && lastEqDataCache.key === cacheKey) {
        const cacheAge = Date.now() - lastEqDataCache.timestamp;
        if (cacheAge < 300000) { // 5 minutes TTL
            console.log('Using cached data');
            // Still need to render markers even if using cache
            if (lastEqDataCache.data && lastEqDataCache.data.length > 0) {
                console.log('Rendering cached markers');
                earthquakeClusterGroup.clearLayers();
                lastEqDataCache.data.forEach(eq => {
                    const marker = createEarthquakeMarker(eq);
                    earthquakeClusterGroup.addLayer(marker);
                });
            }
            return;
        }
    }

    console.log('Fetching earthquakes...');
    const earthquakes = await fetchEarthquakes(minMag, timeRange);
    console.log('Fetched earthquakes:', earthquakes);
    
    if (!earthquakes || earthquakes.length === 0) {
        console.warn('No earthquakes found');
        earthquakeClusterGroup.clearLayers();
        return;
    }

    const dataHash = JSON.stringify(earthquakes.map(eq => eq.id).sort());
    if (!forceRefresh && lastEqDataCache && lastEqDataCache.hash === dataHash) {
        console.log('Data unchanged, skipping update');
        return;
    }

    console.log('Clearing existing markers and adding', earthquakes.length, 'new markers');
    earthquakeClusterGroup.clearLayers();

    let markerCount = 0;
    earthquakes.forEach(eq => {
        const marker = createEarthquakeMarker(eq);
        earthquakeClusterGroup.addLayer(marker);
        markerCount++;
    });
    
    console.log('Added', markerCount, 'earthquake markers to map');

    lastEqDataCache = {
        key: cacheKey,
        hash: dataHash,
        timestamp: Date.now(),
        data: earthquakes
    };
}

// Get color based on magnitude
function getMagnitudeColor(mag) {
    if (mag >= 5.0) return '#d32f2f'; // Red
    if (mag >= 4.0) return '#f57c00'; // Orange
    if (mag >= 3.0) return '#fbc02d'; // Yellow/Amber
    return '#1976d2'; // Blue
}

// Fetch fires from NASA FIRMS
async function fetchFires() {
    try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${NASA_FIRMS_API_KEY}/${NASA_FIRMS_SOURCE}/${TURKEY_BBOX}/${FIRMS_DAYS}`;
        const response = await fetch(url, {
            signal: currentAbortController?.signal,
            headers: { 'Accept': 'text/csv' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const csvText = await response.text();
        return parseFiresCSV(csvText);
    } catch (error) {
        if (error.name === 'AbortError') {
            return null;
        }
        console.error('Error fetching fires:', error);
        return [];
    }
}

// Parse FIRMS CSV
function parseFiresCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',');
    const fires = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length < headers.length) continue;

        const fire = {};
        headers.forEach((header, index) => {
            fire[header.trim()] = values[index]?.trim() || '';
        });

        if (fire.latitude && fire.longitude) {
            fires.push({
                lat: parseFloat(fire.latitude),
                lon: parseFloat(fire.longitude),
                confidence: parseInt(fire.confidence) || 0,
                frp: parseFloat(fire.frp) || 0,
                acq_date: fire.acq_date || '',
                acq_time: fire.acq_time || ''
            });
        }
    }

    return fires;
}

// Classify fire type
function classifyFireType(fire, allFires) {
    // Check if in industrial zone
    for (const zone of INDUSTRIAL_ZONES) {
        const dist = Math.sqrt(
            Math.pow(fire.lat - zone.lat, 2) + Math.pow(fire.lon - zone.lon, 2)
        );
        if (dist <= zone.radius) {
            return { type: 'industrialHeat', name: zone.name };
        }
    }

    // Check for repeated location (8+ times in same 0.01° radius)
    const nearby = allFires.filter(f => {
        const dist = Math.sqrt(
            Math.pow(f.lat - fire.lat, 2) + Math.pow(f.lon - fire.lon, 2)
        );
        return dist <= 0.01;
    });

    if (nearby.length >= 8) {
        return { type: 'industrialHeat', name: 'Tekrarlanan Endüstriyel Kaynak' };
    }

    // Low confidence and low FRP
    if (fire.confidence < 60 && fire.frp < 10) {
        return { type: 'industrialHeat', name: 'Düşük Güven Endüstriyel Kaynak' };
    }

    // High confidence and high FRP = wildfire
    if (fire.confidence >= 80 && fire.frp >= 30) {
        return { type: 'wildfire', name: 'Yangın' };
    }

    // Default to wildfire
    return { type: 'wildfire', name: 'Yangın' };
}

// Downsample fires (only wildfires, not industrial)
function downsampleFires(fires, maxMarkers = 300) {
    const wildfires = fires.filter(f => f.type === 'wildfire');
    const industrial = fires.filter(f => f.type === 'industrialHeat');

    if (wildfires.length <= maxMarkers) {
        return [...wildfires, ...industrial];
    }

    // Grid-based downsampling
    const gridSize = 60;
    const grid = {};

    wildfires.forEach(fire => {
        const gridX = Math.floor((fire.lon + 180) * gridSize / 360);
        const gridY = Math.floor((fire.lat + 90) * gridSize / 180);
        const key = `${gridX}-${gridY}`;

        const score = fire.frp + (fire.confidence * 0.5);
        if (!grid[key] || grid[key].score < score) {
            grid[key] = { fire, score };
        }
    });

    const downsampled = Object.values(grid).map(item => item.fire);
    return [...downsampled, ...industrial];
}

// Load and display fires
async function loadFires(forceRefresh = false) {
    if (!map || !fireLayer) return;

    if (map.getZoom() < 5.0) {
        fireLayer.clearLayers();
        return;
    }

    const cacheKey = 'fires';
    if (!forceRefresh && lastFireDataCache) {
        const cacheAge = Date.now() - lastFireDataCache.timestamp;
        if (cacheAge < 120000) { // 2 minutes TTL
            return;
        }
    }

    const fires = await fetchFires();
    if (!fires || fires.length === 0) {
        return;
    }

    // Classify fires
    const classified = fires.map(fire => ({
        ...fire,
        ...classifyFireType(fire, fires)
    }));

    // Downsample (only wildfires)
    const downsampled = downsampleFires(classified, 300);

    fireLayer.clearLayers();

    const zoom = map.getZoom();
    const iconSize = zoom >= 12 ? 24 : zoom >= 9 ? 20 : zoom >= 7 ? 16 : 14;

    downsampled.forEach(fire => {
        const emoji = fire.type === 'industrialHeat' ? '🏭' : '🔥';
        const iconHtml = `
            <div style="
                font-size: ${iconSize}px;
                text-shadow: 0 1px 3px rgba(0,0,0,0.5);
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            ">${emoji}</div>
        `;

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'fire-marker',
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2]
        });

        const marker = L.marker([fire.lat, fire.lon], { icon: customIcon });

        const popupContent = fire.type === 'industrialHeat' ? `
            <div style="min-width: 200px;">
                <strong>🏭 Endüstriyel Kaynak</strong><br>
                <strong>Konum:</strong> ${fire.name || 'Endüstriyel Tesis'}<br>
                <strong>Güven:</strong> ${fire.confidence}%<br>
                <strong>FRP:</strong> ${fire.frp.toFixed(1)}<br>
                <div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px; font-size: 0.9em;">
                    ⚠️ Hava kirliliği riski olabilir
                </div>
            </div>
        ` : `
            <div style="min-width: 200px;">
                <strong>🔥 Yangın Tespiti</strong><br>
                <strong>Güven:</strong> ${fire.confidence}%<br>
                <strong>FRP:</strong> ${fire.frp.toFixed(1)}<br>
                <strong>Tespit:</strong> ${fire.acq_date} ${fire.acq_time}
            </div>
        `;

        marker.bindPopup(popupContent);
        fireLayer.addLayer(marker);
    });

    lastFireDataCache = {
        key: cacheKey,
        timestamp: Date.now(),
        data: downsampled
    };
}

// Setup event listeners for map controls
function setupMapControls() {
    const minMagSelect = document.getElementById('minMag');
    const timeRangeSelect = document.getElementById('timeRange');
    const showFiresCheckbox = document.getElementById('showFires');
    const refreshBtn = document.getElementById('refreshMap');

    if (!minMagSelect || !timeRangeSelect || !showFiresCheckbox || !refreshBtn) {
        console.warn('Map controls not found, will retry...');
        setTimeout(setupMapControls, 100);
        return;
    }

    console.log('Setting up map controls event listeners');

    // Remove any existing listeners by cloning (clean slate)
    const oldMinMag = minMagSelect.cloneNode(true);
    const oldTimeRange = timeRangeSelect.cloneNode(true);
    
    minMagSelect.parentNode.replaceChild(oldMinMag, minMagSelect);
    timeRangeSelect.parentNode.replaceChild(oldTimeRange, timeRangeSelect);
    
    // Get fresh references
    const newMinMag = document.getElementById('minMag');
    const newTimeRange = document.getElementById('timeRange');

    const reloadMap = (overrideMinMag = null, overrideTimeRange = null) => {
        console.log('reloadMap called', { overrideMinMag, overrideTimeRange });
        if (!map || !earthquakeClusterGroup) {
            console.warn('Map not initialized yet, cannot reload');
            return;
        }
        
        // Use override values if provided, otherwise get from DOM
        const minMag = overrideMinMag !== null ? parseFloat(overrideMinMag) : parseFloat(newMinMag.value || 3.0);
        const timeRange = overrideTimeRange !== null ? overrideTimeRange : (newTimeRange.value || '1_day');
        
        console.log('Reloading with:', { minMag, timeRange, minMagValue: newMinMag.value, timeRangeValue: newTimeRange.value });
        
        // Save to localStorage
        localStorage.setItem('erkenuyar_minMag', overrideMinMag !== null ? overrideMinMag : newMinMag.value);
        localStorage.setItem('erkenuyar_timeRange', timeRange);
        
        // Force refresh when filter changes (bypass cache)
        loadEarthquakes(minMag, true, timeRange);
        if (showFiresCheckbox.checked && map.getZoom() >= 5.0) {
            loadFires(true);
        }
    };

    // Add event listeners
    newMinMag.addEventListener('change', (e) => {
        const newValue = e.target.value;
        console.log('minMagSelect changed:', newValue);
        // Get current timeRange value from DOM
        reloadMap(newValue, newTimeRange.value);
    }, { passive: true });

    newTimeRange.addEventListener('change', (e) => {
        const newValue = e.target.value;
        console.log('timeRangeSelect changed:', newValue);
        // Get current minMag value from DOM
        reloadMap(newMinMag.value, newValue);
    }, { passive: true });

    showFiresCheckbox.addEventListener('change', (e) => {
        console.log('showFiresCheckbox changed:', e.target.checked);
        if (!map || !fireLayer) {
            console.warn('Map not initialized yet');
            return;
        }
        if (e.target.checked && map.getZoom() >= 5.0) {
            loadFires();
        } else {
            fireLayer.clearLayers();
        }
    }, { passive: true });

    refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Refresh button clicked');
        reloadMap();
    }, { passive: false });

    console.log('Map controls event listeners set up successfully');
}

// Initialize map when DOM is ready
function initializeMapWhenReady() {
    console.log('Checking for Leaflet...');
    
    if (typeof L === 'undefined') {
        console.log('Leaflet not loaded yet, retrying...');
        setTimeout(initializeMapWhenReady, 200);
        return;
    }
    
    console.log('Leaflet loaded, checking DOM...');
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.log('Map element not found, retrying...');
        setTimeout(initializeMapWhenReady, 200);
        return;
    }
    
    console.log('Map element found, initializing...');
    
    // Check if map is already initialized
    if (map) {
        console.log('Map already initialized, skipping...');
        return;
    }
    
    try {
        initMap();
        // Setup controls after map is initialized
        setupMapControls();
    } catch (error) {
        console.error('Error initializing map:', error);
        // Only retry if map is not already initialized
        if (!map) {
            setTimeout(() => {
                try {
                    initMap();
                    setupMapControls();
                } catch (e) {
                    console.error('Second attempt failed:', e);
                }
            }, 500);
        }
    }
}

// Setup controls early (before map init)
setupMapControls();

// Try multiple initialization strategies
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMapWhenReady);
} else {
    // DOM already loaded
    initializeMapWhenReady();
}

// Also try after window load
window.addEventListener('load', () => {
    if (!map) {
        console.log('Window loaded, trying to initialize map again...');
        setTimeout(initializeMapWhenReady, 100);
    }
    // Re-setup controls in case they weren't set up before
    setupMapControls();
});

// Console message
console.log('%c⚠️ ErkenUyar', 'font-size: 20px; font-weight: bold; color: #2196F3;');
console.log('%cDeprem ve Afet Erken Uyarı Sistemi', 'font-size: 12px; color: #666;');
