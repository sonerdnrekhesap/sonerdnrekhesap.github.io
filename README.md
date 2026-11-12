# erkenuyar.com

ErkenUyar uygulamasının sitesi. GitHub Pages üzerinden yayınlanır; `main` dalına yapılan her push canlı siteyi günceller.

## Dosyalar

- `index.html`: ana sayfa (özellikler, canlı harita, sık sorulan sorular)
- `privacy.html`, `terms.html`, `support.html`: gizlilik politikası, kullanım koşulları, destek
- `404.html`: bulunamayan sayfalar
- `styles.css`: tüm sayfaların stili
- `site.js`: menü, sık sorulan sorular ve haritanın gerektiğinde yüklenmesi
- `map.js`: canlı harita (depremler, hava, rüzgâr, yağış, uyarılar, yangın)
- `vendor/`: harita kütüphaneleri (Leaflet, MarkerCluster)
- `data/tr-provinces.json`: il sınırları
- `app-ads.txt`, `robots.txt`, `sitemap.xml`, `CNAME`: alan adı ve arama motoru dosyaları

## Yerelde deneme

```bash
python3 -m http.server 8000
```

`styles.css`, `site.js` veya `map.js` değişince HTML dosyalarındaki `?v=` sürüm numarasını (ve `site.js` içindeki `V` değerini) bir artırın; aksi halde tarayıcılar eski dosyayı kullanır.
