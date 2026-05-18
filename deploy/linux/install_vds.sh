#!/usr/bin/env bash
# FreeCaption — VDS kurulum scripti (Ubuntu 22.04 / Debian 12)
# Kullanim: sudo bash install_vds.sh
set -euo pipefail

APP_DIR="/opt/freecaption"
APP_USER="freecaption"
PY="python3"

echo "==> 1/8 Paket kurulumu (apt)"
apt-get update
apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    ffmpeg git curl ca-certificates \
    nginx ufw \
    build-essential

echo "==> 2/8 Servis kullanicisi (freecaption) olustur"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> 3/8 Dizin haklari"
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# .env yoksa template'den uret
if [ ! -f "${APP_DIR}/.env" ]; then
    if [ -f "${APP_DIR}/deploy/.env.example" ]; then
        cp "${APP_DIR}/deploy/.env.example" "${APP_DIR}/.env"
    fi
    # Random API key
    API_KEY="$(${PY} -c 'import secrets; print(secrets.token_urlsafe(32))')"
    sed -i "s|^FC_API_KEY=.*|FC_API_KEY=${API_KEY}|" "${APP_DIR}/.env" || \
        echo "FC_API_KEY=${API_KEY}" >> "${APP_DIR}/.env"
    chmod 600 "${APP_DIR}/.env"
    chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
    echo ""
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║  YENI API KEY OLUSTURULDU — saklayin:                     ║"
    echo "  ║  ${API_KEY}"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo ""
fi

echo "==> 4/8 Venv olustur + bagimliliklar (CPU torch)"
sudo -u "${APP_USER}" ${PY} -m venv "${APP_DIR}/.venv"
source "${APP_DIR}/.venv/bin/activate"
pip install --upgrade pip wheel
# CPU-only torch (CUDA olmayan)
pip install torch==2.7.1+cpu --index-url https://download.pytorch.org/whl/cpu
pip install -r "${APP_DIR}/requirements.txt"
deactivate

echo "==> 5/8 Modeli onceden indir (medium)"
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && source .venv/bin/activate && \
    FC_MODE=cpu FC_MODEL=medium python -c 'from transcribe import get_transcriber; t=get_transcriber(); t._load_whisper(); print(\"Model hazir\")'" \
    || echo "  (Uyari: Model on-yukleme atlandi. Ilk istekte indirilecek.)"

echo "==> 6/8 systemd service kur"
cp "${APP_DIR}/deploy/freecaption.service" /etc/systemd/system/freecaption.service
systemctl daemon-reload
systemctl enable freecaption
systemctl restart freecaption
sleep 2
systemctl --no-pager status freecaption | head -10 || true

echo "==> 7/8 Nginx reverse proxy"
cp "${APP_DIR}/deploy/nginx.conf" /etc/nginx/sites-available/freecaption
ln -sf /etc/nginx/sites-available/freecaption /etc/nginx/sites-enabled/freecaption
# Default site'i devre disi birak (cakismayi onler)
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> 8/8 Firewall (UFW)"
ufw allow 22/tcp >/dev/null || true
ufw allow 80/tcp >/dev/null || true
ufw allow 443/tcp >/dev/null || true
yes | ufw enable >/dev/null || true
ufw status verbose | head -10 || true

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  KURULUM TAMAM                                            ║"
echo "  ╠══════════════════════════════════════════════════════════╣"
echo "  ║  Health check:                                            ║"
echo "  ║     curl http://localhost/api/health                      ║"
echo "  ║                                                          ║"
echo "  ║  HTTPS icin (domain varsa):                              ║"
echo "  ║     apt install -y certbot python3-certbot-nginx          ║"
echo "  ║     certbot --nginx -d api.YOURDOMAIN.com                 ║"
echo "  ║                                                          ║"
echo "  ║  Logs:                                                   ║"
echo "  ║     journalctl -u freecaption -f                          ║"
echo "  ║                                                          ║"
echo "  ║  API Key (.env icinde): cat ${APP_DIR}/.env | grep KEY"
echo "  ╚══════════════════════════════════════════════════════════╝"
