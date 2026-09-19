#!/usr/bin/env bash
# Katman 2 (DEX) testnet kurulumu. deploy-testnet.sh'den SONRA çalışır.
#
# Yaptıkları:
#   1. reinkey-account'un DEX kurallı yeni wasm'ını derler, yeni bir demo hesap kurar
#      (politika: günde 5 USDC, işlem başına 1 USDC, payees = satıcı,
#       dex_router = Soroswap router, pairs = USDC↔XLM her iki yön).
#   2. Soroswap'ta bizim USDC / native XLM havuzu yoksa oluşturur ve likidite ekler.
#   3. Yeni hesabı 20 USDC + 20 XLM ile fonlar.
#   4. deployments/testnet.json'a alan EKLER; channelContractId ve usdcContractId değişmez.
#      Eski demo hesap demoAccountLegacyId olarak saklanır.
#
# Soroswap testnet kimlikleri: github.com/soroswap/core → public/testnet.contracts.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET=testnet
RPC=https://soroban-testnet.stellar.org
OUT="$ROOT/deployments"
J="$OUT/testnet.json"

ROUTER=${SOROSWAP_ROUTER:-CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD}
FACTORY=${SOROSWAP_FACTORY:-CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY}

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
jget() { python3 -c "import json;print(json.load(open('$J'))['$1'])"; }
g_to_hex() {
  python3 - "$1" <<'EOF'
import base64, sys
raw = base64.b32decode(sys.argv[1])
assert raw[0] == 6 << 3
print(raw[1:33].hex())
EOF
}

USDC_ID=$(jget usdcContractId)
USDC_ASSET=$(jget usdcAsset)
CHANNEL_ID=$(jget channelContractId)
SELLER=$(jget sellerPublicKey)
OLD_ACCOUNT=$(jget demoAccountId)
OWNER=$(stellar keys address rk-agent-owner)
AGENT=$(stellar keys address rk-agent)
DEPLOYER=$(stellar keys address rk-deployer)
XLM_ID=$(stellar contract id asset --asset native --network "$NET")
echo "USDC=$USDC_ID XLM=$XLM_ID router=$ROUTER factory=$FACTORY"

log "Soroswap: USDC/XLM havuzu"
PAIR=$(stellar contract invoke --id "$FACTORY" --source rk-deployer --network "$NET" --send=no -- \
  get_pair --token_a "$USDC_ID" --token_b "$XLM_ID" 2>/dev/null | tr -d '"' || true)
if [[ -z "$PAIR" || "$PAIR" != C* ]]; then
  echo "Havuz yok; oluşturulup likidite eklenecek."
  stellar tx new change-trust --source rk-deployer --line "$USDC_ASSET" --network "$NET" >/dev/null 2>&1 || true
  stellar contract invoke --id "$USDC_ID" --source rk-usdc-issuer --network "$NET" -- \
    mint --to "$DEPLOYER" --amount 5000000000 >/dev/null            # 500 USDC
  DEADLINE=$(( $(date +%s) + 3600 ))
  # 500 USDC : 4000 XLM → 1 XLM ≈ 0.125 USDC
  stellar contract invoke --id "$ROUTER" --source rk-deployer --network "$NET" -- \
    add_liquidity --token_a "$USDC_ID" --token_b "$XLM_ID" \
    --amount_a_desired 5000000000 --amount_b_desired 40000000000 \
    --amount_a_min 0 --amount_b_min 0 --to "$DEPLOYER" --deadline "$DEADLINE"
  PAIR=$(stellar contract invoke --id "$FACTORY" --source rk-deployer --network "$NET" --send=no -- \
    get_pair --token_a "$USDC_ID" --token_b "$XLM_ID" | tr -d '"')
fi
echo "pair: $PAIR"

log "reinkey-account (DEX kurallı) derleniyor ve yeni demo hesap kuruluyor"
(cd "$ROOT/contracts" && stellar contract build --package reinkey-account >/dev/null)
WASM="$ROOT/contracts/target/wasm32v1-none/release/reinkey_account.wasm"
LATEST=$(curl -s -X POST "$RPC" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["sequence"])')
EXPIRES=$((LATEST + 7 * 17280))
POLICY=$(cat <<EOF
{"agent_key":"$(g_to_hex "$AGENT")","asset":"$USDC_ID","per_tx_cap":"10000000","daily_cap":"50000000","payees":["$SELLER"],"channel":"$CHANNEL_ID","expires_ledger":$EXPIRES,"dex_router":"$ROUTER","dex_factory":"$FACTORY","pairs":[["$USDC_ID","$XLM_ID"],["$XLM_ID","$USDC_ID"]]}
EOF
)
ACCOUNT_ID=$(stellar contract deploy --wasm "$WASM" --source rk-deployer --network "$NET" -- \
  --owner "$(g_to_hex "$OWNER")" --policy "$POLICY")
echo "yeni demo hesap: $ACCOUNT_ID"

log "Yeni hesabı fonla: 20 USDC + 20 XLM"
stellar contract invoke --id "$USDC_ID" --source rk-usdc-issuer --network "$NET" -- \
  mint --to "$ACCOUNT_ID" --amount 200000000 >/dev/null
stellar contract invoke --id "$XLM_ID" --source rk-deployer --network "$NET" -- \
  transfer --from "$DEPLOYER" --to "$ACCOUNT_ID" --amount 200000000 >/dev/null

log "deployments/testnet.json güncelleniyor (alan ekleme)"
python3 - "$J" "$ACCOUNT_ID" "$OLD_ACCOUNT" "$ROUTER" "$FACTORY" "$PAIR" "$XLM_ID" <<'EOF'
import json, sys, datetime
p, acc, old, router, factory, pair, xlm = sys.argv[1:]
d = json.load(open(p))
if d.get("demoAccountId") != acc:
    d.setdefault("demoAccountLegacyId", old)
d["demoAccountId"] = acc
d["dexRouterId"] = router
d["dexFactoryId"] = factory
d["dexPairUsdcXlmId"] = pair
d["xlmContractId"] = xlm
d["dexDeployedAt"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
EOF
cat "$J"
log "Tamam."
