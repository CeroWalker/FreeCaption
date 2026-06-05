#!/usr/bin/env bash
# FreeCaption - macOS CEP Eklenti Kurulumu
# Kullanım: ./cep_kur.sh
set -euo pipefail

echo "==================================================="
echo "  FreeCaption - macOS CEP Eklenti Kurulumu"
echo "==================================================="
echo ""

# 1. CEP Debug Mode aktive et (CSXS 9, 10, 11, 12)
echo "[1/3] CEP debug modu aktif ediliyor..."
defaults write com.adobe.CSXS.9 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.10 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.11 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.12 PlayerDebugMode 1 2>/dev/null || true
echo "      OK"
echo ""

# 2. CEP extensions klasörü
TARGET_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/FreeCaption"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cep-plugin"

if [ ! -d "${SOURCE_DIR}" ]; then
    echo "HATA: cep-plugin klasörü bulunamadı."
    echo "Konum: ${SOURCE_DIR}"
    exit 1
fi

echo "[2/3] Eski kurulum varsa temizleniyor..."
rm -rf "${TARGET_DIR}"
mkdir -p "$(dirname "${TARGET_DIR}")"
echo "      OK"
echo ""

echo "[3/3] Eklenti kopyalanıyor..."
cp -R "${SOURCE_DIR}" "${TARGET_DIR}"
echo "      OK"
echo ""

# ExtendScript ES3'te JSON.stringify yok - polyfill (json2.js) main.jsx başına eklenir
echo "[3.5/3] JSON polyfill main.jsx ile birleştiriliyor..."
if [ -f "${TARGET_DIR}/jsx/json2.js" ] && [ -f "${TARGET_DIR}/jsx/main.jsx" ]; then
    cat "${TARGET_DIR}/jsx/json2.js" > "${TARGET_DIR}/jsx/temp.jsx"
    echo -e "\n\n// ===== main.jsx (concat) =====\n\n" >> "${TARGET_DIR}/jsx/temp.jsx"
    cat "${TARGET_DIR}/jsx/main.jsx" >> "${TARGET_DIR}/jsx/temp.jsx"
    mv "${TARGET_DIR}/jsx/temp.jsx" "${TARGET_DIR}/jsx/main.jsx"
    echo "      OK"
else
    echo "UYARI: Polyfill birleştirme başarısız. Dosyalar bulunamadı."
fi
echo ""

echo "==================================================="
echo "  KURULUM TAMAMLANDI."
echo ""
echo "  Premiere Pro'yu yeniden başlatın."
echo "  Window > Extensions > FreeCaption menüsünden açın."
echo "==================================================="
echo ""
