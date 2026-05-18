# FreeCaption Landing Page

Bu klasör emrekazak.com için tanıtım sayfası + GitHub repo social preview görseli içerir.

## Dosyalar

- `index.html` — tek dosya, vanilla HTML+CSS, JS yok. Modern dark theme, mobile responsive
- `og-image.svg` — 1200×630 Open Graph önizleme görseli (sosyal medya paylaşım)

## emrekazak.com'a Deploy

### Seçenek 1 — Subdirectory
Site'nin `freecaption/` klasörüne `index.html` ve `og-image.svg` yükle. URL: `https://emrekazak.com/freecaption/`

### Seçenek 2 — Subdomain
DNS'te `freecaption.emrekazak.com` → site IP'sine A record. Klasörü subdomain root'una koy.

### Seçenek 3 — GitHub Pages (ücretsiz)
1. Repo Settings → Pages
2. Source: **main** branch / **/landing** folder
3. URL otomatik: `https://scamemre.github.io/FreeCaption/`
4. Sonra emrekazak.com'da CNAME `freecaption.emrekazak.com → scamemre.github.io` ile özel domain

## GitHub Repo Social Preview

Repo'da paylaşım yapılırken görünen büyük görsel için:

1. `landing/og-image.svg` dosyasını **PNG'ye** çevir (SVG repo settings'te kabul edilmiyor)
   - Hızlı yol: tarayıcıda `landing/og-image.svg` aç → sağ tık → "Resmi kaydet" PNG seç
   - Veya online dönüştürücü: cloudconvert.com (SVG → PNG, 1200×630)
2. GitHub repo'sunda **Settings → General** → aşağı kaydır → **Social preview** bölümü
3. **Edit** → PNG'yi yükle
4. Artık `github.com/ScamEmre/FreeCaption` linki Twitter/Discord/WhatsApp'ta paylaşıldığında bu görsel önizleme olarak çıkar

## OG Meta Doğrulama

Link önizlemesini test etmek için:
- **Twitter**: cards-dev.twitter.com/validator
- **Facebook**: developers.facebook.com/tools/debug
- **OpenGraph genel**: opengraph.xyz

`https://emrekazak.com/freecaption/` URL'sini bu araçlara gir, OG meta'ların doğru çıktığını gör.

## Özelleştirme

- **Renk**: `:root { --accent: #06b6d4 }` değerini değiştir, tüm site güncellenir
- **İçerik**: Tüm metinler `index.html` içinde, JSON/JS yok, doğrudan düzenle
- **Font**: Inter Google Font'u önerilir; `<link rel="preconnect">` ile head'e ekle:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ```
- **Tarama optimizasyonu**: `sitemap.xml` ve `robots.txt` ekle, Google Search Console'a kaydet
