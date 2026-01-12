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

// Configuration: Earthquake API endpoint
const EQ_API_BASE_URL = window.EQ_API_BASE_URL || "https://erkenuyar-worker.sonerdnrekhesap.workers.dev/api/earthquakes/tr/recent";

// Map state
let map = null;
let markersLayer = null;
let currentAbortController = null;
let lastDataCache = null;
let updateInterval = null;

// Initialize map on DOM ready
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('Map element not found');
        return;
    }

    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return;
    }

    // Ensure map element has dimensions
    if (mapElement.offsetHeight === 0) {
        console.warn('Map element has no height, setting minimum height');
        mapElement.style.minHeight = '400px';
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

    // Add OpenStreetMap tiles - ALWAYS render base map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Force map to invalidate size after a brief delay to ensure proper rendering
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 100);

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
    // Abort previous request if still pending
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    try {
        const url = `${EQ_API_BASE_URL}?range=last_7_days&min_mw=${minMag}`;
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
        return []; // Return empty array on error (map will show without markers)
    }
}

// Normalize earthquake data from API response
function normalizeEarthquakeData(data) {
    // API returns: {ok: true, count: 649, items: [...]}
    if (!data || !data.ok || !data.items) {
        console.warn('Invalid API response format');
        return [];
    }

    const earthquakes = data.items || [];
    
    return earthquakes.map((eq, index) => {
        return {
            id: eq.id || `eq-${index}-${eq.time_utc || Date.now()}`,
            lat: eq.lat,
            lon: eq.lon,
            mag: eq.mag || eq.mw || eq.ml || 0,
            depth: eq.depth_km || eq.depth || 0,
            place: eq.place || 'Bilinmeyen konum',
            timeISO: eq.time_tr || eq.time_utc || new Date().toISOString()
        };
    }).filter(eq => eq.lat && eq.lon && !isNaN(eq.lat) && !isNaN(eq.lon) && eq.mag >= 0);
}


// Load and display earthquakes on map
async function loadEarthquakes(minMag = 3.0, forceRefresh = false) {
    if (!map || !markersLayer) {
        console.warn('Map or markersLayer not initialized');
        return;
    }

    // Check cache
    const cacheKey = `${minMag}-${Date.now() - (Date.now() % 90000)}`; // 90s cache window
    if (!forceRefresh && lastDataCache && lastDataCache.key === cacheKey) {
        return; // Use cached data
    }

    const earthquakes = await fetchEarthquakes(minMag);
    if (!earthquakes || earthquakes.length === 0) {
        // Clear existing markers if no data
        markersLayer.clearLayers();
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
    // Check if Leaflet is already loaded
    if (typeof L !== 'undefined') {
        initMap();
    } else {
        // Wait for Leaflet to load (it's loaded before this script)
        // Retry with increasing delays
        let attempts = 0;
        const maxAttempts = 10;
        const checkLeaflet = setInterval(() => {
            attempts++;
            if (typeof L !== 'undefined') {
                clearInterval(checkLeaflet);
                initMap();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkLeaflet);
                console.error('Leaflet library failed to load after', maxAttempts, 'attempts');
            }
        }, 100);
    }
});

// Console message
console.log('%c⚠️ ErkenUyar', 'font-size: 20px; font-weight: bold; color: #2196F3;');
console.log('%cDeprem ve Afet Erken Uyarı Sistemi', 'font-size: 12px; color: #666;');
