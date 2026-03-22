#!/bin/sh
set -e

XRAY_VPS_HOST="${XRAY_VPS_HOST}"
DOCKER_GW="$(ip route | awk '/default/ {print $3; exit}')"

# Если это домен — резолвим в IP
XRAY_VPS_IP="$(getent hosts ${XRAY_VPS_HOST} | awk '{ print $1 }' | head -n1)"

echo "Resolved VPS: $XRAY_VPS_HOST -> $XRAY_VPS_IP"

# Стартуем xray
xray run -config /etc/xray/config.json &
XRAY_PID=$!

sleep 3

# Добавляем маршрут до VPS
ip route add ${XRAY_VPS_IP}/32 via ${DOCKER_GW} dev eth0 || true

# Переключаем default route
ip route del default || true
ip route add default dev xray0 || true

ip route

wait $XRAY_PID
