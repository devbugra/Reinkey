# Ana ağa geçiş

Kod ağdan bağımsızdır: hangi ağda çalıştığını üç değer belirler. Ana ağa geçiş bir
kod değişikliği değil, bir **dağıtım ve sorumluluk** kararıdır. Bu belge neyin hazır,
neyin hazır olmadığını ayırır.

## Bugün ana ağa çıkabilecek olan

| Parça | Neden güvenli |
|---|---|
| `channel` kontratı | Durumu yalındır: depozito kilitlenir, para yalnızca kanalın satıcısına ya da süre dolunca ödeyene gider. Yöneticisi, yükseltme yolu, havuzu yok. Kaynağından derlenen wasm dağıtılanla birebir aynı. |
| `reinkey-account` kontratı | Her hesap sahibinin kendi kontratıdır; bizim anahtarımız hiçbirinde yok. Risk hesabın içindeki bakiyeyle sınırlı. |
| Facilitator (backend) | Emanet tutmaz. Anahtarı yalnızca `claim` ücretini öder; `claim`'i herkes çağırabilir, para yine satıcıya gider. |
| Konsol | Tamamen istemci tarafı; yazmalar kullanıcının cüzdanıyla imzalanır. |

## Ana ağa ÇIKMAMASI gereken

- **Reinkey Float (`credit-pool`).** Başkalarının parasını toplayıp teminatsız kredi
  veren bir kontrattır; oracle, tasfiye ve pay muhasebesi içerir. Bağımsız denetim
  görmeden ana ağda mevduat kabul etmek kullanıcı parasını riske atar. Testnet'te kalır;
  ana ağ yapılandırmasında `CREDIT_POOL_ID` boş bırakılır ve Float görünümü kapanır.
- **Demo kontrolleri.** Sunucunun anahtarıyla ajan başlatma ve dondurma ana ağda kod
  düzeyinde kapalıdır (`DEMO_CONTROLS=true` olsa bile).
- **Kendi dağıttığımız test USDC'si ve test havuzu.** Ana ağda Circle USDC ve gerçek
  Soroswap adresleri kullanılır; aşağıya bakın.

## Geçmeden önce kapatılması gerekenler

1. **`reinkey-account` wasm'ı kaynağından yeniden derlenip yüklenecek.** Testnet'teki
   dağıtım (`59b36bb4…`) bugünkü kaynakla birebir eşleşmiyor; ana ağa yalnızca
   depodaki kaynaktan çıkan, hash'i README'ye yazılan wasm yüklenir.
2. **Kontrat incelemesi.** En azından `__check_auth`, `check_contexts` ve `claim` için
   ikinci bir göz; ideal olan bağımsız denetim. İnceleme yapılana kadar konsolda hesap
   kurma formuna "önerilen üst bakiye" uyarısı konur.
3. **Facilitator anahtarı.** Yeni üretilir, yalnızca barındırma panelinde durur, az XLM
   ile fonlanır (yalnızca ücret öder). Testnet anahtarı yeniden kullanılmaz.
4. **Hız sınırı ve kötüye kullanım.** `claim` ve akış uçları ücret harcatır; ana ağda
   ücret gerçek paradır. `docs/BACKEND.md`'deki sınırlar gözden geçirilir.

## Adımlar

```bash
# 1. Kaynaktan derle, hash'leri kaydet
stellar contract build
sha256sum target/wasm32v1-none/release/{channel,reinkey_account}.wasm

# 2. Yükle ve kur (fonlu bir ana ağ hesabıyla; --network mainnet)
stellar contract upload  --network mainnet --source <deployer> --wasm …/reinkey_account.wasm   # → accountWasmHash
stellar contract deploy  --network mainnet --source <deployer> --wasm …/channel.wasm           # → channelContractId

# 3. deployments/mainnet.json
{
  "network": "stellar:pubnet",
  "networkPassphrase": "Public Global Stellar Network ; September 2015",
  "rpcUrl": "<ana ağ Soroban RPC sağlayıcınız>",
  "channelContractId": "C…",
  "accountWasmHash": "…",
  "usdcContractId": "<Circle USDC SAC: stellar contract id asset --asset USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN --network mainnet>",
  "xlmContractId":  "<stellar contract id asset --asset native --network mainnet>",
  "dexRouterId": "<Soroswap ana ağ router>", "dexFactoryId": "<Soroswap ana ağ factory>",
  "dexPairUsdcXlmId": "<factory.get_pair(USDC, XLM)>",
  "sellerPublicKey": "G…"
}
```

Adresleri elle yazmayın; yukarıdaki USDC ihraççısını da Circle'ın kendi yayımladığı adresle karşılaştırın: USDC ve XLM kimliklerini yukarıdaki komutlarla, Soroswap
adreslerini Soroswap'ın yayımladığı ana ağ dağıtım dosyasından alın ve
`factory.get_pair` ile çifti zincirde doğrulayın.

| Nerede | Değişken | Değer |
|---|---|---|
| backend | `STELLAR_RPC_URL` | ana ağ RPC |
| backend | `STELLAR_NETWORK_PASSPHRASE` | `Public Global Stellar Network ; September 2015` |
| backend | `X402_NETWORK` | `stellar:pubnet` |
| backend | `DEPLOYMENT_FILE` | `../deployments/mainnet.json` |
| backend | `FACILITATOR_SECRET` | yeni, yalnızca ana ağ için |
| konsol | `NEXT_PUBLIC_STELLAR_NETWORK` | `public` |
| ajan | `RELAYER_SECRET` | zorunlu (ana ağda friendbot yok) |

Ağ değişince explorer bağlantıları, cüzdanın bağlandığı ağ ve gelir dökümündeki
bağlantılar kendiliğinden ana ağa döner.

## Önerilen yol

Testnet yayını (reinkey.io) olduğu gibi kalsın; ana ağ **ayrı bir backend ve ayrı bir
konsol dağıtımı** olarak açılsın. İlk ana ağ sürümü yalnızca Meter + Reins'tir, küçük
bakiyelerle, Float'suz.
