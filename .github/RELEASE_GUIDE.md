# GitHub Release Oluşturma Kılavuzu

FreeCaption sürüm yayınlama adımları. İlk release (`v1.0.0`) bu kılavuzla manuel oluşturulur, sonraki release'lar için `gh` CLI tabanlı script eklenebilir.

## Önkoşullar

- Local'de tüm commit'ler push edilmiş
- `CHANGELOG.md` ilgili sürüm için güncel
- `package.json` veya benzeri version bump (FreeCaption'da yok, doğrudan tag kullanılır)

## v1.0.0 Release — İlk Sürüm

### 1) Plugin ZIP Oluştur

Repo root'unda PowerShell aç (örnek: `C:\projeler\FreeCaption`):

```powershell
# Repo root'undasın — cep-plugin alt klasörünü ZIP'le
New-Item -ItemType Directory -Force -Path dist | Out-Null
Compress-Archive -Path cep-plugin\* -DestinationPath dist\FreeCaption-plugin-v1.0.0.zip -Force
```

Çıktı: `dist/FreeCaption-plugin-v1.0.0.zip` (~54 KB, 12 dosya — Adobe CEP extension hazır paketi).

`dist/` klasörü `.gitignore`'da, repo'ya işlenmez — sadece release asset olarak kullanılır.

### 2) Git Tag Oluştur

Repo root'undayken:

```bash
git tag -a v1.0.0 -m "FreeCaption v1.0 - İlk kararlı sürüm"
git push origin v1.0.0
```

**GitHub Desktop alternatifi:** **History** sekmesinde ilgili commit'e sağ tık → **Create Tag…** → `v1.0.0` yaz → **Push origin** ile tag'i de gönder.

GitHub Desktop'ta tag pushlama: **History sekmesinde** ilgili commit'e sağ tık → **Create Tag...** → `v1.0.0` → sonra **Push origin** (tag'i de gönderir).

### 3) GitHub Web'den Release Oluştur

1. https://github.com/ScamEmre/FreeCaption/releases/new
2. **Choose a tag**: `v1.0.0` (yukarıda oluşturduğun tag)
3. **Target**: `main` (default)
4. **Release title**: `v1.0.0 — İlk Kararlı Sürüm`
5. **Description**: aşağıdaki şablonu kopyala/yapıştır:

```markdown
# 🎉 FreeCaption v1.0.0 — İlk Kararlı Sürüm

Premiere Pro için **açık kaynak Türkçe Whisper altyazı eklentisi**. Sıfırdan ücretsiz, yerel, sınırsız.

## 📦 Kurulum

**Lokal (kendi bilgisayarında çalıştır):**
```
git clone https://github.com/ScamEmre/FreeCaption.git
cd FreeCaption
# install.bat — Python + FFmpeg + Whisper otomatik kurar
cep_kur.bat   # plugin'i Premiere'e bağlar
```

**Windows VDS (ekip için merkezi sunucu):**
```
Set-ExecutionPolicy -Scope Process Bypass -Force
$u = "https://raw.githubusercontent.com/ScamEmre/FreeCaption/HEAD/deploy/windows/install_windows.ps1"
Invoke-WebRequest $u -OutFile "$env:TEMP\install.ps1" -UseBasicParsing
& "$env:TEMP\install.ps1"
```

Detay: [README.md](https://github.com/ScamEmre/FreeCaption/blob/main/README.md) · [VDS Kılavuzu](https://github.com/ScamEmre/FreeCaption/blob/main/01_Rehberler_ve_Raporlar/VDS_DEPLOYMENT.md)

## 🚀 Öne Çıkanlar

- **Whisper large-v3 + WhisperX** word-level alignment (±20ms hassasiyet)
- **CPU & GPU desteği** (RTX 50/40/30 + NVIDIA CUDA 12.8)
- **Premiere CEP eklentisi**: Tab 1 (Oluştur) + Tab 2 (Stil Ver)
- **5 animasyon preset**: Karaoke, Fade, Pop, Type, Bounce
- **Sistem fontları**: Premiere'in gördüğü tüm yüklü fontlar (PowerShell entegrasyonu)
- **VDS deploy**: Windows Server 2019/2022 için tek tuş install (Caddy + NSSM + Auto-HTTPS)
- **Auto-update**: Plugin GitHub'tan kendini günceller (🔄 butonu)

## 📝 Tam Değişiklik Listesi

[CHANGELOG.md](https://github.com/ScamEmre/FreeCaption/blob/main/CHANGELOG.md)

## 📥 İndirilebilir Dosyalar

- `FreeCaption-plugin-v1.0.0.zip` — Sadece CEP eklenti paketi (Premiere'e manuel kurulum için).
  Lokal kurulum için: `%APPDATA%\Adobe\CEP\extensions\FreeCaption\` klasörüne çıkar.
- **Source code (zip/tar.gz)** — Tüm proje (otomatik GitHub'tan)

## 🌐 Web

- Tanıtım: https://emrekazak.com/freecaption
- GitHub: https://github.com/ScamEmre/FreeCaption
- Sorun bildir: https://github.com/ScamEmre/FreeCaption/issues

## 🙏 Teşekkürler

- OpenAI Whisper ekibi
- SYSTRAN faster-whisper
- m-bain/WhisperX
- OpenNMT CTranslate2
- Türk video editör topluluğu

---

**Not**: VDS deploy henüz Linux'ta test edilmedi; Windows Server üzerinde production-ready. Linux test/PR'lara açığız.
```

6. **Attach binaries**: `dist/FreeCaption-plugin-v1.0.0.zip` dosyasını sürükle-bırak veya **"Attach binaries"** butonuyla yükle
7. **Set as the latest release** ✓ (en güncel sürüm)
8. **Publish release** mavi butonu

### 4) Doğrulama

- Tarayıcıdan: https://github.com/ScamEmre/FreeCaption/releases
- v1.0.0 release görünmeli, ZIP indirilebilir olmalı
- README'deki badge'ler güncellenir (varsa)

## Sonraki Release'lar İçin Otomatik Script (Yapılacak)

Sürüm yayın otomatik hale getirmek için `gh` CLI gerekir:

```powershell
# winget install GitHub.cli
gh auth login

# Sürüm scripti (örnek):
$VERSION = "1.1.0"
git tag -a "v$VERSION" -m "v$VERSION"
git push origin "v$VERSION"
Compress-Archive -Path cep-plugin\* -DestinationPath "dist\FreeCaption-plugin-v$VERSION.zip" -Force
gh release create "v$VERSION" `
  --title "v$VERSION" `
  --notes-file "RELEASE_NOTES.md" `
  "dist\FreeCaption-plugin-v$VERSION.zip"
```

Bu script `.github/workflows/release.yml` olarak otomatize edilebilir (push to tag → auto release).

## Sürüm Numaralandırma (Semver)

- **1.0.0 → 1.0.1**: Hata düzeltmesi
- **1.0.0 → 1.1.0**: Yeni özellik (eski plugin'ler çalışmaya devam eder)
- **1.0.0 → 2.0.0**: Geriye dönük uyumsuz değişiklik (API/UI breaking)

İlk önce **GitHub Desktop'tan push** ile tüm commit'ler ve tag origin'e gönderilmeli, sonra Releases sayfasından yayın.
