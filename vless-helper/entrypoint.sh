#!/bin/sh
set -e

XRAY_VPS_HOST="${XRAY_VPS_HOST}"
DOCKER_GW="$(ip route | awk '/default/ {print $3; exit}')"

# Если это домен — резолвим в IP
XRAY_VPS_IP="$(getent hosts ${XRAY_VPS_HOST} | awk '{ print $1 }' | head -n1)"

echo "Resolved VPS: $XRAY_VPS_HOST -> $XRAY_VPS_IP"
echo "Docker GW: $DOCKER_GW"

# Стартуем xray
xray run -config /etc/xray/config.json &
XRAY_PID=$!

sleep 3

# 👉 Маршрут до VPS (чтобы не ушёл в туннель)
ip route add ${XRAY_VPS_IP}/32 via ${DOCKER_GW} dev eth0 || true

# 👉 Локальные сети — НЕ через VPN
ip route add 127.0.0.0/8 dev lo || true
ip route add 10.0.0.0/8 via ${DOCKER_GW} dev eth0 || true
ip route add 172.16.0.0/12 via ${DOCKER_GW} dev eth0 || true
ip route add 192.168.0.0/16 via ${DOCKER_GW} dev eth0 || true

# (опционально) если используешь docker network напрямую
ip route add 172.17.0.0/16 via ${DOCKER_GW} dev eth0 || true

# 👉 Переключаем default route в туннель
ip route del default || true
ip route add default dev xray0 || true

echo "Final routes:"
ip route

wait $XRAY_PID
