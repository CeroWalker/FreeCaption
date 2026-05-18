# Pull Request

## Açıklama

<!-- Bu PR ne yapıyor? Hangi problemi çözüyor? -->



## İlgili Issue

<!-- "Fixes #123" veya "Closes #123" yaz, PR merge olunca issue otomatik kapanır -->
Fixes #

## Değişiklik Türü

<!-- Geçerli olanları [x] ile işaretle -->

- [ ] 🐛 Hata düzeltmesi (bug fix — mevcut işlevsellik bozulmuyor)
- [ ] ✨ Yeni özellik (feature — mevcut işlevsellik bozulmuyor)
- [ ] 💥 Geriye dönük uyumsuz değişiklik (breaking change)
- [ ] 📚 Dokümantasyon
- [ ] 🎨 Kod stili / format
- [ ] ♻️ Refactoring (davranış değişmiyor)
- [ ] ⚡ Performans iyileştirmesi
- [ ] 🧪 Test eklendi / düzeltildi
- [ ] 🔧 Build / deploy / CI değişikliği

## Hangi Alanı Etkiliyor?

- [ ] Plugin UI (CEP panel `cep-plugin/`)
- [ ] Tab 1 — Oluştur (`app.js`, `index.html`)
- [ ] Tab 2 — Stil Ver (`tab-style.js`, `renderer.js`)
- [ ] ExtendScript (`jsx/main.jsx`)
- [ ] Backend (FastAPI + Whisper, `backend/`)
- [ ] Deploy / Install (`deploy/`)
- [ ] Dokümantasyon (README, CHANGELOG vs.)

## Test Planı

<!-- Değişikliği nasıl test ettin? Test edilmesi gereken senaryolar -->

- [ ] Lokal'de Premiere ile test ettim (panel + transcribe + caption track)
- [ ] VDS modunda test ettim
- [ ] Linter / format hata vermiyor
- [ ] CHANGELOG.md güncellendi (kullanıcıya görünür değişiklik için)
- [ ] README / docs güncellendi (gerekiyorsa)

## Ekran Görüntüsü / Video

<!-- UI değişikliği varsa "öncesi vs sonrası" eklemek faydalı -->



## Geriye Dönük Uyumluluk

<!-- Mevcut kullanıcılar etkilenir mi? Migration gerekiyor mu? -->

- [ ] Eski plugin/sunucu kombinasyonlarıyla uyumlu
- [ ] Database/config schema değişikliği yok
- [ ] Yeni env değişkeni veya bağımlılık eklendi (varsa CHANGELOG'a yazıldı)

## Notlar

<!-- Reviewer'a iletmek istediğin başka bir şey -->
