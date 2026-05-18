# FreeCaption Runbook — Sorun Giderme + Kurulum Kılavuzu

> **Bu doküman ne zaman?** Bir sorun yaşadığında veya yeni bir Windows VDS'ye geçişte adım adım rehber. Tüm komutlar **kopyala-yapıştır** çalışır.

## İçindekiler

1. [✅ Sıradaki Adımım — Hızlı Kontrol Listesi](#siradaki-adim)
2. [🚨 ACİL — "Bir Şey Bozuk, Hemen Düzeltmek İstiyorum"](#acil)
3. [🆕 Yeni Windows 11 VDS Kurulumu (Sıfırdan)](#yeni-windows-11-vds-kurulumu)
4. [🔄 Eski Sunucudan Yeni VDS'ye Geçiş](#migration)
5. [📦 Plugin/Backend Güncelleme + Yeni Release Yayınlama](#guncelleme)
6. [🛠️ Tipik Sorunlar ve Çözümleri](#tipik-sorunlar)
7. [📊 Sağlık Kontrolleri](#saglik-kontrolleri)
8. [📚 Komut Hatırlatıcı](#komut-hatirlatici)

---

## ✅ Sıradaki Adımım — Hızlı Kontrol Listesi {#siradaki-adim}

Aşağıdaki sırayla işle. Her madde tamamlandıkça [x] yap.

### Bugün (mevcut Server VDS çalışıyor)

- [x] Plugin AppData'da güncel (font combobox + tüm fix'ler dahil)
- [x] VDS canlı (`191.44.68.233`)
- [ ] **Sen şu an**: video çek, dokunma ✓

### Yarın — Yeni Windows 11 VDS Kurulumu (~30 dk toplam)

#### A) Sunucu Satın Alma (5 dk)

- [ ] TR VDS provider'a git (ucuz Win 11 VDS satan)
- [ ] Önerilen spec:
  - **OS**: Windows 11 Pro x64
  - **CPU**: Min 4 vCPU **dedicated** (vCPU paylaşımlı OLMAZ)
  - **RAM**: 8 GB DDR4
  - **Disk**: 25-50 GB NVMe SSD
  - **Network**: 10 Gbit (genelde Türk provider'larda var)
  - **Lokasyon**: TR (düşük ping)
- [ ] Satın al → email/SMS'ten RDP bilgileri gelir (IP + user + şifre)

#### B) RDP ile Bağlan (2 dk)

- [ ] Lokal makinende **Win+R** → `mstsc` → Enter
- [ ] **Computer**: `<YENI_VDS_IP>`
- [ ] **Show Options** → **User name**: `Administrator`
- [ ] **Connect** → şifre → **Yes** (sertifika uyarısı)
- [ ] VDS masaüstü açılır

#### C) FreeCaption Tek Tuş Kurulum (15 dk otomatik)

- [ ] VDS masaüstünde Start → "powershell" yaz → **Windows PowerShell** sağ tık → **Run as administrator**
- [ ] UAC uyarısı → **Yes**
- [ ] Mavi PowerShell penceresine **sırayla şu 4 satırı yapıştır + Enter**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
```

```powershell
$url = "https://raw.githubusercontent.com/ScamEmre/FreeCaption/main/deploy/windows/install_windows.ps1"
```

```powershell
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\install.ps1" -UseBasicParsing
```

```powershell
& "$env:TEMP\install.ps1"
```

- [ ] Script başlar. 15 adım otomatik ilerler (~15 dk).
- [ ] **🟡 Adım 9'da SARI KUTU** ile API Key ekrana çıkar — **HEMEN KOPYALA** (Notepad'e yapıştır):
  ```
  API Key: ?_____________________________________
  ```
- [ ] **🟡 Adım 10'da "Domain..." sorusu** çıkar → **boş bırak, Enter** (şimdilik IP modu HTTP)
- [ ] **Adım 14**: Whisper modeli indirme — 3-5 dk bekle, hata değil
- [ ] Adım 15 → KURULUM TAMAM mesajı

#### D) Sunucu Doğrulama (2 dk)

Aynı PowerShell'de:

```powershell
Get-Service FreeCaption, FreeCaptionCaddy | Format-Table Name, Status
```
- [ ] İki satır da **Running** olmalı

```powershell
(Invoke-WebRequest "http://127.0.0.1:7860/api/health" -UseBasicParsing).Content
```
- [ ] Çıktı: `{"ok":true,"gpu":false,...}` görmeli

```powershell
$ip = (Invoke-WebRequest "https://api.ipify.org" -UseBasicParsing).Content; "Yeni VDS IP: $ip"
```
- [ ] **IP'yi not al**: ?_____________________________________

#### E) Premiere Panel'i Yeni Sunucuya Bağla (2 dk)

Lokal makinende:

- [ ] Premiere açık → Window → Extensions → FreeCaption
- [ ] Topbar'da **⚙ butonu** → tıkla
- [ ] **İlk prompt — URL**: `http://<YENI_IP>` (sadece IP yaz, http:// otomatik eklenir ama yazsan da olur)
- [ ] **İkinci prompt — API Key**: Notepad'e kaydettiğin değeri yapıştır
- [ ] Toast: "Ayarlar kaydedildi" görünür
- [ ] 5 saniye içinde sağ üstte **health badge yeşil "CPU modu"** olmalı ✓

#### F) Test Transcript (1-2 dk)

- [ ] Premiere'de bir test klibi seç (10-30 sn ses)
- [ ] Tab 1 → Altyazı Üret butonuna bas
- [ ] Beklenen akış:
  ```
  Ses cikariliyor (FFmpeg)…           ← 5-10 sn
  WAV yukleniyor (X MB)…              ← 5-15 sn
  Model yukleniyor…                    ← 3 sn (cache'ten)
  Transkripsiyon (medium)…             ← ~30 sn
  Tamamlandi
  ```
- [ ] Caption track timeline'a düşmeli ✓

#### G) Eski Sunucuyu Kapat (sonra, 1-2 hafta sonra)

- [ ] Yeni sunucu 1 hafta sorunsuz çalıştıysa
- [ ] Eski TR provider abonelik panelinden iptal et
- [ ] Lokal `localStorage.fc_api_url` zaten yeni IP'de, dokunma gerek yok

### Yarın Sonrası — Plugin/Kod Güncellemesi (haftalık)

#### H) Kod değişikliği yaptın → yeni release çıkar

- [ ] Lokal'de değişiklikleri test et (Premiere'de plugin çalıştığını gör)
- [ ] GitHub Desktop'tan **commit + push**
- [ ] Plugin değişikliği varsa **yeni ZIP üret + Release'i güncelle** (bölüm 5 — Güncelleme)

---

---

## 🚨 ACİL — "Bir Şey Bozuk" {#acil}

**Önce şu 3 sorunun cevabını bul:**

### S1 — Premiere panel açılıyor mu?
- ✅ Açılıyor → Devam et S2
- ❌ Açılmıyor → "Window > Extensions > FreeCaption" listede yok
  - **Çözüm**: Premiere'i tam kapat. `%LOCALAPPDATA%\Temp\cep_cache` klasörünü sil. Premiere'i aç.
  - Hala yok: Plugin'i yeniden yükle → repo klasöründe **`cep_kur.bat`** çift tıkla.

### S2 — Health badge yeşil mi? ("CPU modu" veya "GPU")
- ✅ Yeşil → Devam et S3
- ❌ Kırmızı "Sunucu kapalı" →
  - **a)** ⚙ butonuna bas → URL'i kontrol et: `http://<SUNUCU_IP>` (eski `191.44.68.233` veya yeni IP)
  - **b)** API Key kontrol et (her iki promp'tan değer girilmiş olmalı)
  - **c)** Tarayıcıdan test: `http://<SUNUCU_IP>/api/health` → JSON dönmeli
  - **d)** Hala yoksa: sunucuya RDP gir → `Restart-Service FreeCaption`

### S3 — Altyazı Üret hata veriyor mu?
- ✅ Çalışıyor → sorun yok, devam et videoya
- ❌ Hata → mesaja göre:
  - `FFmpeg fail` → Lokal'de FFmpeg yok. `winget install Gyan.FFmpeg --silent --accept-source-agreements --accept-package-agreements`
  - `Sunucu 401` → API Key yanlış. ⚙ → key'i yeniden gir
  - `Sunucu 500: OSError WinError 127` → Sunucuda DLL hatası, sunucuya bağlan, RUNBOOK § "Backend DLL hatası"
  - `Medya bulunamadi` → Plugin eski versiyon, AppData'da güncel değil. `cep_kur.bat` çalıştır.

---

## 🆕 Yeni Windows 11 VDS Kurulumu {#yeni-windows-11-vds-kurulumu}

> **Önkoşul**: Windows 11 Pro yüklü VDS (4+ vCPU dedicated, 8 GB RAM, 25 GB disk), RDP erişimi.

### Adım 1 — RDP ile bağlan

Lokal makinende:
1. **Win+R** → `mstsc` → Enter
2. **Computer**: VDS IP adresi
3. **Show Options** → **User name**: `Administrator` (veya sağlayıcının verdiği)
4. **Connect** → şifre gir → bağlan
5. Sertifika uyarısı → **Yes**

### Adım 2 — Admin PowerShell aç

VDS masaüstünde:
1. Start (sol alt) → "powershell" yaz
2. **Windows PowerShell** üstüne sağ tık → **Run as administrator**
3. UAC uyarısı → **Yes**

### Adım 3 — Tek tuş kurulum (otomatik, ~15 dakika)

PowerShell'e şu **4 satırı sırayla** yapıştır + her birinin sonunda Enter:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
```

```powershell
$url = "https://raw.githubusercontent.com/ScamEmre/FreeCaption/main/deploy/windows/install_windows.ps1"
```

```powershell
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\install.ps1" -UseBasicParsing
```

```powershell
& "$env:TEMP\install.ps1"
```

### Adım 4 — Script çalışırken bekle

Ekrana 15 adımlık ilerleme yazılır. Bekleme noktaları:

| Adım | Süre | Ne olur |
|------|------|---------|
| 2-3 (Git + Python) | 1-2 dk | winget ile indirme |
| 4 (FFmpeg) | 30 sn | 200 MB indirme |
| 8 (venv + torch) | 5-8 dk | en uzun adım, sabırlı ol |
| **9 (API KEY)** | — | 🟡 **EKRANDA SARI KUTUDA API KEY ÇIKAR — HEMEN KOPYALA** |
| **10 (Domain)** | — | 🟡 **"Domain..." sorar → şimdilik boş Enter** (IP modu HTTP) |
| 14 (Whisper medium model) | 3-5 dk | 1.5 GB indirme + RAM yükleme |
| 15 (Özet) | — | Bitti, yeni IP + API Key özeti |

### Adım 5 — Sunucu durumu doğrula

Script bittikten sonra aynı PowerShell'de:

```powershell
Get-Service FreeCaption, FreeCaptionCaddy | Format-Table Name, Status
```

Beklenen: ikisi de **Running**.

```powershell
(Invoke-WebRequest "http://127.0.0.1:7860/api/health" -UseBasicParsing).Content
```

Beklenen: `{"ok":true,"gpu":false,...}`

```powershell
$ip = (Invoke-WebRequest "https://api.ipify.org" -UseBasicParsing).Content
"Premiere panel URL: http://$ip"
"API Key: " + (Get-Content C:\FreeCaption\.env | Select-String "FC_API_KEY").Line
```

Yeni IP'yi ve API Key'i not al.

### Adım 6 — Premiere paneline bağla

Lokal makinende Premiere'i aç:
1. Window → Extensions → FreeCaption
2. Topbar'da **⚙** butonuna bas
3. **URL prompt**: `http://<YENI_IP>` (sadece IP yaz, http:// olmadan da olur — script otomatik ekler)
4. **API Key prompt**: install scriptinin verdiği key
5. Toast "Ayarlar kaydedildi" → health badge 5 sn içinde **yeşil "CPU modu"** olmalı

### Adım 7 — Test transcript

1. Premiere'de bir klip seç
2. Tab 1 → **Altyazı Üret**
3. ~30-60 sn içinde caption track timeline'a düşmeli ✓

---

## 🔄 Eski Sunucudan Yeni VDS'ye Geçiş {#migration}

Mevcut Server'daki `191.44.68.233` durmaya devam etsin, paralel olarak yeni Win 11 VDS kur.

### Geçiş Adımları

1. **Yeni VDS'yi tam çalışır hale getir** (yukarıdaki "Yeni Windows 11 VDS Kurulumu" tüm adımları)
2. **Test et**: yeni IP'de transcript çalışıyor mu (en az 1 başarılı klip)
3. **Premiere panel'i yeni IP'ye taşı**: ⚙ → yeni URL + yeni API Key
4. **Eski Server'ı 1-2 hafta canlı tut** — yedek olarak
5. **Eski Server iptal et**: emin olduktan sonra Türk provider'da abonelik iptal et

### Migration Sırasında Korunması Gerekenler

| Veri | Eski Server'da Nerede | Yeni VDS'ye Taşı? |
|------|----------------------|---------------------|
| Whisper model dosyaları (~1.5 GB) | `C:\FreeCaption\backend\.models\` | ❌ Yeni VDS install scripti zaten yeniden indirir |
| Üretilmiş SRT'ler | `C:\FreeCaption\output\` | ⚠️ Önemli olanları RDP üzerinden kendi PC'ne indir |
| .env (API Key) | `C:\FreeCaption\.env` | ❌ Yeni install yeni API Key üretir, Premiere'i o key'le güncelle |
| Caddy konfigi | `C:\FreeCaption\Caddyfile` | ❌ Yeni install otomatik üretir |
| Log dosyaları | `C:\FreeCaption\logs\` | ❌ Önemsiz |

**Hiçbir manuel transfer gerekmez** — install scripti her şeyi sıfırdan kuruyor. Sadece üretmiş olduğun SRT'leri bilgisayarına indir (varsa).

---

## 📦 Plugin/Backend Güncelleme + Yeni Release Yayınlama {#guncelleme}

### Senaryo: Bir kod değişikliği yaptın, yeni sürüm yayınlamak istiyorsun

#### Adım 1 — Lokal'de Test

- [ ] Plugin değişikliği yaptıysan: `cep_kur.bat` çalıştır (source → AppData sync)
- [ ] Premiere kapat-aç, değişikliği test et
- [ ] Backend değişikliği yaptıysan: VDS'de raw URL'den dosyayı çek (aşağıda komut)

#### Adım 2 — GitHub'a Commit + Push

GitHub Desktop ile (önerilen):

- [ ] Desktop'ı aç, Current repository: FreeCaption
- [ ] Sol alttaki **Summary** kutusuna kısa açıklama yaz (örn. "feat: konuşmacı ayırma desteği")
- [ ] **Commit to main**
- [ ] Üstte **Push origin** butonu → tıkla

Veya komut satırı:
```bash
cd <repo-yolu>
git add -A
git commit -m "feat: açıklama"
git push origin main
```

#### Adım 3 — Sürüm Numarası Belirle (Semver)

- **MAJOR** (v1.0.0 → v2.0.0): Geriye dönük uyumsuz değişiklik
- **MINOR** (v1.0.0 → v1.1.0): Yeni özellik, eskileri bozmaz
- **PATCH** (v1.0.0 → v1.0.1): Sadece hata düzeltmesi

#### Adım 4 — CHANGELOG Güncelle

- [ ] `CHANGELOG.md`'yi aç
- [ ] En üste yeni sürüm bloğu ekle:
  ```markdown
  ## [1.1.0] — 2026-MM-DD

  ### Eklenenler
  - Konuşmacı ayırma (diarization)
  - ...

  ### Düzeltmeler
  - X bug fix
  ```
- [ ] Commit: `docs: CHANGELOG v1.1.0`

#### Adım 5 — Plugin ZIP Oluştur

Repo kökündeki PowerShell:

```powershell
$VERSION = "1.1.0"  # yeni sürüm
New-Item -ItemType Directory -Force -Path dist | Out-Null
Compress-Archive -Path cep-plugin\* -DestinationPath "dist\FreeCaption-plugin-v$VERSION.zip" -Force
Get-Item "dist\FreeCaption-plugin-v$VERSION.zip" | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}}
```

Çıktı `dist/FreeCaption-plugin-v1.1.0.zip` (~55-60 KB).

#### Adım 6 — Git Tag Oluştur

GitHub Desktop'ta:
- [ ] **History** sekmesi → son commit'e sağ tık → **Create Tag…**
- [ ] Tag adı: `v1.1.0` → enter
- [ ] **Push origin** ile tag'i de gönder

Veya CLI:
```bash
git tag -a v1.1.0 -m "v1.1.0: kısa açıklama"
git push origin v1.1.0
```

#### Adım 7 — GitHub Release Yayınla

- [ ] https://github.com/ScamEmre/FreeCaption/releases/new aç
- [ ] **Choose a tag**: `v1.1.0` (yukarıda oluşturduğun)
- [ ] **Release title**: `v1.1.0 — Konuşmacı Ayırma`
- [ ] **Description**: CHANGELOG.md'deki ilgili bölümü kopyala/yapıştır
- [ ] **Attach binaries**: `dist/FreeCaption-plugin-v1.1.0.zip` sürükle bırak
- [ ] **Set as the latest release** ✓
- [ ] **Publish release**

#### Adım 8 — VDS'yi Yeni Sürüme Güncelle

RDP ile VDS'ye bağlan, admin PowerShell:

```powershell
# Backend dosyalarını yenile (cache bypass)
$base = "https://raw.githubusercontent.com/ScamEmre/FreeCaption/HEAD"
$n = Get-Random
Invoke-WebRequest "$base/backend/main.py?n=$n" -OutFile "C:\FreeCaption\backend\main.py" -UseBasicParsing
Invoke-WebRequest "$base/backend/transcribe.py?n=$n" -OutFile "C:\FreeCaption\backend\transcribe.py" -UseBasicParsing
Invoke-WebRequest "$base/backend/subtitle.py?n=$n" -OutFile "C:\FreeCaption\backend\subtitle.py" -UseBasicParsing
Invoke-WebRequest "$base/backend/audio.py?n=$n" -OutFile "C:\FreeCaption\backend\audio.py" -UseBasicParsing
Invoke-WebRequest "$base/backend/config.py?n=$n" -OutFile "C:\FreeCaption\backend\config.py" -UseBasicParsing

# requirements.txt değiştiyse paketleri güncelle:
Invoke-WebRequest "$base/backend/requirements.txt?n=$n" -OutFile "C:\FreeCaption\backend\requirements.txt" -UseBasicParsing
cd C:\FreeCaption
.\.venv\Scripts\pip install -r backend\requirements.txt --upgrade

# Servisleri restart
Restart-Service FreeCaption
Start-Sleep 8
"Health: " + (Invoke-WebRequest 'http://127.0.0.1:7860/api/health' -UseBasicParsing).Content
```

#### Adım 9 — Lokal Plugin'i Güncelle

Lokal makinende:

**Yol A — Auto-update butonu (önerilen)**:
- [ ] Premiere → FreeCaption panel → **🔄 update butonu**
- [ ] Onay → ZIP indirilir + plugin AppData'ya yazılır + panel reload

**Yol B — Manuel cep_kur.bat**:
```cmd
cd <repo-yolu>
cep_kur.bat
```
Premiere kapat-aç.

#### Adım 10 — Test

- [ ] Premiere'de Altyazı Üret → çalışıyor mu?
- [ ] Yeni özelliği dene (örn. konuşmacı ayırma)
- [ ] Caption track düzgün mü, kayma yok mu?

---

## 🛠️ Tipik Sorunlar ve Çözümleri {#tipik-sorunlar}

### 1) winget "msstore certifika hatası"

```
Failed when searching source: msstore
0x8a15005e : The server certificate did not match...
```

**Çözüm**: `--source winget` parametresiyle msstore'u atla:

```powershell
winget install Microsoft.VCRedist.2015+.x64 -e --source winget --silent --accept-package-agreements --accept-source-agreements
```

(install scripti zaten bunu kullanıyor — manuel kurulumda lazım olur)

### 2) PowerShell scripti "execution policy" hatası

```
File ... cannot be loaded because running scripts is disabled
```

**Çözüm** (her yeni PowerShell oturumunda):

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
```

### 3) Servis kuruldu ama "Starting" sonra "Stopped" → Backend DLL hatası

Belirtisi: `Get-Service FreeCaption` Status = Stopped.

```powershell
Get-Content C:\FreeCaption\logs\backend-stderr.log -Tail 50
```

**Log'da "WinError 127" görüyorsan** (DLL bulunamadı):

```powershell
# VC++ Redist 2015-2022 kur
winget install Microsoft.VCRedist.2015+.x64 -e --source winget --silent --accept-package-agreements --accept-source-agreements

# ctranslate2'yi 4.4.0'a sabitle (4.5+ Windows uyumsuz)
cd C:\FreeCaption
.\.venv\Scripts\pip install "ctranslate2==4.4.0" --force-reinstall --no-deps
.\.venv\Scripts\pip install intel-openmp

Restart-Service FreeCaption
Start-Sleep 8
(Invoke-WebRequest "http://127.0.0.1:7860/api/health" -UseBasicParsing).Content
```

### 4) Backend "Frontend klasoru yok" hatası

Belirtisi: log'da `RuntimeError: Directory 'C:\FreeCaption\frontend' does not exist`

**Çözüm** — ZIP indirip frontend klasörünü ekle:

```powershell
$z="$env:TEMP\repo.zip"; $x="$env:TEMP\repo_extract"
if (Test-Path $x) { Remove-Item -Recurse -Force $x }
Invoke-WebRequest "https://github.com/ScamEmre/FreeCaption/archive/refs/heads/main.zip" -OutFile $z -UseBasicParsing
Expand-Archive $z $x -Force
Copy-Item -Recurse -Force "$x\FreeCaption-main\frontend" "C:\FreeCaption\frontend"
Remove-Item -Recurse -Force $z, $x
Restart-Service FreeCaption
```

### 5) NSSM servis "Can't open service"

Belirtisi: install scripti Adım 11'de durur.

**Çözüm** — standalone servis kurulum scripti:

```powershell
$n=Get-Random
Invoke-WebRequest "https://raw.githubusercontent.com/ScamEmre/FreeCaption/main/deploy/windows/setup_services.ps1?n=$n" -OutFile "$env:TEMP\setup.ps1" -UseBasicParsing
& "$env:TEMP\setup.ps1"
```

### 6) Plugin "require is not defined"

Belirtisi: FFmpeg WAV ekstraksiyon başlamadan hata.

**Çözüm**: CEP cache temizle, Premiere kapat-aç:

```cmd
rmdir /s /q "%LOCALAPPDATA%\Temp\cep_cache"
```

Sonra Premiere'i yeniden başlat.

### 7) Font dropdown boş / "Sonuç yok"

PowerShell font listesi yüklenmedi.

**Çözüm**: Tab 2'de Yazı kartında **▼** butonuna tıkla → liste boşsa Premiere'i kapat-aç → tekrar dene. localStorage cache 24 saat, yenilenir.

Manuel test (Premiere kapalıyken cmd'de):

```cmd
powershell -NoProfile -Command "Add-Type -AssemblyName PresentationCore; [System.Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source } | Select-Object -First 10"
```

Liste dönmüyorsa Windows PresentationCore eksik (çok nadir).

### 8) Plugin update butonu çalışmıyor

**Manuel update**: GitHub'tan ZIP indir, `%APPDATA%\Adobe\CEP\extensions\FreeCaption\` içine çıkar:

```powershell
$ext = "$env:APPDATA\Adobe\CEP\extensions\FreeCaption"
$z = "$env:TEMP\fc.zip"
Invoke-WebRequest "https://github.com/ScamEmre/FreeCaption/archive/refs/heads/main.zip" -OutFile $z -UseBasicParsing
Expand-Archive $z "$env:TEMP\fc_ext" -Force
Remove-Item -Recurse -Force $ext
Copy-Item -Recurse -Force "$env:TEMP\fc_ext\FreeCaption-main\cep-plugin" $ext
Remove-Item -Recurse -Force $z, "$env:TEMP\fc_ext"
"Plugin yenilendi - Premiere'i kapat-ac"
```

### 9) Disk doldu (model + temp + log)

**Disk kullanımı kontrol**:

```powershell
Get-ChildItem C:\FreeCaption -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | Select-Object @{N="GB";E={[math]::Round($_.Sum/1GB,2)}}
```

**Temp + log temizliği** (güvenli):

```powershell
Get-ChildItem C:\FreeCaption\backend\.temp -File -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTime -lt (Get-Date).AddHours(-24)} | Remove-Item -Force
Get-ChildItem C:\FreeCaption\logs -File -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | Remove-Item -Force
```

### 10) RDP bağlanıyor ama masaüstü siyah / boş

**Çözüm**: Görev Yöneticisi → Dosya → Yeni görev → `explorer.exe` → OK.

---

## 📊 Sağlık Kontrolleri {#saglik-kontrolleri}

### Tek satır health check (sunucuda)

```powershell
"=== Servisler ==="; Get-Service FreeCaption, FreeCaptionCaddy | Format-Table Name, Status, StartType; "=== Health ==="; try { (Invoke-WebRequest 'http://127.0.0.1:7860/api/health' -UseBasicParsing -TimeoutSec 5).Content } catch { "DOWN: $($_.Exception.Message)" }; "=== Disk ==="; Get-PSDrive C | Select-Object Used, Free, @{N='GB Used';E={[math]::Round($_.Used/1GB,1)}}, @{N='GB Free';E={[math]::Round($_.Free/1GB,1)}}; "=== Aktif Python ==="; Get-Process python -ErrorAction SilentlyContinue | Select-Object Id, @{N='MB';E={[math]::Round($_.WorkingSet64/1MB,0)}}, StartTime | Format-Table
```

### Tek satır health check (lokal makinende — VDS dışarıdan)

```powershell
$ip = "<YENI_IP>"
$key = "<API_KEY>"
try { "DIS HEALTH: " + (Invoke-WebRequest "http://$ip/api/health" -Headers @{"X-API-Key"=$key} -UseBasicParsing -TimeoutSec 8).Content } catch { "DOWN: $($_.Exception.Message)" }
```

---

## 📚 Komut Hatırlatıcı {#komut-hatirlatici}

### Sunucuda (RDP içinden)

```powershell
# Servis yeniden başlat
Restart-Service FreeCaption
Restart-Service FreeCaptionCaddy

# Servis durdur
Stop-Service FreeCaption
Stop-Service FreeCaptionCaddy

# Logs - canlı izle
Get-Content C:\FreeCaption\logs\backend-stdout.log -Tail 30 -Wait

# Logs - son 50 satır
Get-Content C:\FreeCaption\logs\backend-stderr.log -Tail 50

# API Key öğren
Get-Content C:\FreeCaption\.env | Select-String "FC_API_KEY"

# Dış IP öğren
(Invoke-WebRequest "https://api.ipify.org" -UseBasicParsing).Content

# Model değiştir (medium → small → tiny daha hızlı)
(Get-Content C:\FreeCaption\.env) -replace '^FC_MODEL=.*', 'FC_MODEL=small' | Set-Content C:\FreeCaption\.env -Encoding ASCII
Restart-Service FreeCaption
```

### Lokal makinede

```cmd
:: Plugin'i yeniden yükle (cep-plugin source → AppData)
cd "<repo-klasoru>"
cep_kur.bat

:: CEP cache temizle (Premiere kapalıyken)
rmdir /s /q "%LOCALAPPDATA%\Temp\cep_cache"

:: Plugin DevTools açma adresi (Chrome'da):
http://localhost:8088
```

### GitHub

- Repo: https://github.com/ScamEmre/FreeCaption
- Release: https://github.com/ScamEmre/FreeCaption/releases/latest
- Issue aç: https://github.com/ScamEmre/FreeCaption/issues/new/choose

---

## 🆘 Hiçbiri Çalışmıyorsa

**Son çare — sıfırdan başla:**

1. Yeni VDS al (Win 11 Pro veya Server 2019/2022)
2. Bu doc'taki "Yeni Windows 11 VDS Kurulumu" bölümünü baştan uygula
3. Eski VDS'i tut, sorunu sonra debug et
4. Lokal pluginin AppData kurulumu zaten korunur, sadece ⚙ → yeni URL/Key

**Self-help kanalları:**
- GitHub Issues (template var, doldur)
- Plugin DevTools'tan console log
- VDS backend log (`C:\FreeCaption\logs\backend-stderr.log`)

---

## Sürüm Bilgisi

Bu runbook: **v1.0.0** ile uyumlu. Plugin / backend sürümü güncellendiğinde bu doc da revize edilir.

GitHub'da güncel sürüm: [RUNBOOK.md](https://github.com/ScamEmre/FreeCaption/blob/main/RUNBOOK.md)
