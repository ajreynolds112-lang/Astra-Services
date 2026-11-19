#!/bin/bash
# Turn the self-hosted site on or off: scripts/site.sh on|off|status
# While on, caffeinate keeps the Mac from idle-sleeping; off lets it sleep again.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
DIR="$HOME/Library/Application Support/astra"   # not LaunchAgents, so nothing starts at login
LOGS="$HOME/Library/Logs/astra"
DOMAIN="gui/$(id -u)"
ENV_FILE=${ASTRA_ENV_FILE:-$([ -f .env.production ] && echo .env.production || echo .env.staging)}
TUNNEL_CONFIG="$HOME/.cloudflared/config.yml"
mkdir -p "$DIR" "$LOGS"

plist() { # label, then program arguments
  local label=$1; shift
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo "<plist version=\"1.0\"><dict><key>Label</key><string>$label</string><key>ProgramArguments</key><array>"
    for arg in "$@"; do echo "<string>$arg</string>"; done
    echo "</array><key>WorkingDirectory</key><string>$ROOT</string>"
    echo "<key>EnvironmentVariables</key><dict><key>ASTRA_ENV_FILE</key><string>$ENV_FILE</string></dict>"
    echo "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>"
    echo "<key>StandardOutPath</key><string>$LOGS/$label.log</string><key>StandardErrorPath</key><string>$LOGS/$label.log</string>"
    echo "</dict></plist>"
  } > "$DIR/$label.plist"
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$DIR/$label.plist"
}

running() { launchctl print "$DOMAIN/$1" >/dev/null 2>&1; }

case "${1:-status}" in
  on)
    [ -f "artifacts/api-server/dist/index.mjs" ] || { echo "Not built yet: ASTRA_ENV_FILE=$ENV_FILE node scripts/production.mjs build"; exit 1; }
    plist org.astra-services.server /usr/bin/caffeinate -i "$(command -v node)" "$ROOT/scripts/production.mjs" start
    if [ -f "$TUNNEL_CONFIG" ]; then
      plist org.astra-services.tunnel "$(command -v cloudflared)" --no-autoupdate --config "$TUNNEL_CONFIG" tunnel run
    else
      echo "No $TUNNEL_CONFIG yet: the site runs locally only (no public tunnel)."
    fi
    for _ in $(seq 1 20); do curl -fs -o /dev/null "http://127.0.0.1:${ASTRA_PORT:-8090}/api/healthz" && break; sleep 1; done
    "$0" status ;;
  off)
    for label in org.astra-services.tunnel org.astra-services.server; do launchctl bootout "$DOMAIN/$label" 2>/dev/null || true; done
    echo "ASTRA is OFF. The Mac can sleep." ;;
  status)
    if running org.astra-services.server && curl -fs -o /dev/null "http://127.0.0.1:${ASTRA_PORT:-8090}/api/healthz"; then
      echo "ASTRA is ON ($ENV_FILE). Tunnel: $(running org.astra-services.tunnel && echo running || echo not running)"
    else
      echo "ASTRA is OFF."
    fi ;;
  *) echo "Usage: scripts/site.sh on|off|status"; exit 1 ;;
esac
