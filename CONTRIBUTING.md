# FreeCaption'a Katkı Sağlama

FreeCaption açık kaynak, Türk video editörlerinin yıllardır beklediği Türkçe altyazı çözümü. Senin katkın projeyi daha iyi yapar — teşekkür ederiz!

## İçindekiler

- [Hızlı başlangıç](#hızlı-başlangıç)
- [Hata bildir](#hata-bildir-bug-report)
- [Özellik öner](#özellik-öner-feature-request)
- [Kod katkısı (Pull Request)](#kod-katkısı-pull-request)
- [Geliştirme ortamı](#geliştirme-ortamı)
- [Kod stili](#kod-stili)
- [Commit mesajları](#commit-mesajları)
- [Davranış kuralları](#davranış-kuralları)

---

## Hızlı Başlangıç

1. Repo'yu **fork** et (sağ üst "Fork")
2. Lokal'e clone:
   ```bash
   git clone https://github.com/<senin-kullanici>/FreeCaption.git
   cd FreeCaption
   ```
3. Yeni branch aç:
   ```bash
   git checkout -b ozellik/yeni-bir-sey
   ```
4. Değişiklik yap, commit at:
   ```bash
   git commit -m "feat: yeni bir özellik açıklaması"
   ```
5. Fork'una push et + Pull Request aç:
   ```bash
   git push origin ozellik/yeni-bir-sey
   ```

---

## Hata Bildir (Bug Report)

Hata bulduğunda, sorunu **GitHub Issues** üzerinden bildirebilirsin. Daha hızlı çözüm için şu bilgileri ver:

- **Premiere Pro sürümü** (örn. 24.4, 25.1)
- **İşletim sistemi** (Windows 10/11, sürüm numarası)
- **GPU** (NVIDIA / yok) + sürücü sürümü
- **Çalışma modu** (lokal / VDS)
- **Hatanın adım adım nasıl tetiklendiği**
- **Beklenen** ve **gerçekleşen** davranış
- **Log dosyaları** (varsa):
  - Lokal: `backend/output/error.log`
  - VDS: `C:\FreeCaption\logs\backend-stderr.log`
- **Ekran görüntüsü** veya video (tercihen panel + Premiere timeline)

Issue açarken **🐛 Bug Report** şablonunu kullan, alanları doldur.

---

## Özellik Öner (Feature Request)

Yeni bir özellik için:

1. Önce mevcut [issue'lara bak](https://github.com/ScamEmre/FreeCaption/issues) — benzer öneri olabilir
2. Yoksa **✨ Feature Request** şablonuyla yeni issue aç
3. Şunları açıkla:
   - **Problem**: hangi ihtiyacı karşılıyor?
   - **Çözüm önerisi**: nasıl çalışmalı?
   - **Alternatifler**: hangi başka yolları değerlendirdin?
   - **Etki**: kim faydalanır? (örn. "Reels editörleri", "haber kanalları")

---

## Kod Katkısı (Pull Request)

### Önce iletişim

Büyük değişiklikler (>50 satır veya yeni özellik) için **önce issue aç**, planı tartışalım. Küçük düzeltmeler (typo, dökümantasyon) doğrudan PR olabilir.

### PR Süreci

1. **Bir issue'yu hedefle**: PR açıklamasında `Fixes #123` veya `Closes #123` yaz
2. **Branch ismi**: `tip/kısa-açıklama` formatında
   - `feat/cikti-formati-vtt`
   - `fix/canvas-resize-bug`
   - `docs/readme-vds-section`
   - `refactor/subtitle-grouping`
3. **Test et** — değişiklik yaptığın alanı manuel test et:
   - Plugin değişikliği → `cep_kur.bat` çalıştır → Premiere kapat-aç → test
   - Backend değişikliği → lokal `start.bat` ile test, VDS'ye deploy etmeden önce
4. **Self-review** — PR'ı açmadan önce kendi diff'ini incele
5. **PR şablonunu doldur** — değişiklik özeti, test adımları, ekran görüntüsü
6. **Code review**'a açık ol — geri bildirim normal, kişisel değil
7. **CI yeşil olsun** (henüz yok ama eklenecek): lint, format, basic test

### PR Kabul Edilirken Beklenenler

✅ Tek odak — bir PR bir konu (büyük PR'lar bölünür)
✅ Backward compatibility (eski kullanıcılar bozulmaz)
✅ Türkçe + İngilizce destekleyici değişikliklerde her iki dile de bakılır
✅ Test edilmiş (lokal Premiere'de en az 1 manuel test)
✅ Dokümante edilmiş (README güncelleme gerekiyorsa)

---

## Geliştirme Ortamı

### Lokal Geliştirme (GPU önerilir)

**Önkoşullar:**
- Windows 10/11
- Python 3.12 (winget: `Python.Python.3.12`)
- FFmpeg (winget: `Gyan.FFmpeg`)
- Git, GitHub Desktop (opsiyonel)
- Adobe Premiere Pro 23+ (CEP eklenti debug için)

**Kurulum (sadece geliştirme için):**

```powershell
git clone https://github.com/ScamEmre/FreeCaption.git
cd FreeCaption

# Backend venv
python -m venv .venv
.venv\Scripts\activate
pip install -r backend\requirements.txt

# Plugin AppData'ya kopyala
cep_kur.bat

# CEP debug mode (registry)
reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f
```

**Lokal sunucuyu çalıştır:**

```powershell
cd backend
..\.venv\Scripts\python.exe main.py
# veya:
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 7860
```

**Plugin DevTools:**

`cep-plugin/.debug` dosyası port 8088 atar. Chrome'dan `http://localhost:8088` → panel'i seç → DevTools açılır.

### VDS Geliştirme

VDS'de production backend var. Geliştirme sırasında VDS'yi bozma; lokal'de test et, sonra GitHub'a push, VDS raw URL'den çeker.

---

## Kod Stili

### Python (backend)

- **Format**: [Black](https://github.com/psf/black) (`black backend/`)
- **Lint**: [Ruff](https://github.com/astral-sh/ruff) (`ruff check backend/`)
- **Tipler**: type hints kullan, `from typing import ...`
- **Docstrings**: kısa Türkçe açıklama, parametreler/return ne işe yarıyor
- **İmport sırası**: stdlib → 3rd party → local (Black otomatik)

### JavaScript / TypeScript (CEP plugin)

- **Format**: 2 space indent, semicolons zorunlu
- **var**: ES3 uyumluluk için `var` kullan (CEP eski Chromium destekler)
- **Yorumlar**: Türkçe, kısa, sadece WHY (not WHAT)
- **Eşleşik dosya**: `cep-plugin/js/app.js` (Tab 1), `cep-plugin/js/style/tab-style.js` (Tab 2)

### CSS

- **CSS Variables** kullan (`:root { --accent: #06b6d4 }`)
- **Dark theme öncelikli** — açık tema sonradan eklenebilir
- **Mobile-first** değil — CEP panel desktop, ama responsive bonus

### ExtendScript (Adobe)

- `cep-plugin/jsx/main.jsx` — **ES3 syntax**, modern özellik YOK
- `let`, `const`, arrow functions, template literals KULLANMA
- `var`, `function () {}`, string concatenation OK
- JSON yok, polyfill (`json2.js`) ile çözüldü
- Hata yönetimi mutlaka `try/catch` ile, return string olarak

### PowerShell (deploy)

- `$ErrorActionPreference = "Continue"` (NSSM gibi non-fatal hatalar yutsun)
- ASCII safe (UTF-8 BOM'a rağmen Türkçe karakter parse sorununa girme)
- `Write-Step "N" "Açıklama"` formatı (mevcut helper)

---

## Commit Mesajları

[Conventional Commits](https://www.conventionalcommits.org/tr/v1.0.0/) standardı:

```
<tip>(<kapsam>): <kısa açıklama>

<gövde, opsiyonel — neden bu değişiklik>

<footer, opsiyonel — issue referansı>
```

**Tipler:**

- `feat`: yeni özellik
- `fix`: hata düzeltmesi
- `docs`: sadece dokümantasyon
- `style`: kod stili (formatlama, semicolon)
- `refactor`: davranış değiştirmeyen yeniden yapılandırma
- `perf`: performans iyileştirmesi
- `test`: test ekleme/düzeltme
- `chore`: build, deploy, bağımlılık güncellemesi
- `ci`: CI/CD değişiklikleri

**Örnekler:**

```
feat(plugin): word-level karaoke animasyon eklendi

Tab 2'de yeni "Karaoke" preset'i word-by-word vurgulu animasyon
sunar. WhisperX alignment timing'i kullanarak ±20ms hassasiyetle
çalışır.

Fixes #42
```

```
fix(backend): CPU mode'da ctranslate2 DLL hatası

NSSM servis context'inde ctranslate2.libs klasörü PATH'te değildi.
os.add_dll_directory() ile explicit ekledik.
```

```
docs: VDS deployment kılavuzu eklendi
```

Türkçe / İngilizce karışık kullanılabilir, ama tek commit'te tutarlı ol.

---

## Davranış Kuralları

- **Saygılı ol** — herkesin farklı tecrübe seviyesi var
- **Yapıcı ol** — "yanlış yapıyorsun" yerine "şu yaklaşım daha iyi olur"
- **Spam yok** — kendi reklamı, anlamsız PR, dilenme yasak
- **Telif hakkı saygısı** — başkalarının kodunu MIT uyumlu olmadan kopyalama

Türk yazılım topluluğu küçük, herkes herkesi tanır. Profesyonel ol.

---

## Lisans

Katkın MIT lisansı altında, FreeCaption'ın bir parçası olur. Detay: [LICENSE.md](LICENSE.md)

## İletişim

- **Issues**: hata + özellik tartışması için ana kanal
- **Discussions**: GitHub Discussions (açılırsa)
- **E-posta**: emrekazak.com üzerinden
