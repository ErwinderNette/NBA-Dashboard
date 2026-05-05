#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-nba}"
SSH_PORT="${SSH_PORT:-22}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bitte als root ausfuehren."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt update
apt upgrade -y
apt install -y \
  podman \
  uidmap \
  slirp4netns \
  fuse-overlayfs \
  python3-pip \
  ufw \
  fail2ban

if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG sudo "${DEPLOY_USER}"

if ! command -v podman-compose >/dev/null 2>&1; then
  pip3 install --break-system-packages podman-compose
fi

loginctl enable-linger "${DEPLOY_USER}"

mkdir -p "/home/${DEPLOY_USER}/app" "/home/${DEPLOY_USER}/backups" "/home/${DEPLOY_USER}/.config/systemd/user"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/app" "/home/${DEPLOY_USER}/backups" "/home/${DEPLOY_USER}/.config"

runuser -l "${DEPLOY_USER}" -c 'systemctl --user daemon-reload'
runuser -l "${DEPLOY_USER}" -c 'systemctl --user enable --now podman.socket'

cp /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication .*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
if grep -q '^#\?AllowUsers' /etc/ssh/sshd_config; then
  sed -i "s/^#\?AllowUsers.*/AllowUsers ${DEPLOY_USER}/" /etc/ssh/sshd_config
else
  echo "AllowUsers ${DEPLOY_USER}" >> /etc/ssh/sshd_config
fi
if [[ "${SSH_PORT}" != "22" ]]; then
  if grep -q '^#\?Port ' /etc/ssh/sshd_config; then
    sed -i "s/^#\?Port .*/Port ${SSH_PORT}/" /etc/ssh/sshd_config
  else
    echo "Port ${SSH_PORT}" >> /etc/ssh/sshd_config
  fi
fi
systemctl restart ssh || systemctl restart sshd

ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now fail2ban

echo "Setup abgeschlossen."
echo "Validierung:"
echo "  su - ${DEPLOY_USER} -c 'podman --version && podman-compose --version'"
echo "  ufw status verbose"
echo "  fail2ban-client status sshd"
