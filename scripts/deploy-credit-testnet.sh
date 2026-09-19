#!/usr/bin/env bash
# Kredi havuzu (Hat 1C) testnet kurulumu. deploy-testnet.sh ve deploy-dex-testnet.sh'den SONRA çalışır.
#
# Yaptıkları:
#   1. credit-pool ve (controller ekli) reinkey-account wasm'larını derler.
#   2. Havuzu deploy eder: yönetici = rk-deployer, fiyat = min(Reflector, Soroswap pair),
#      tasfiye eşiği %90, kâr payı %20.
#   3. AYRI bir kredi demo hesabı kurar: günde 20 USDC, işlem başına 5 USDC,
#      payees = satıcı + havuz, DEX kuralı açık. (Ajanın kendi adresi listede YOK.)
#      Hesabın havuza devri (set_controller, sahip imzası) credit-smoke.mjs içinde yapılır.
#   4. Yatırımcı hesabı (rk-investor): fonlar, USDC trustline açar, 200 USDC basar.
#   5. deployments/testnet.json'a alan EKLER; mevcut alanlara dokunmaz.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET=testnet
RPC=https://soroban-testnet.stellar.org
J="$ROOT/deployments/testnet.json"
# Reflector testnet (CEX/DEX dış fiyat akışı, SEP-40). lastprice(Other("XLM")) 14 ondalıkla USD döner.
ORACLE=${REFLECTOR_ORACLE:-CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63}

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
XLM_ID=$(jget xlmContractId)
CHANNEL_ID=$(jget channelContractId)
ROUTER=$(jget dexRouterId)
FACTORY=$(jget dexFactoryId)
PAIR=$(jget dexPairUsdcXlmId)
SELLER=$(jget sellerPublicKey)
OWNER=$(stellar keys address rk-agent-owner)
AGENT=$(stellar keys address rk-agent)
DEPLOYER=$(stellar keys address rk-deployer)

log "Derleme"
(cd "$ROOT/contracts" && stellar contract build --package credit-pool >/dev/null && stellar contract build --package reinkey-account >/dev/null)
POOL_WASM="$ROOT/contracts/target/wasm32v1-none/release/credit_pool.wasm"
ACC_WASM="$ROOT/contracts/target/wasm32v1-none/release/reinkey_account.wasm"

log "Oracle kontrolü (Reflector)"
stellar contract invoke --id "$ORACLE" --source rk-deployer --network "$NET" --send=no -- \
  lastprice --asset '{"Other":"XLM"}' || { echo "Oracle yanıt vermiyor; yalnızca pair kullanılacak"; ORACLE=""; }

log "credit-pool deploy"
if [[ -n "$ORACLE" ]]; then ORACLE_JSON="\"$ORACLE\""; else ORACLE_JSON=null; fi
CONFIG=$(cat <<EOF
{"admin":"$DEPLOYER","usdc":"$USDC_ID","xlm":"$XLM_ID","oracle":$ORACLE_JSON,"pair":"$PAIR","liq_threshold_bps":9000,"profit_share_bps":2000,"max_price_age":3600}
EOF
)
POOL_ID=$(stellar contract deploy --wasm "$POOL_WASM" --source rk-deployer --network "$NET" -- --config "$CONFIG")
echo "havuz: $POOL_ID"

log "Kredi demo hesabı"
LATEST=$(curl -s -X POST "$RPC" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["sequence"])')
EXPIRES=$((LATEST + 7 * 17280))
POLICY=$(cat <<EOF
{"agent_key":"$(g_to_hex "$AGENT")","asset":"$USDC_ID","per_tx_cap":"50000000","daily_cap":"200000000","payees":["$SELLER","$POOL_ID"],"channel":"$CHANNEL_ID","expires_ledger":$EXPIRES,"dex_router":"$ROUTER","dex_factory":"$FACTORY","pairs":[["$USDC_ID","$XLM_ID"],["$XLM_ID","$USDC_ID"]]}
EOF
)
ACCOUNT_ID=$(stellar contract deploy --wasm "$ACC_WASM" --source rk-deployer --network "$NET" -- \
  --owner "$(g_to_hex "$OWNER")" --policy "$POLICY")
echo "kredi hesabı: $ACCOUNT_ID"

log "Yatırımcı (rk-investor)"
if ! stellar keys address rk-investor >/dev/null 2>&1; then
  stellar keys generate rk-investor --network "$NET" --fund >/dev/null
else
  stellar keys fund rk-investor --network "$NET" >/dev/null 2>&1 || true
fi
INVESTOR=$(stellar keys address rk-investor)
stellar tx new change-trust --source rk-investor --line "$USDC_ASSET" --network "$NET" >/dev/null 2>&1 || echo "  trustline zaten var"
stellar contract invoke --id "$USDC_ID" --source rk-usdc-issuer --network "$NET" -- \
  mint --to "$INVESTOR" --amount 2000000000 >/dev/null   # 200 USDC
echo "yatırımcı: $INVESTOR"

log "deployments/testnet.json güncelleniyor (alan ekleme)"
python3 - "$J" "$POOL_ID" "$ACCOUNT_ID" "$ORACLE" "$INVESTOR" <<'EOF'
import json, sys, datetime
p, pool, acc, oracle, investor = sys.argv[1:]
d = json.load(open(p))
d["creditPoolId"] = pool
d["creditAccountId"] = acc
if oracle:
    d["oracleId"] = oracle
d["investorPublicKey"] = investor
d["creditDeployedAt"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
EOF
log "Tamam. Sıradaki: node scripts/credit-smoke.mjs"
