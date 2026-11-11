// ErkenUyar sitesi: menü, SSS ve haritanın gerektiğinde yüklenmesi.
// Harita kodu ayrı dosyadadır (map.js) ve yalnızca harita bölümüne yaklaşılınca indirilir.
(function () {
    'use strict';

    // Mobil menü
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.getElementById('navMenu');
    if (menuToggle && navMenu) {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.addEventListener('click', () => {
            const open = navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active', open);
            menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        navMenu.querySelectorAll('.nav-link').forEach((link) => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // SSS: aynı anda tek soru açık
    const faqQuestions = [...document.querySelectorAll('.faq-question')];
    faqQuestions.forEach((question) => {
        question.addEventListener('click', () => {
            const isExpanded = question.getAttribute('aria-expanded') === 'true';
            faqQuestions.forEach((q) => { if (q !== question) q.setAttribute('aria-expanded', 'false'); });
            question.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        });
    });

    // Harita: kütüphane ve harita kodu sayfa açılışında değil, harita bölümüne yaklaşılınca yüklenir.
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    const V = '7';
    const STYLES = ['vendor/leaflet/leaflet.css', 'vendor/markercluster/MarkerCluster.css', 'vendor/markercluster/MarkerCluster.Default.css'];
    const SCRIPTS = ['vendor/leaflet/leaflet.js', 'vendor/markercluster/leaflet.markercluster.js', `map.js?v=${V}`];
    const statusEl = document.getElementById('mapStatus');

    function loadStyle(href) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = () => reject(new Error(href));
            document.head.appendChild(link);
        });
    }
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error(src));
            document.head.appendChild(script);
        });
    }

    let started = false;
    async function startMap() {
        if (started) return;
        started = true;
        try {
            await Promise.all(STYLES.map(loadStyle));
            for (const src of SCRIPTS) await loadScript(src);
        } catch (error) {
            started = false;
            if (statusEl) {
                statusEl.textContent = 'Harita yüklenemedi. Sayfayı yenileyip tekrar deneyin.';
                statusEl.classList.add('map-status-error');
            }
        }
    }

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                observer.disconnect();
                startMap();
            }
        }, { rootMargin: '800px 0px' });
        observer.observe(mapEl);
    } else {
        startMap();
    }
})();
