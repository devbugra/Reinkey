#!/usr/bin/env bash
# Reinkey testnet kurulumu: hesaplar, demo USDC, kontrat deploy'u, demo Reinkey Account.
#
# Çıktılar:
#   deployments/testnet.json   herkese açık değerler (backend/panel/SDK okur)
#   deployments/.secrets.env   gizli anahtarlar (git'e girmez)
#
# Tekrar çalıştırılabilir: var olan anahtarlar yeniden üretilmez; kontratlar her
# çalıştırmada YENİDEN deploy edilir (yeni kimlikler). Yalnızca kimlikleri
# yazdırmak için: SKIP_DEPLOY=1.
#
# Neden kendi USDC'miz: Circle testnet USDC (issuer GBBD47IF…) yalnızca
# faucet.circle.com üzerinden, elle ve sınırlı miktarda alınabiliyor. Demo
# ajanlarının otomatik fonlanması için issuer'ı bizim olan "USDC" varlığını
# kullanıyoruz. Kod her iki varlıkla da çalışır; yalnızca kimlik değişir.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET=testnet
RPC=https://soroban-testnet.stellar.org
PASSPHRASE="Test SDF Network ; September 2015"
OUT="$ROOT/deployments"
mkdir -p "$OUT"

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# G-strkey → ham ed25519 açık anahtarı (hex)
g_to_hex() {
  python3 - "$1" <<'EOF'
import base64, sys
raw = base64.b32decode(sys.argv[1])
assert raw[0] == 6 << 3, "G adresi değil"
print(raw[1:33].hex())
EOF
}

# S-strkey → ham ed25519 seed (hex)
s_to_hex() {
  python3 - "$1" <<'EOF'
import base64, sys
raw = base64.b32decode(sys.argv[1])
assert raw[0] == 18 << 3, "S anahtarı değil"
print(raw[1:33].hex())
EOF
}

ensure_key() {
  local name=$1
  if ! stellar keys address "$name" >/dev/null 2>&1; then
    stellar keys generate "$name" --network "$NET" --fund >/dev/null
  else
    stellar keys fund "$name" --network "$NET" >/dev/null 2>&1 || true
  fi
  stellar keys address "$name"
}

log "Hesaplar (friendbot ile fonlanır)"
DEPLOYER=$(ensure_key rk-deployer)
FACILITATOR=$(ensure_key rk-facilitator)
SELLER=$(ensure_key rk-seller)
ISSUER=$(ensure_key rk-usdc-issuer)
OWNER=$(ensure_key rk-agent-owner)   # Reinkey Account sahibi (ed25519)
AGENT=$(ensure_key rk-agent)         # ajan anahtarı (ed25519; zincirde hesap olarak kullanılmaz)
echo "deployer=$DEPLOYER facilitator=$FACILITATOR seller=$SELLER issuer=$ISSUER owner=$OWNER agent=$AGENT"

log "Demo USDC (issuer: rk-usdc-issuer) ve SAC"
ASSET="USDC:$ISSUER"
USDC_ID=$(stellar contract id asset --asset "$ASSET" --network "$NET")
if ! stellar contract asset deploy --asset "$ASSET" --source rk-deployer --network "$NET" >/dev/null 2>&1; then
  echo "(SAC zaten deploy edilmiş olabilir)"
fi
echo "USDC SAC: $USDC_ID"
CIRCLE_USDC_ID=$(stellar contract id asset --asset "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" --network "$NET")
echo "Circle testnet USDC SAC (referans): $CIRCLE_USDC_ID"

log "G-hesaplar için trustline (seller, facilitator, agent-owner)"
for who in rk-seller rk-facilitator rk-agent-owner; do
  stellar tx new change-trust --source "$who" --line "$ASSET" --network "$NET" >/dev/null 2>&1 || echo "  $who: trustline zaten var"
done

log "USDC basımı (agent-owner'a 100 USDC)"
stellar contract invoke --id "$USDC_ID" --source rk-usdc-issuer --network "$NET" -- \
  mint --to "$OWNER" --amount 1000000000 >/dev/null

if [[ "${SKIP_DEPLOY:-0}" != "1" ]]; then
  log "Kontratlar derleniyor"
  (cd "$ROOT/contracts" && stellar contract build >/dev/null)
  WASM="$ROOT/contracts/target/wasm32v1-none/release"

  log "channel deploy"
  CHANNEL_ID=$(stellar contract deploy --wasm "$WASM/channel.wasm" --source rk-deployer --network "$NET")
  echo "channel: $CHANNEL_ID"

  log "reinkey-account (demo) deploy"
  OWNER_HEX=$(g_to_hex "$OWNER")
  AGENT_HEX=$(g_to_hex "$AGENT")
  LATEST=$(curl -s -X POST "$RPC" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["sequence"])')
  EXPIRES=$((LATEST + 7 * 17280))  # 7 gün
  POLICY=$(cat <<EOF
{"agent_key":"$AGENT_HEX","asset":"$USDC_ID","per_tx_cap":"10000000","daily_cap":"50000000","payees":["$SELLER"],"channel":"$CHANNEL_ID","expires_ledger":$EXPIRES}
EOF
)
  ACCOUNT_ID=$(stellar contract deploy --wasm "$WASM/reinkey_account.wasm" --source rk-deployer --network "$NET" -- \
    --owner "$OWNER_HEX" --policy "$POLICY")
  echo "reinkey-account (demo): $ACCOUNT_ID"

  log "Demo hesabına 20 USDC"
  stellar contract invoke --id "$USDC_ID" --source rk-usdc-issuer --network "$NET" -- \
    mint --to "$ACCOUNT_ID" --amount 200000000 >/dev/null
else
  CHANNEL_ID=$(python3 -c "import json;print(json.load(open('$OUT/testnet.json'))['channelContractId'])")
  ACCOUNT_ID=$(python3 -c "import json;print(json.load(open('$OUT/testnet.json'))['demoAccountId'])")
fi

log "deployments/testnet.json"
cat > "$OUT/testnet.json" <<EOF
{
  "network": "stellar:testnet",
  "networkPassphrase": "$PASSPHRASE",
  "rpcUrl": "$RPC",
  "channelContractId": "$CHANNEL_ID",
  "usdcContractId": "$USDC_ID",
  "usdcAsset": "$ASSET",
  "usdcDecimals": 7,
  "circleUsdcContractId": "$CIRCLE_USDC_ID",
  "demoAccountId": "$ACCOUNT_ID",
  "deployerPublicKey": "$DEPLOYER",
  "facilitatorPublicKey": "$FACILITATOR",
  "sellerPublicKey": "$SELLER",
  "usdcIssuerPublicKey": "$ISSUER",
  "agentOwnerPublicKey": "$OWNER",
  "agentPublicKey": "$AGENT",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

cat > "$OUT/.secrets.env" <<EOF
# GİZLİ — paylaşma, commit etme.
FACILITATOR_SECRET=$(stellar keys secret rk-facilitator)
SELLER_SECRET=$(stellar keys secret rk-seller)
USDC_ISSUER_SECRET=$(stellar keys secret rk-usdc-issuer)
AGENT_OWNER_SECRET=$(stellar keys secret rk-agent-owner)
AGENT_SECRET=$(stellar keys secret rk-agent)
AGENT_OWNER_SEED_HEX=$(s_to_hex "$(stellar keys secret rk-agent-owner)")
AGENT_SEED_HEX=$(s_to_hex "$(stellar keys secret rk-agent)")
EOF
chmod 600 "$OUT/.secrets.env"
printf '.secrets.env\n*.secret*\n' > "$OUT/.gitignore"

cat "$OUT/testnet.json"
log "Tamam."
