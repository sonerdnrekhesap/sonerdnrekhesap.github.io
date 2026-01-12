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
// EARTHQUAKE MAP FUNCTIONALITY
// ============================================================

// Configuration: Update this with your actual earthquake API endpoint
const EQ_API_URL = window.EQ_API_URL || "PUT_YOUR_EQ_ENDPOINT_HERE";

// Map state
let map = null;
let markersLayer = null;
let currentAbortController = null;
let lastDataCache = null;
let updateInterval = null;

// Initialize map on DOM ready
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement || typeof L === 'undefined') {
        console.warn('Map element or Leaflet not available');
        return;
    }

    // Create map centered on Turkey
    map = L.map('map', {
        center: [39.0, 35.0],
        zoom: 6,
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        touchZoom: true
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Create layer group for markers
    markersLayer = L.layerGroup().addTo(map);

    // Setup controls
    const minMagSelect = document.getElementById('minMag');
    const refreshBtn = document.getElementById('refreshMap');

    if (minMagSelect) {
        minMagSelect.addEventListener('change', () => {
            const minMag = parseFloat(minMagSelect.value);
            loadEarthquakes(minMag);
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const minMag = parseFloat(minMagSelect?.value || 3.0);
            loadEarthquakes(minMag, true);
        });
    }

    // Initial load
    const initialMinMag = parseFloat(minMagSelect?.value || 3.0);
    loadEarthquakes(initialMinMag);

    // Auto-refresh every 90 seconds
    updateInterval = setInterval(() => {
        const minMag = parseFloat(minMagSelect?.value || 3.0);
        loadEarthquakes(minMag);
    }, 90000);
}

// Fetch earthquakes from API
async function fetchEarthquakes(minMag = 3.0) {
    if (EQ_API_URL === "PUT_YOUR_EQ_ENDPOINT_HERE") {
        console.warn('EQ_API_URL not configured. Using mock data for demonstration.');
        return getMockEarthquakeData(minMag);
    }

    // Abort previous request if still pending
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    try {
        const url = `${EQ_API_URL}?minMag=${minMag}&limit=100`;
        const response = await fetch(url, {
            signal: currentAbortController.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return normalizeEarthquakeData(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            return null; // Request was aborted, ignore
        }
        console.error('Error fetching earthquakes:', error);
        // Fallback to mock data on error
        return getMockEarthquakeData(minMag);
    }
}

// Normalize earthquake data from API response
function normalizeEarthquakeData(data) {
    // Handle different API response formats
    const earthquakes = Array.isArray(data) ? data : (data.earthquakes || data.data || data.features || []);
    
    return earthquakes.map((eq, index) => {
        // Handle GeoJSON format
        if (eq.geometry && eq.geometry.coordinates) {
            return {
                id: eq.id || eq.properties?.id || `eq-${index}`,
                lat: eq.geometry.coordinates[1],
                lon: eq.geometry.coordinates[0],
                mag: eq.properties?.mag || eq.magnitude || eq.mag || 0,
                depth: eq.properties?.depth || eq.depth || 0,
                place: eq.properties?.place || eq.place || 'Bilinmeyen konum',
                timeISO: eq.properties?.time || eq.time || eq.timestamp || new Date().toISOString()
            };
        }
        
        // Handle flat object format
        return {
            id: eq.id || `eq-${index}`,
            lat: eq.lat || eq.latitude || eq.lat,
            lon: eq.lon || eq.longitude || eq.lng,
            mag: eq.mag || eq.magnitude || eq.m || 0,
            depth: eq.depth || eq.d || 0,
            place: eq.place || eq.location || eq.name || 'Bilinmeyen konum',
            timeISO: eq.time || eq.timestamp || eq.date || new Date().toISOString()
        };
    }).filter(eq => eq.lat && eq.lon && !isNaN(eq.lat) && !isNaN(eq.lon));
}

// Get mock earthquake data for demonstration
function getMockEarthquakeData(minMag) {
    // Sample earthquakes in Turkey region
    const mockData = [
        { id: '1', lat: 40.8, lon: 30.0, mag: 4.2, depth: 10, place: 'Marmara Denizi', timeISO: new Date().toISOString() },
        { id: '2', lat: 38.4, lon: 27.1, mag: 3.5, depth: 8, place: 'İzmir', timeISO: new Date(Date.now() - 3600000).toISOString() },
        { id: '3', lat: 36.9, lon: 35.3, mag: 5.1, depth: 15, place: 'Adana', timeISO: new Date(Date.now() - 7200000).toISOString() },
        { id: '4', lat: 39.9, lon: 32.9, mag: 3.8, depth: 12, place: 'Ankara', timeISO: new Date(Date.now() - 1800000).toISOString() },
        { id: '5', lat: 41.0, lon: 28.9, mag: 4.5, depth: 9, place: 'İstanbul', timeISO: new Date(Date.now() - 5400000).toISOString() }
    ];
    
    return mockData.filter(eq => eq.mag >= minMag);
}

// Load and display earthquakes on map
async function loadEarthquakes(minMag = 3.0, forceRefresh = false) {
    if (!map || !markersLayer) return;

    // Check cache
    const cacheKey = `${minMag}-${Date.now() - (Date.now() % 90000)}`; // 90s cache window
    if (!forceRefresh && lastDataCache && lastDataCache.key === cacheKey) {
        return; // Use cached data
    }

    const earthquakes = await fetchEarthquakes(minMag);
    if (!earthquakes || earthquakes.length === 0) {
        console.log('No earthquakes found');
        return;
    }

    // Check if data actually changed
    const dataHash = JSON.stringify(earthquakes.map(eq => eq.id).sort());
    if (!forceRefresh && lastDataCache && lastDataCache.hash === dataHash) {
        return; // Data unchanged
    }

    // Clear existing markers
    markersLayer.clearLayers();

    // Add new markers
    earthquakes.forEach(eq => {
        const radius = Math.max(4, Math.min(20, 4 + eq.mag * 2));
        const color = getMagnitudeColor(eq.mag);
        
        const marker = L.circleMarker([eq.lat, eq.lon], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 2,
            opacity: 0.9,
            fillOpacity: 0.7
        });

        const timeStr = new Date(eq.timeISO).toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        marker.bindPopup(`
            <div style="min-width: 200px;">
                <strong style="font-size: 1.1em; color: ${color};">M ${eq.mag.toFixed(1)}</strong><br>
                <strong>Derinlik:</strong> ${eq.depth.toFixed(1)} km<br>
                <strong>Konum:</strong> ${eq.place}<br>
                <strong>Zaman:</strong> ${timeStr}
            </div>
        `);

        marker.addTo(markersLayer);
    });

    // Update cache
    lastDataCache = {
        key: cacheKey,
        hash: dataHash,
        data: earthquakes
    };

    // Fit map to show all markers if there are markers
    if (earthquakes.length > 0) {
        const bounds = earthquakes.map(eq => [eq.lat, eq.lon]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 8 });
    }
}

// Get color based on magnitude
function getMagnitudeColor(mag) {
    if (mag >= 5.0) return '#d32f2f'; // Red
    if (mag >= 4.0) return '#f57c00'; // Orange
    if (mag >= 3.5) return '#fbc02d'; // Yellow
    return '#1976d2'; // Blue
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for Leaflet to load if needed
    if (typeof L !== 'undefined') {
        initMap();
    } else {
        // Retry after a short delay
        setTimeout(() => {
            if (typeof L !== 'undefined') {
                initMap();
            } else {
                console.error('Leaflet library not loaded');
            }
        }, 500);
    }
});

// Console message
console.log('%c⚠️ ErkenUyar', 'font-size: 20px; font-weight: bold; color: #2196F3;');
console.log('%cDeprem ve Afet Erken Uyarı Sistemi', 'font-size: 12px; color: #666;');
