# Reinkey kontratları

İki Soroban kontratı, tek Cargo workspace:

| Kontrat | İş |
|---|---|
| `channel` | Tek yönlü ödeme kanalı: `open`, `top_up`, `claim`, `close(id, caller)`, `get` |
| `reinkey-account` | Ajanın akıllı hesabı; politika `__check_auth` içinde. `get_policy`, `get_spent`, `is_frozen`, `get_owner`, sahip için `set_policy`, `freeze`, `unfreeze` |

Katman 2 (DEX) ile birlikte hesap, Soroswap üzerinde **izinli çiftlerde ve tavan içinde** işlem yapmaya da izin verir; bkz. "DEX kuralı".

Sözleşme: `../proje-tanimi.md` §3.1–3.2, §3.6 ve `../docs/BACKEND.md` §3.1–3.3.

## Araçlar

- Rust **1.92.0** (`rust-toolchain.toml` sabitler). soroban-sdk 28 en az 1.91 istiyor, stellar-cli 28 ise 1.91.0 ile wasm derlemeyi reddediyor.
- stellar-cli **28.0.0** (testnet protokol 28).
- soroban-sdk **28.0.0**, `hazmat-address` feature'ı açık (`Address::to_payload` için; kanal kendi ham kimliğini kupon mesajına koyuyor).

## Komutlar

```bash
cargo test                 # 25 test (channel 7, reinkey-account 18)
stellar contract build     # target/wasm32v1-none/release/{channel,reinkey_account}.wasm
../scripts/deploy-testnet.sh       # hesaplar + demo USDC + deploy → ../deployments/testnet.json
../scripts/deploy-dex-testnet.sh   # DEX kurallı yeni demo hesap + Soroswap USDC/XLM havuzu
node ../scripts/dex-smoke.mjs      # ajan imzasıyla gerçek swap + red senaryoları (testnet)
```

Kupon imzalama (zincir dışı, backend ile aynı yöntem):

```bash
node ../scripts/sign-voucher.mjs <channelContractId> <channelId> <cumulative> <seedHex>
```

## Kupon

```
hash = sha256("reinkey:voucher:v1" ‖ network_id ‖ channel_contract_id(32) ‖ id u64 BE ‖ cumulative i128 BE)
sig  = ed25519(voucher_key, hash)
```

`channel/src/test.rs::voucher_test_vector`, BACKEND.md §3.2'deki vektörü birebir doğrular.

## Olaylar

Topic: `("channel", "<olay>", id: u64)`. Veri: alan adlı map.

| Olay | Veri |
|---|---|
| `opened` | `payer, payee, asset, deposit, expiry_ledger` |
| `topped_up` | `amount, deposit` |
| `claimed` | `amount, cumulative` |
| `closed` | `refunded, claimed` |

## Hata kodları

`channel`: 20 CHANNEL_NOT_FOUND, 21 CHANNEL_CLOSED, 22 VOUCHER_BAD_SIGNATURE*, 23 VOUCHER_NOT_INCREASING, 24 EXCEEDS_DEPOSIT, 25 NOT_EXPIRED, 26 NOT_AUTHORIZED, **27 INVALID_ARGUMENT** (ek).
`reinkey-account`: 1 BAD_SIGNATURE*, 2 POLICY_EXPIRED, 3 ACCOUNT_FROZEN, 4 CONTEXT_NOT_ALLOWED, 5 PAYEE_NOT_ALLOWED, 6 PER_TX_CAP_EXCEEDED, 7 DAILY_CAP_EXCEEDED, **8 PAIR_NOT_ALLOWED** (ek), **9 SLIPPAGE_UNBOUNDED** (ek).

Politika reddi zincirde işlemin ÜST DÜZEY hatası olarak görünmez: üst düzeyde
`Error(Auth, InvalidAction)` vardır, kodumuz tanı olayının içindedir:
`failed account authentication with error [<hesap>, Error(Contract, #N)]`.
Backend `/v1/report` eşlemesini buradan okumalı.

## DEX kuralı (katman 2)

Politikaya eklenen alanlar: `dex_router: Option<Address>`, `dex_factory: Option<Address>`,
`pairs: Vec<(Address, Address)>`.

İzinli tek bağlam: `router.swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline)`.
Kontroller: `to == hesap`, tek adımlı yol, `(path[0], path[1]) ∈ pairs`, `amount_out_min > 0`,
satılan varlık USDC ise `amount_in ≤ per_tx_cap` ve günlük tavan.

Router'ın altındaki `token.transfer(hesap, pair, amount_in)` bağlamı, alıcısı
factory'nin `get_pair` ile döndürdüğü pair ise o swap'ın parçası sayılır ve
tutar ayrıca sayılmaz. Pair adresi `__check_auth` içinden factory'ye sorularak
doğrulanır (router çağrı yığınında olduğu için ona geri çağrı yapılamaz; factory
yığında değildir). Bir swap yalnızca TEK bir transferi örter; fazlası ayrıca
denetlenir.

Testler gerçek Soroswap wasm'larını kullanır (`reinkey-account/testdata/`,
testnet'ten `stellar contract fetch` ile alındı).

\* Geçersiz imzada host `ed25519_verify` işlemi kendisi durdurur. Zincirde bu kodlar yerine `Error(Crypto, InvalidInput)` görülür; backend bunu imza hatası olarak eşlemeli.

## Politika notları

- Tavanlar yalnızca `policy.asset` (USDC) için. Başka bir varlığın transferi → `CONTEXT_NOT_ALLOWED`.
- Kanal açılışının auth ağacı `open → transfer` biçimindedir. Depozito yalnızca `transfer` bağlamında sayılır (çift sayım yok).
- `policy.channel` adresine transfere yalnızca aynı ağaçta `open`/`top_up` varsa izin verilir. Aksi hâlde depozito kaydı olmayan para kanal kontratında kilitli kalırdı.
- `payees` listesine kanal kontratını eklemeye gerek yok; kanal adresi `policy.channel` üzerinden tanınıyor.
- Gün: `ledger_seq / 17280`.

## Kredi havuzu (`credit-pool`): kısıta dayalı, teminatsız kredi

Fikir: Reinkey Account'taki fon yalnızca politikanın izin verdiği adreslere gidebilir. Hesap havuza devredilince sahip imzası da geçersizleşir; krediyi ne ajan ne de hesabı kuran kişi dışarı çıkarabilir. Kaçamayan sermayeye teminat gerekmez.

**`reinkey-account` eki** (imza biçimi, constructor ve mevcut fonksiyon imzaları değişmedi):

| Fonksiyon | Yetki | İşi |
|---|---|---|
| `set_controller(controller_addr)` | sahip imzası, yalnızca bir kez | Hesabı bir kontrole (havuz) devreder |
| `get_controller() -> Option<Address>` | — | |
| `recall(asset, to, amount)` | controller | Fonu geri çeker |
| `freeze` / `unfreeze` / `set_policy` | controller varsa o, yoksa sahip | |

Devirden sonra `Sig::Owner` her bağlamda `#10 CONTROLLER_LOCKED` ile reddedilir. Yeni kodlar: `10 CONTROLLER_LOCKED`, `11 CONTROLLER_MISMATCH`.

**`credit-pool`** (`__constructor(config)`; `Config { admin, usdc, xlm, oracle?, pair?, liq_threshold_bps, profit_share_bps, max_price_age }`):

| Fonksiyon | Yetki | İşi |
|---|---|---|
| `deposit(from, amount) -> shares` / `withdraw(from, shares) -> amount` | `from` | Pay fiyatı = (USDC + açık borç + XLM × fiyat) / toplam pay |
| `balance(id)` / `transfer(from, to, amount)` | — / `from` | Paylar devredilebilir |
| `open_line(account, limit, beneficiary)` | yönetici | Controller'ı bu havuz olan hesaba `limit` USDC aktarır; borç = limit |
| `health(account) -> Health { value, debt, usdc, xlm, price, liquidatable }` | — | |
| `liquidate(account) -> recovered` | **herkes** | `value < debt × liq_threshold_bps` ise dondurur, USDC ve XLM'i havuza çeker |
| `close_line(caller, account) -> fee` | yönetici ya da lehdar | Borç + kârın `profit_share_bps` kadarı havuza, kalan kâr ve XLM lehdara |
| `price()`, `share_price()`, `total_assets()`, `total_debt()`, `total_shares()`, `get_line()`, `get_config()`, `set_price_sources()` | | |

Hata kodları: `40 INVALID_AMOUNT, 41 INSUFFICIENT_SHARES, 42 INSUFFICIENT_LIQUIDITY, 43 LINE_EXISTS, 44 LINE_NOT_FOUND, 45 NOT_CONTROLLER, 46 NOT_LIQUIDATABLE, 47 PRICE_UNAVAILABLE, 48 INSUFFICIENT_USDC, 49 NOT_AUTHORIZED`.
Olaylar: `("pool", "deposited"|"withdrawn", adres)`, `("pool", "line_opened"|"liquidated"|"line_closed", hesap)`. `liquidated` verisi: `(borç, geri alınan, zarar)`.

**Fiyat: ihtiyatlı değerleme.** Reflector oracle (`lastprice(Other("XLM"))`, 14 ondalık, USD≈USDC) ile Soroswap pair spot fiyatından **düşük olanı** kullanılır; bayat oracle (`max_price_age`) yok sayılır. DEX fiyatını şişirerek hesap sağlıklı gösterilemez. Pair fiyatını düşürmek ise haksız tasfiyeyi tetikleyebilir (zarar borçluya, borç verene değil); mainnet için TWAP gerekir.

**Tasarım notları**
- Tasfiye eşiği %90 (borcun): kredi teminatsız olduğu için açılışta değer = borç; %110 eşiği hattı anında tasfiye ettirirdi. Borç verenin azami zararı yaklaşık %10 + fiyat boşluğu.
- Açık kanallardaki harcanmamış depozito sağlık hesabına katılmaz (ihtiyatlı yön).
- İzinli alıcılar (`payees`) kaçış yoludur: yönetici hattı açmadan önce politikayı incelemelidir. Ajanın kendi adresi listede olmamalı.
- Faiz yok; havuzun getirisi kâr payıdır. Tasfiyede alınan XLM havuzda kalır ve pay fiyatına fiyatla yansır.

**Testnet:** `scripts/deploy-credit-testnet.sh` (havuz + ayrı kredi hesabı + yatırımcı), ardından `node scripts/credit-smoke.mjs` (devir → mevduat → hat → krediyle alım → kaçırma redleri → fiyat düşüşü → tasfiye → fiyatın geri getirilmesi). Kimlikler `deployments/testnet.json`: `creditPoolId`, `creditAccountId`, `oracleId`, `investorPublicKey`. Tasfiye edilmiş hesap yeniden kullanılamaz; yeni akış için deploy betiğini tekrar çalıştır.
