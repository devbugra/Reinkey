extern crate std;

use super::*;
use channel::ChannelContract;
use ed25519_dalek::{Signer, SigningKey};
use reinkey_account::{Policy, ReinkeyAccount, ReinkeyAccountClient, Sig};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::{
        HashIdPreimage, HashIdPreimageSorobanAuthorization, InvokeContractArgs, Limits, ScAddress,
        ScSymbol, ScVal, SorobanAddressCredentials, SorobanAuthorizationEntry,
        SorobanAuthorizedFunction, SorobanAuthorizedInvocation, SorobanCredentials, StringM, VecM,
        WriteXdr,
    },
    Address, Bytes, BytesN, Env, IntoVal, TryFromVal,
};

/// Gerçek Soroswap wasm'ları (testnet'ten alındı; reinkey-account/testdata).
const SOROSWAP_ROUTER: &[u8] = include_bytes!("../../reinkey-account/testdata/soroswap_router.wasm");
const SOROSWAP_FACTORY: &[u8] = include_bytes!("../../reinkey-account/testdata/soroswap_factory.wasm");
const SOROSWAP_PAIR: &[u8] = include_bytes!("../../reinkey-account/testdata/soroswap_pair.wasm");

const USDC1: i128 = 10_000_000;

/// Test oracle'ı (Reflector arayüzünün taklidi; yalnızca fiyat kaynağı seçimi testinde).
#[contract]
pub struct StubOracle;

#[contractimpl]
impl StubOracle {
    pub fn set(env: Env, price: i128, timestamp: u64) {
        env.storage().instance().set(&0u32, &PriceData { price, timestamp });
    }
    pub fn lastprice(env: Env, _asset: Asset) -> Option<PriceData> {
        env.storage().instance().get(&0u32)
    }
    pub fn decimals(_env: Env) -> u32 {
        14
    }
}

struct T {
    env: Env,
    usdc: TokenClient<'static>,
    xlm: TokenClient<'static>,
    router: Address,
    pair: Address,
    pool: Address,
    client: CreditPoolClient<'static>,
    account: Address,
    acct: ReinkeyAccountClient<'static>,
    admin: Address,
    investor: Address,
    beneficiary: Address,
    lp: Address,
    owner_sk: SigningKey,
    agent_sk: SigningKey,
}

fn deadline(env: &Env) -> u64 {
    env.ledger().timestamp() + 3_600
}

fn setup() -> T {
    let env = Env::default();
    env.ledger().set_sequence_number(100_000);
    env.ledger().set_timestamp(1_800_000_000);
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths();

    let usdc_sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let xlm_sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let usdc = TokenClient::new(&env, &usdc_sac.address());
    let xlm = TokenClient::new(&env, &xlm_sac.address());

    // Soroswap: 500 USDC / 4000 XLM (testnet havuzumuzla aynı oran: 0,125 USDC/XLM).
    let pair_hash = env.deployer().upload_contract_wasm(SOROSWAP_PAIR);
    let factory = env.register(SOROSWAP_FACTORY, ());
    let _: () = env.invoke_contract(&factory, &Symbol::new(&env, "initialize"), (Address::generate(&env), pair_hash).into_val(&env));
    let router = env.register(SOROSWAP_ROUTER, ());
    let _: () = env.invoke_contract(&router, &Symbol::new(&env, "initialize"), (factory.clone(),).into_val(&env));
    let lp = Address::generate(&env);
    StellarAssetClient::new(&env, &usdc.address).mint(&lp, &(100_000 * USDC1));
    StellarAssetClient::new(&env, &xlm.address).mint(&lp, &(100_000 * USDC1));
    let _: (i128, i128, i128) = env.invoke_contract(
        &router,
        &Symbol::new(&env, "add_liquidity"),
        (usdc.address.clone(), xlm.address.clone(), 500 * USDC1, 4_000 * USDC1, 0i128, 0i128, lp.clone(), deadline(&env)).into_val(&env),
    );
    let pair: Address = env.invoke_contract(&factory, &Symbol::new(&env, "get_pair"), (usdc.address.clone(), xlm.address.clone()).into_val(&env));

    // Havuz.
    let admin = Address::generate(&env);
    let pool = env.register(
        CreditPool,
        (Config {
            admin: admin.clone(),
            usdc: usdc.address.clone(),
            xlm: xlm.address.clone(),
            oracle: None,
            pair: Some(pair.clone()),
            liq_threshold_bps: 9_000,
            profit_share_bps: 2_000,
            max_price_age: 3_600,
        },),
    );
    let client = CreditPoolClient::new(&env, &pool);

    // Kredi hesabı: günde 20 USDC, işlem başına 5 USDC, payees = satıcı + havuz.
    let owner_sk = SigningKey::from_bytes(&[0x0a; 32]);
    let agent_sk = SigningKey::from_bytes(&[0x0b; 32]);
    let seller = Address::generate(&env);
    let channel = env.register(ChannelContract, ());
    let policy = Policy {
        agent_key: BytesN::from_array(&env, agent_sk.verifying_key().as_bytes()),
        asset: usdc.address.clone(),
        per_tx_cap: 5 * USDC1,
        daily_cap: 20 * USDC1,
        payees: vec![&env, seller, pool.clone()],
        channel,
        expires_ledger: 200_000,
        dex_router: Some(router.clone()),
        dex_factory: Some(factory),
        pairs: vec![&env, (usdc.address.clone(), xlm.address.clone()), (xlm.address.clone(), usdc.address.clone())],
    };
    let owner_pk = BytesN::from_array(&env, owner_sk.verifying_key().as_bytes());
    let account = env.register(ReinkeyAccount, (owner_pk, policy));
    let acct = ReinkeyAccountClient::new(&env, &account);

    let investor = Address::generate(&env);
    StellarAssetClient::new(&env, &usdc.address).mint(&investor, &(1_000 * USDC1));
    let beneficiary = Address::generate(&env);

    env.set_auths(&[]);
    T { env, usdc, xlm, router, pair, pool, client, account, acct, admin, investor, beneficiary, lp, owner_sk, agent_sk }
}

// --- gerçek imzalı auth kaydı (host __check_auth'u kendisi çağırır) ---

fn inv(env: &Env, contract: &Address, f: &str, args: Vec<Val>, subs: std::vec::Vec<SorobanAuthorizedInvocation>) -> SorobanAuthorizedInvocation {
    let args: std::vec::Vec<ScVal> = args.iter().map(|v| ScVal::try_from_val(env, &v).unwrap()).collect();
    SorobanAuthorizedInvocation {
        function: SorobanAuthorizedFunction::ContractFn(InvokeContractArgs {
            contract_address: ScAddress::from(contract),
            function_name: ScSymbol(StringM::try_from(f).unwrap()),
            args: VecM::try_from(args).unwrap(),
        }),
        sub_invocations: VecM::try_from(subs).unwrap(),
    }
}

fn entry(t: &T, sk: &SigningKey, agent: bool, root: SorobanAuthorizedInvocation, nonce: i64) -> SorobanAuthorizationEntry {
    let exp = t.env.ledger().sequence() + 100;
    let preimage = HashIdPreimage::SorobanAuthorization(HashIdPreimageSorobanAuthorization {
        network_id: t.env.ledger().network_id().to_array().into(),
        nonce,
        signature_expiration_ledger: exp,
        invocation: root.clone(),
    });
    let bytes = preimage.to_xdr(Limits::none()).unwrap();
    let payload = t.env.crypto().sha256(&Bytes::from_slice(&t.env, &bytes)).to_bytes();
    let sig = BytesN::from_array(&t.env, &sk.sign(&payload.to_array()).to_bytes());
    let s = if agent { Sig::Agent(sig) } else { Sig::Owner(sig) };
    let sval: Val = s.into_val(&t.env);
    SorobanAuthorizationEntry {
        credentials: SorobanCredentials::Address(SorobanAddressCredentials {
            address: ScAddress::from(&t.account),
            nonce,
            signature_expiration_ledger: exp,
            signature: ScVal::try_from_val(&t.env, &sval).unwrap(),
        }),
        root_invocation: root,
    }
}

/// Sahip imzasıyla hesabı havuza devreder (gerçek auth).
fn hand_over(t: &T) {
    let args: Vec<Val> = (t.pool.clone(),).into_val(&t.env);
    let root = inv(&t.env, &t.account, "set_controller", args, std::vec![]);
    t.env.set_auths(&[entry(t, &t.owner_sk, false, root, 9_001)]);
    t.acct.set_controller(&t.pool);
    t.env.set_auths(&[]);
}

fn fund_pool_and_open(t: &T, deposit: i128, limit: i128) {
    hand_over(t);
    t.env.mock_all_auths();
    t.client.deposit(&t.investor, &deposit);
    t.client.open_line(&t.account, &limit, &t.beneficiary);
    t.env.set_auths(&[]);
}

fn agent_swap(t: &T, sell: &Address, buy: &Address, amount_in: i128, nonce: i64) -> Result<i128, ()> {
    let mut path = Vec::new(&t.env);
    path.push_back(sell.clone());
    path.push_back(buy.clone());
    let args: Vec<Val> = (amount_in, 1i128, path, t.account.clone(), deadline(&t.env)).into_val(&t.env);
    let targs: Vec<Val> = (t.account.clone(), t.pair.clone(), amount_in).into_val(&t.env);
    let root = inv(&t.env, &t.router, "swap_exact_tokens_for_tokens", args.clone(), std::vec![inv(&t.env, sell, "transfer", targs, std::vec![])]);
    t.env.set_auths(&[entry(t, &t.agent_sk, true, root, nonce)]);
    let r = t.env.try_invoke_contract::<Vec<i128>, soroban_sdk::Error>(&t.router, &Symbol::new(&t.env, "swap_exact_tokens_for_tokens"), args);
    t.env.set_auths(&[]);
    match r {
        Ok(Ok(v)) => Ok(v.get(1).unwrap()),
        _ => Err(()),
    }
}

/// LP büyük bir XLM satışıyla havuz fiyatını düşürür.
fn crash_price(t: &T, xlm_in: i128) {
    t.env.mock_all_auths();
    let mut path = Vec::new(&t.env);
    path.push_back(t.xlm.address.clone());
    path.push_back(t.usdc.address.clone());
    let _: Vec<i128> = t.env.invoke_contract(
        &t.router,
        &Symbol::new(&t.env, "swap_exact_tokens_for_tokens"),
        (xlm_in, 1i128, path, t.lp.clone(), deadline(&t.env)).into_val(&t.env),
    );
    t.env.set_auths(&[]);
}

#[test]
fn deposit_withdraw_and_share_price() {
    let t = setup();
    t.env.mock_all_auths();
    assert_eq!(t.client.share_price(), SCALE);
    assert_eq!(t.client.deposit(&t.investor, &(100 * USDC1)), 100 * USDC1);
    assert_eq!(t.client.total_assets(), 100 * USDC1);
    assert_eq!(t.client.share_price(), SCALE);

    // Pay devri ve kısmi çekim.
    let other = Address::generate(&t.env);
    t.client.transfer(&t.investor, &other, &(40 * USDC1));
    assert_eq!(t.client.balance(&other), 40 * USDC1);
    assert_eq!(t.client.withdraw(&other, &(40 * USDC1)), 40 * USDC1);
    assert_eq!(t.usdc.balance(&other), 40 * USDC1);
    assert_eq!(t.client.try_withdraw(&other, &1), Err(Ok(Error::InsufficientShares)));
    assert_eq!(t.client.try_deposit(&t.investor, &0), Err(Ok(Error::InvalidAmount)));
}

#[test]
fn open_line_requires_controller_and_moves_funds() {
    let t = setup();
    t.env.mock_all_auths();
    t.client.deposit(&t.investor, &(100 * USDC1));
    // Hesap henüz devredilmedi → red.
    assert_eq!(t.client.try_open_line(&t.account, &(20 * USDC1), &t.beneficiary), Err(Ok(Error::NotController)));
    t.env.set_auths(&[]);

    hand_over(&t);
    t.env.mock_all_auths();
    assert_eq!(t.client.try_open_line(&t.account, &(200 * USDC1), &t.beneficiary), Err(Ok(Error::InsufficientLiquidity)));
    t.client.open_line(&t.account, &(20 * USDC1), &t.beneficiary);
    assert_eq!(t.client.try_open_line(&t.account, &USDC1, &t.beneficiary), Err(Ok(Error::LineExists)));
    assert_eq!(t.usdc.balance(&t.account), 20 * USDC1);
    assert_eq!(t.usdc.balance(&t.pool), 80 * USDC1);
    assert_eq!(t.client.total_debt(), 20 * USDC1);
    // Kredi verilince pay fiyatı değişmez: borç varlık sayılır.
    assert_eq!(t.client.share_price(), SCALE);
    let h = t.client.health(&t.account);
    assert_eq!((h.value, h.debt, h.liquidatable), (20 * USDC1, 20 * USDC1, false));
}

#[test]
fn agent_trades_on_credit_but_cannot_escape() {
    let t = setup();
    fund_pool_and_open(&t, 100 * USDC1, 20 * USDC1);

    // Krediyle gerçek Soroswap'ta alım (ajan imzası).
    let got = agent_swap(&t, &t.usdc.address, &t.xlm.address, 5 * USDC1, 1).expect("tavan içi alım geçmeli");
    assert!(got > 0);
    assert_eq!(t.usdc.balance(&t.account), 15 * USDC1);
    assert_eq!(t.xlm.balance(&t.account), got);
    // Tek işlem tavanı (5 USDC) üstü → red.
    assert!(agent_swap(&t, &t.usdc.address, &t.xlm.address, 6 * USDC1, 2).is_err());

    // Ajan krediyi kendi adresine kaçırmayı dener → PAYEE_NOT_ALLOWED.
    let thief = Address::generate(&t.env);
    let args: Vec<Val> = (t.account.clone(), thief.clone(), USDC1).into_val(&t.env);
    let root = inv(&t.env, &t.usdc.address, "transfer", args, std::vec![]);
    t.env.set_auths(&[entry(&t, &t.agent_sk, true, root.clone(), 3)]);
    assert!(t.usdc.try_transfer(&t.account, &thief, &USDC1).is_err());
    // Hesabı kuran SAHİP de kaçıramaz: devirden sonra sahip imzası geçersiz.
    t.env.set_auths(&[entry(&t, &t.owner_sk, false, root, 4)]);
    assert!(t.usdc.try_transfer(&t.account, &thief, &USDC1).is_err());
    t.env.set_auths(&[]);
    assert_eq!(t.usdc.balance(&thief), 0);

    // __check_auth düzeyinde kodlar.
    let ctx = soroban_sdk::auth::Context::Contract(soroban_sdk::auth::ContractContext {
        contract: t.usdc.address.clone(),
        fn_name: Symbol::new(&t.env, "transfer"),
        args: (t.account.clone(), thief.clone(), USDC1).into_val(&t.env),
    });
    let payload = BytesN::from_array(&t.env, &[7u8; 32]);
    let agent_sig = BytesN::from_array(&t.env, &t.agent_sk.sign(&payload.to_array()).to_bytes());
    let owner_sig = BytesN::from_array(&t.env, &t.owner_sk.sign(&payload.to_array()).to_bytes());
    let r = t.env.try_invoke_contract_check_auth::<reinkey_account::Error>(&t.account, &payload, Sig::Agent(agent_sig).into_val(&t.env), &vec![&t.env, ctx.clone()]);
    assert_eq!(r, Err(Ok(reinkey_account::Error::PayeeNotAllowed)));
    let r = t.env.try_invoke_contract_check_auth::<reinkey_account::Error>(&t.account, &payload, Sig::Owner(owner_sig).into_val(&t.env), &vec![&t.env, ctx]);
    assert_eq!(r, Err(Ok(reinkey_account::Error::ControllerLocked)));

    // Havuza geri ödeme izinli (havuz payees listesinde).
    let args: Vec<Val> = (t.account.clone(), t.pool.clone(), USDC1).into_val(&t.env);
    let root = inv(&t.env, &t.usdc.address, "transfer", args, std::vec![]);
    t.env.set_auths(&[entry(&t, &t.agent_sk, true, root, 5)]);
    t.usdc.transfer(&t.account, &t.pool, &USDC1);
}

#[test]
fn healthy_account_cannot_be_liquidated() {
    let t = setup();
    fund_pool_and_open(&t, 100 * USDC1, 20 * USDC1);
    agent_swap(&t, &t.usdc.address, &t.xlm.address, 5 * USDC1, 1).unwrap();
    let h = t.client.health(&t.account);
    assert!(!h.liquidatable);
    // Spot değerleme: ajanın kendi alımı fiyatı ~%2 yukarı iter, bu yüzden değer borcun
    // bir miktar üstünde görünür (ücret düşülmüş hâlde). Oracle tanımlıysa min() bunu sınırlar.
    assert!(h.value > 199 * USDC1 / 10 && h.value < 201 * USDC1 / 10, "değer {}", h.value);
    assert_eq!(t.client.try_liquidate(&t.account), Err(Ok(Error::NotLiquidatable)));
    assert!(!t.acct.is_frozen());
}

#[test]
fn liquidation_after_price_drop_returns_funds_and_hits_share_price() {
    let t = setup();
    fund_pool_and_open(&t, 100 * USDC1, 20 * USDC1);
    // Ajan kredinin 15 USDC'sini XLM'e çevirir (3 × 5 USDC).
    for n in 1..=3 {
        agent_swap(&t, &t.usdc.address, &t.xlm.address, 5 * USDC1, n).unwrap();
    }
    assert_eq!(t.usdc.balance(&t.account), 5 * USDC1);
    assert!(!t.client.health(&t.account).liquidatable);

    // Fiyat çöker.
    crash_price(&t, 1_500 * USDC1);
    let h = t.client.health(&t.account);
    assert!(h.liquidatable, "değer {} borç {}", h.value, h.debt);
    assert!(h.value * 10 < h.debt * 9);

    // Herkes tasfiye edebilir (auth gerekmez).
    let xlm_held = t.xlm.balance(&t.account);
    let recovered = t.client.liquidate(&t.account);
    assert_eq!(recovered, h.value);
    assert!(t.acct.is_frozen());
    assert_eq!(t.usdc.balance(&t.account), 0);
    assert_eq!(t.xlm.balance(&t.account), 0);
    assert_eq!(t.usdc.balance(&t.pool), 85 * USDC1);
    assert_eq!(t.xlm.balance(&t.pool), xlm_held);
    assert_eq!(t.client.total_debt(), 0);
    assert!(!t.client.get_line(&t.account).unwrap().open);

    // Zarar pay fiyatına yansır: 100 → 80 + geri alınan.
    assert_eq!(t.client.total_assets(), 80 * USDC1 + recovered);
    let sp = t.client.share_price();
    assert!(sp < SCALE && sp > SCALE * 85 / 100, "pay fiyatı {}", sp);

    // Dondurulmuş hesapta ajan artık işlem yapamaz; ikinci tasfiye de olmaz.
    assert!(agent_swap(&t, &t.usdc.address, &t.xlm.address, USDC1, 9).is_err());
    assert_eq!(t.client.try_liquidate(&t.account), Err(Ok(Error::LineNotFound)));
}

#[test]
fn recall_and_freeze_only_by_controller() {
    let t = setup();
    fund_pool_and_open(&t, 100 * USDC1, 20 * USDC1);
    let thief = Address::generate(&t.env);

    // Yetkisiz çağrı (auth yok) → red.
    assert!(t.acct.try_recall(&t.usdc.address, &thief, &USDC1).is_err());
    assert!(t.acct.try_freeze().is_err());

    // Ajan imzasıyla recall bağlamı → red (controller havuz; hesabın kendi auth'u hiç sorulmaz).
    let args: Vec<Val> = (t.usdc.address.clone(), thief.clone(), USDC1).into_val(&t.env);
    let root = inv(&t.env, &t.account, "recall", args, std::vec![]);
    t.env.set_auths(&[entry(&t, &t.agent_sk, true, root.clone(), 1)]);
    assert!(t.acct.try_recall(&t.usdc.address, &thief, &USDC1).is_err());
    t.env.set_auths(&[entry(&t, &t.owner_sk, false, root, 2)]);
    assert!(t.acct.try_recall(&t.usdc.address, &thief, &USDC1).is_err());
    t.env.set_auths(&[]);
    assert_eq!(t.usdc.balance(&thief), 0);

    // Controller ikinci kez atanamaz.
    t.env.mock_all_auths();
    assert_eq!(t.acct.try_set_controller(&thief), Err(Ok(reinkey_account::Error::ControllerMismatch)));
}

#[test]
fn close_line_splits_profit() {
    let t = setup();
    fund_pool_and_open(&t, 100 * USDC1, 20 * USDC1);
    // Ajan 10 USDC kâr etmiş olsun.
    t.env.mock_all_auths();
    StellarAssetClient::new(&t.env, &t.usdc.address).mint(&t.account, &(10 * USDC1));
    let stranger = Address::generate(&t.env);
    assert_eq!(t.client.try_close_line(&stranger, &t.account), Err(Ok(Error::NotAuthorized)));
    let fee = t.client.close_line(&t.beneficiary, &t.account);
    assert_eq!(fee, 2 * USDC1); // kârın %20'si
    assert_eq!(t.usdc.balance(&t.beneficiary), 8 * USDC1);
    assert_eq!(t.usdc.balance(&t.pool), 102 * USDC1);
    assert_eq!(t.client.total_debt(), 0);
    assert_eq!(t.client.share_price(), SCALE * 102 / 100);
    assert!(t.acct.is_frozen());
}

#[test]
fn close_line_needs_usdc_to_cover_debt() {
    let t = setup();
    fund_pool_and_open(&t, 100 * USDC1, 20 * USDC1);
    agent_swap(&t, &t.usdc.address, &t.xlm.address, 5 * USDC1, 1).unwrap();
    t.env.mock_all_auths();
    assert_eq!(t.client.try_close_line(&t.admin, &t.account), Err(Ok(Error::InsufficientUsdc)));
}

#[test]
fn conservative_price_is_min_of_oracle_and_pair() {
    let t = setup();
    let oracle = t.env.register(StubOracle, ());
    let o = StubOracleClient::new(&t.env, &oracle);
    t.env.mock_all_auths();
    let pair_price = t.client.price();
    assert_eq!(pair_price, 1_250_000); // 500 / 4000 = 0,125

    t.client.set_price_sources(&Some(oracle.clone()), &Some(t.pair.clone()));
    // Oracle daha düşük (0,10 USD, 14 ondalık) → oracle kullanılır.
    o.set(&10_000_000_000_000, &t.env.ledger().timestamp());
    assert_eq!(t.client.price(), 1_000_000);
    // Oracle daha yüksek (0,20) → DEX spot kullanılır: şişirilmiş fiyatla sağlık gösterilemez.
    o.set(&20_000_000_000_000, &t.env.ledger().timestamp());
    assert_eq!(t.client.price(), pair_price);
    // Bayat oracle yok sayılır.
    o.set(&1_000_000_000_000, &(t.env.ledger().timestamp() - 7_200));
    assert_eq!(t.client.price(), pair_price);
    // Yalnızca oracle, o da bayat → fiyat yok.
    t.client.set_price_sources(&Some(oracle), &None);
    assert_eq!(t.client.try_price(), Err(Ok(Error::PriceUnavailable)));
}
