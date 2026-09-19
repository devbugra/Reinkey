extern crate std;

use super::*;
use channel::{ChannelContract, ChannelContractClient};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    auth::ContractContext,
    testutils::{Address as _, AuthorizedFunction, BytesN as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, IntoVal,
};

struct T {
    dex: Option<Dex>,
    env: Env,
    account: Address,
    client: ReinkeyAccountClient<'static>,
    usdc: TokenClient<'static>,
    channel: Address,
    seller: Address,
    owner_sk: SigningKey,
    agent_sk: SigningKey,
}

/// Gerçek Soroswap wasm'ları (testnet'ten `stellar contract fetch` ile alındı).
const SOROSWAP_ROUTER: &[u8] = include_bytes!("../testdata/soroswap_router.wasm");
const SOROSWAP_FACTORY: &[u8] = include_bytes!("../testdata/soroswap_factory.wasm");
const SOROSWAP_PAIR: &[u8] = include_bytes!("../testdata/soroswap_pair.wasm");

pub struct Dex {
    router: Address,
    factory: Address,
    xlm: TokenClient<'static>,
    pair: Address,
}

fn deadline(env: &Env) -> u64 {
    env.ledger().timestamp() + 3_600
}

/// Soroswap'ı kurar ve USDC/XLM havuzuna likidite ekler (mock auth ile).
fn setup_dex(env: &Env, usdc: &Address) -> Dex {
    env.mock_all_auths();
    let xlm_sac = env.register_stellar_asset_contract_v2(Address::generate(env));
    let xlm = TokenClient::new(env, &xlm_sac.address());
    let pair_hash = env.deployer().upload_contract_wasm(SOROSWAP_PAIR);
    let factory = env.register(SOROSWAP_FACTORY, ());
    let setter = Address::generate(env);
    let _: () = env.invoke_contract(&factory, &Symbol::new(env, "initialize"), (setter, pair_hash).into_val(env));
    let router = env.register(SOROSWAP_ROUTER, ());
    let _: () = env.invoke_contract(&router, &Symbol::new(env, "initialize"), (factory.clone(),).into_val(env));

    let lp = Address::generate(env);
    StellarAssetClient::new(env, usdc).mint(&lp, &10_000_000_000);
    StellarAssetClient::new(env, &xlm.address).mint(&lp, &50_000_000_000);
    let _: (i128, i128, i128) = env.invoke_contract(
        &router,
        &Symbol::new(env, "add_liquidity"),
        (usdc.clone(), xlm.address.clone(), 10_000_000_000i128, 50_000_000_000i128, 0i128, 0i128, lp, deadline(env))
            .into_val(env),
    );
    let pair: Address = env.invoke_contract(&factory, &Symbol::new(env, "get_pair"), (usdc.clone(), xlm.address.clone()).into_val(env));
    env.set_auths(&[]);
    Dex { router, factory, xlm, pair }
}

fn setup() -> T {
    setup_opts(false)
}

fn setup_opts(with_dex: bool) -> T {
    let env = Env::default();
    env.ledger().set_sequence_number(100_000);
    env.cost_estimate().budget().reset_unlimited();

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let usdc = TokenClient::new(&env, &sac.address());
    let channel = env.register(ChannelContract, ());
    let seller = Address::generate(&env);
    let dex = if with_dex { Some(setup_dex(&env, &sac.address())) } else { None };

    let owner_sk = SigningKey::from_bytes(&[0x0a; 32]);
    let agent_sk = SigningKey::from_bytes(&[0x0b; 32]);
    let policy = Policy {
        agent_key: BytesN::from_array(&env, agent_sk.verifying_key().as_bytes()),
        asset: sac.address(),
        per_tx_cap: 10_000_000,  // 1 USDC
        daily_cap: 50_000_000,   // 5 USDC
        payees: vec![&env, seller.clone()],
        channel: channel.clone(),
        expires_ledger: 200_000,
        dex_router: dex.as_ref().map(|d| d.router.clone()),
        dex_factory: dex.as_ref().map(|d| d.factory.clone()),
        pairs: match &dex {
            Some(d) => vec![&env, (sac.address(), d.xlm.address.clone()), (d.xlm.address.clone(), sac.address())],
            None => Vec::new(&env),
        },
    };
    let owner_pk = BytesN::from_array(&env, owner_sk.verifying_key().as_bytes());
    let account = env.register(ReinkeyAccount, (owner_pk, policy));
    let client = ReinkeyAccountClient::new(&env, &account);
    env.mock_all_auths();
    StellarAssetClient::new(&env, &sac.address()).mint(&account, &100_000_000);
    if let Some(d) = &dex {
        StellarAssetClient::new(&env, &d.xlm.address).mint(&account, &100_000_000);
    }
    env.set_auths(&[]);

    T { dex, env, account, client, usdc, channel, seller, owner_sk, agent_sk }
}

fn ctx(env: &Env, contract: &Address, f: &str, args: Vec<Val>) -> Context {
    Context::Contract(ContractContext {
        contract: contract.clone(),
        fn_name: Symbol::new(env, f),
        args,
    })
}

fn transfer_ctx(t: &T, to: &Address, amount: i128) -> Context {
    ctx(
        &t.env,
        &t.usdc.address,
        "transfer",
        (t.account.clone(), to.clone(), amount).into_val(&t.env),
    )
}

fn open_ctx(t: &T, payee: &Address, deposit: i128) -> Context {
    ctx(
        &t.env,
        &t.channel,
        "open",
        (
            t.account.clone(),
            payee.clone(),
            t.usdc.address.clone(),
            deposit,
            BytesN::<32>::random(&t.env),
            150_000u32,
        )
            .into_val(&t.env),
    )
}

/// `__check_auth`'u gerçek imzayla çağırır.
fn check(t: &T, owner: bool, contexts: std::vec::Vec<Context>) -> Result<(), Result<Error, soroban_sdk::InvokeError>> {
    let payload = BytesN::<32>::random(&t.env);
    let sk = if owner { &t.owner_sk } else { &t.agent_sk };
    let sig = BytesN::from_array(&t.env, &sk.sign(&payload.to_array()).to_bytes());
    let signature = if owner { Sig::Owner(sig) } else { Sig::Agent(sig) };
    let mut v = Vec::new(&t.env);
    for c in contexts {
        v.push_back(c);
    }
    t.env
        .try_invoke_contract_check_auth::<Error>(&t.account, &payload, signature.into_val(&t.env), &v)
}

fn spent(t: &T) -> i128 {
    t.client.get_spent().1
}

#[test]
fn channel_open_auth_tree_is_nested() {
    // Kanal açılışında hesabın auth ağacı: kök `open`, alt çağrı `transfer`.
    // __check_auth bu yüzden ikisini birlikte görür; depozito yalnızca
    // transfer bağlamında sayılmalı.
    let t = setup();
    t.env.mock_all_auths();
    let chan = ChannelContractClient::new(&t.env, &t.channel);
    let key = BytesN::<32>::random(&t.env);
    chan.open(&t.account, &t.seller, &t.usdc.address, &5_000_000, &key, &150_000);

    let auths = t.env.auths();
    let (addr, inv) = auths.iter().find(|(a, _)| *a == t.account).unwrap();
    assert_eq!(*addr, t.account);
    match &inv.function {
        AuthorizedFunction::Contract((c, f, _)) => {
            assert_eq!(*c, t.channel);
            assert_eq!(*f, Symbol::new(&t.env, "open"));
        }
        _ => panic!("beklenmeyen kök"),
    }
    assert_eq!(inv.sub_invocations.len(), 1);
    match &inv.sub_invocations[0].function {
        AuthorizedFunction::Contract((c, f, args)) => {
            assert_eq!(*c, t.usdc.address);
            assert_eq!(*f, Symbol::new(&t.env, "transfer"));
            let to: Address = args.get(1).unwrap().into_val(&t.env);
            assert_eq!(to, t.channel);
        }
        _ => panic!("beklenmeyen alt çağrı"),
    }
}

#[test]
fn agent_can_open_channel_within_policy_counted_once() {
    let t = setup();
    let r = check(&t, false, std::vec![open_ctx(&t, &t.seller, 5_000_000), transfer_ctx(&t, &t.channel, 5_000_000)]);
    assert_eq!(r, Ok(()));
    assert_eq!(spent(&t), 5_000_000); // çift sayım yok
}

#[test]
fn agent_can_pay_seller_directly() {
    let t = setup();
    assert_eq!(check(&t, false, std::vec![transfer_ctx(&t, &t.seller, 5_000)]), Ok(()));
    assert_eq!(spent(&t), 5_000);
}

#[test]
fn agent_cannot_pay_stranger() {
    let t = setup();
    let thief = Address::generate(&t.env);
    assert_eq!(
        check(&t, false, std::vec![transfer_ctx(&t, &thief, 1)]),
        Err(Ok(Error::PayeeNotAllowed))
    );
    // Kanal açılışında payee olarak da geçmez.
    assert_eq!(
        check(&t, false, std::vec![open_ctx(&t, &thief, 1_000), transfer_ctx(&t, &t.channel, 1_000)]),
        Err(Ok(Error::PayeeNotAllowed))
    );
    assert_eq!(spent(&t), 0);
}

#[test]
fn per_tx_cap() {
    let t = setup();
    assert_eq!(
        check(&t, false, std::vec![open_ctx(&t, &t.seller, 20_000_000), transfer_ctx(&t, &t.channel, 20_000_000)]),
        Err(Ok(Error::PerTxCapExceeded))
    );
    assert_eq!(check(&t, false, std::vec![transfer_ctx(&t, &t.seller, 10_000_000)]), Ok(()));
}

#[test]
fn daily_cap_accumulates_and_resets_next_day() {
    let t = setup();
    for _ in 0..5 {
        assert_eq!(check(&t, false, std::vec![transfer_ctx(&t, &t.seller, 10_000_000)]), Ok(()));
    }
    assert_eq!(spent(&t), 50_000_000);
    assert_eq!(
        check(&t, false, std::vec![transfer_ctx(&t, &t.seller, 1)]),
        Err(Ok(Error::DailyCapExceeded))
    );
    // Ertesi gün sayaç sıfırlanır.
    t.env.ledger().set_sequence_number(100_000 + LEDGERS_PER_DAY);
    assert_eq!(spent(&t), 0);
    assert_eq!(check(&t, false, std::vec![transfer_ctx(&t, &t.seller, 1)]), Ok(()));
}

#[test]
fn direct_transfer_to_channel_without_open_is_rejected() {
    let t = setup();
    assert_eq!(
        check(&t, false, std::vec![transfer_ctx(&t, &t.channel, 1_000)]),
        Err(Ok(Error::ContextNotAllowed))
    );
}

#[test]
fn agent_cannot_touch_admin_or_other_contracts() {
    let t = setup();
    let set_policy = ctx(&t.env, &t.account, "set_policy", Vec::new(&t.env));
    assert_eq!(check(&t, false, std::vec![set_policy.clone()]), Err(Ok(Error::ContextNotAllowed)));
    let other = ctx(&t.env, &Address::generate(&t.env), "swap", Vec::new(&t.env));
    assert_eq!(check(&t, false, std::vec![other]), Err(Ok(Error::ContextNotAllowed)));
    // Sahip her şeyi yapabilir.
    assert_eq!(check(&t, true, std::vec![set_policy]), Ok(()));
    let thief = Address::generate(&t.env);
    assert_eq!(check(&t, true, std::vec![transfer_ctx(&t, &thief, 99_000_000)]), Ok(()));
}

#[test]
fn frozen_and_expired() {
    let t = setup();
    t.env.mock_all_auths();
    t.client.freeze();
    assert!(t.client.is_frozen());
    t.env.set_auths(&[]);
    assert_eq!(
        check(&t, false, std::vec![transfer_ctx(&t, &t.seller, 1)]),
        Err(Ok(Error::AccountFrozen))
    );
    t.env.mock_all_auths();
    t.client.unfreeze();
    t.env.set_auths(&[]);
    t.env.ledger().set_sequence_number(200_001);
    assert_eq!(
        check(&t, false, std::vec![transfer_ctx(&t, &t.seller, 1)]),
        Err(Ok(Error::PolicyExpired))
    );
}

#[test]
fn wrong_key_signature_fails() {
    let t = setup();
    let payload = BytesN::<32>::random(&t.env);
    let impostor = SigningKey::from_bytes(&[0x0c; 32]);
    let sig = BytesN::from_array(&t.env, &impostor.sign(&payload.to_array()).to_bytes());
    let r = t.env.try_invoke_contract_check_auth::<Error>(
        &t.account,
        &payload,
        Sig::Agent(sig).into_val(&t.env),
        &vec![&t.env, transfer_ctx(&t, &t.seller, 1)],
    );
    assert!(r.is_err());
    assert_eq!(spent(&t), 0);
}

// ---------------------------------------------------------------------------
// Uçtan uca: gerçek imzalı auth kaydı; host __check_auth'u kendisi çağırır.
// (mock yok; kanal açılışının auth ağacı ve politika birlikte doğrulanır)
// ---------------------------------------------------------------------------
mod e2e {
    use super::*;
    use soroban_sdk::xdr::{
        HashIdPreimage, HashIdPreimageSorobanAuthorization, InvokeContractArgs, Limits,
        ScAddress, ScSymbol, ScVal, SorobanAddressCredentials, SorobanAuthorizationEntry,
        SorobanAuthorizedFunction, SorobanAuthorizedInvocation, SorobanCredentials, StringM,
        VecM, WriteXdr,
    };

    pub fn inv(env: &Env, contract: &Address, f: &str, args: Vec<Val>, subs: std::vec::Vec<SorobanAuthorizedInvocation>) -> SorobanAuthorizedInvocation {
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

    pub fn entry(t: &T, sk: &SigningKey, agent: bool, root: SorobanAuthorizedInvocation, nonce: i64) -> SorobanAuthorizationEntry {
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

    fn open_with_agent(t: &T, payee: &Address, deposit: i128, nonce: i64) -> Result<u64, ()> {
        let key = BytesN::<32>::from_array(&t.env, &[9; 32]);
        let open_args: Vec<Val> = (t.account.clone(), payee.clone(), t.usdc.address.clone(), deposit, key.clone(), 150_000u32).into_val(&t.env);
        let transfer_args: Vec<Val> = (t.account.clone(), t.channel.clone(), deposit).into_val(&t.env);
        let root = inv(&t.env, &t.channel, "open", open_args, std::vec![inv(&t.env, &t.usdc.address, "transfer", transfer_args, std::vec![])]);
        t.env.set_auths(&[entry(t, &t.agent_sk, true, root, nonce)]);
        let chan = ChannelContractClient::new(&t.env, &t.channel);
        match chan.try_open(&t.account, payee, &t.usdc.address, &deposit, &key, &150_000) {
            Ok(Ok(id)) => Ok(id),
            _ => Err(()),
        }
    }

    #[test]
    fn real_auth_open_channel_and_limits() {
        let t = setup();
        let id = open_with_agent(&t, &t.seller, 10_000_000, 1).expect("izinli açılış geçmeli");
        assert_eq!(id, 1);
        assert_eq!(t.usdc.balance(&t.channel), 10_000_000);
        assert_eq!(t.client.get_spent().1, 10_000_000);

        // Tek işlem tavanı üstü (1 USDC) → red.
        assert!(open_with_agent(&t, &t.seller, 10_000_001, 2).is_err());
        // İzinsiz payee → red.
        let thief = Address::generate(&t.env);
        assert!(open_with_agent(&t, &thief, 1_000, 3).is_err());
        // 4 açılış daha → tavan 5 USDC'ye ulaşır, 6.'sı red.
        for n in 4..8 {
            open_with_agent(&t, &t.seller, 10_000_000, n).expect("tavan içi");
        }
        assert_eq!(t.client.get_spent().1, 50_000_000);
        assert!(open_with_agent(&t, &t.seller, 1, 9).is_err());
        assert_eq!(t.usdc.balance(&t.account), 50_000_000);
    }

    #[test]
    fn real_auth_agent_cannot_withdraw_to_self() {
        let t = setup();
        let me = Address::generate(&t.env);
        let args: Vec<Val> = (t.account.clone(), me.clone(), 1_000i128).into_val(&t.env);
        let root = inv(&t.env, &t.usdc.address, "transfer", args, std::vec![]);
        t.env.set_auths(&[entry(&t, &t.agent_sk, true, root.clone(), 1)]);
        assert!(t.usdc.try_transfer(&t.account, &me, &1_000).is_err());
        // Sahip imzasıyla aynı transfer geçer.
        t.env.set_auths(&[entry(&t, &t.owner_sk, false, root, 2)]);
        t.usdc.transfer(&t.account, &me, &1_000);
        assert_eq!(t.usdc.balance(&me), 1_000);
    }
}

// ---------------------------------------------------------------------------
// DEX (Soroswap) kuralı. Router, factory ve pair testnet'teki gerçek wasm'lardır.
// ---------------------------------------------------------------------------
mod dex {
    use super::*;

    fn swap_args(env: &Env, amount_in: i128, min_out: i128, path: std::vec::Vec<Address>, to: &Address) -> Vec<Val> {
        let mut p = Vec::new(env);
        for a in path {
            p.push_back(a);
        }
        (amount_in, min_out, p, to.clone(), deadline(env)).into_val(env)
    }

    fn swap_ctx(t: &T, amount_in: i128, min_out: i128, path: std::vec::Vec<Address>, to: &Address) -> Context {
        let d = t.dex.as_ref().unwrap();
        ctx(&t.env, &d.router, "swap_exact_tokens_for_tokens", swap_args(&t.env, amount_in, min_out, path, to))
    }

    fn token_transfer_ctx(t: &T, token: &Address, to: &Address, amount: i128) -> Context {
        ctx(&t.env, token, "transfer", (t.account.clone(), to.clone(), amount).into_val(&t.env))
    }

    fn usdc_xlm(t: &T) -> std::vec::Vec<Address> {
        std::vec![t.usdc.address.clone(), t.dex.as_ref().unwrap().xlm.address.clone()]
    }

    #[test]
    fn swap_within_policy_counted_once() {
        let t = setup_opts(true);
        let d = t.dex.as_ref().unwrap();
        let r = check(&t, false, std::vec![
            swap_ctx(&t, 5_000_000, 1, usdc_xlm(&t), &t.account),
            token_transfer_ctx(&t, &t.usdc.address, &d.pair, 5_000_000),
        ]);
        assert_eq!(r, Ok(()));
        assert_eq!(spent(&t), 5_000_000); // swap'ta sayıldı, transferde tekrar sayılmadı
    }

    #[test]
    fn selling_xlm_is_allowed_and_not_counted_in_usdc_cap() {
        let t = setup_opts(true);
        let d = t.dex.as_ref().unwrap();
        let path = std::vec![d.xlm.address.clone(), t.usdc.address.clone()];
        let r = check(&t, false, std::vec![
            swap_ctx(&t, 30_000_000, 1, path, &t.account),
            token_transfer_ctx(&t, &d.xlm.address, &d.pair, 30_000_000),
        ]);
        assert_eq!(r, Ok(()));
        assert_eq!(spent(&t), 0);
    }

    #[test]
    fn swap_rule_codes() {
        let t = setup_opts(true);
        let d = t.dex.as_ref().unwrap();
        let other = Address::generate(&t.env);
        // Çıktı başka adrese gidemez.
        assert_eq!(check(&t, false, std::vec![swap_ctx(&t, 1_000, 1, usdc_xlm(&t), &other)]), Err(Ok(Error::PayeeNotAllowed)));
        // Tek işlem tavanı (1 USDC).
        assert_eq!(check(&t, false, std::vec![swap_ctx(&t, 20_000_000, 1, usdc_xlm(&t), &t.account)]), Err(Ok(Error::PerTxCapExceeded)));
        // Kayma koruması zorunlu.
        assert_eq!(check(&t, false, std::vec![swap_ctx(&t, 1_000, 0, usdc_xlm(&t), &t.account)]), Err(Ok(Error::SlippageUnbounded)));
        // İzinsiz çift.
        let junk = t.env.register_stellar_asset_contract_v2(Address::generate(&t.env)).address();
        assert_eq!(check(&t, false, std::vec![swap_ctx(&t, 1_000, 1, std::vec![t.usdc.address.clone(), junk.clone()], &t.account)]), Err(Ok(Error::PairNotAllowed)));
        // Çok adımlı yol.
        assert_eq!(
            check(&t, false, std::vec![swap_ctx(&t, 1_000, 1, std::vec![t.usdc.address.clone(), d.xlm.address.clone(), t.usdc.address.clone()], &t.account)]),
            Err(Ok(Error::PairNotAllowed))
        );
        // Router'ın diğer swap fonksiyonu izinli değil.
        let exact_out = ctx(&t.env, &d.router, "swap_tokens_for_exact_tokens", swap_args(&t.env, 1_000, 2_000, usdc_xlm(&t), &t.account));
        assert_eq!(check(&t, false, std::vec![exact_out]), Err(Ok(Error::ContextNotAllowed)));
        assert_eq!(spent(&t), 0);
    }

    #[test]
    fn swap_does_not_open_a_door_for_other_transfers() {
        let t = setup_opts(true);
        let d = t.dex.as_ref().unwrap();
        let thief = Address::generate(&t.env);
        // Swap'ın yanına eklenen, pair'e gitmeyen transfer: ayrıca denetlenir ve reddedilir.
        assert_eq!(
            check(&t, false, std::vec![
                swap_ctx(&t, 5_000_000, 1, usdc_xlm(&t), &t.account),
                token_transfer_ctx(&t, &t.usdc.address, &thief, 5_000_000),
            ]),
            Err(Ok(Error::PayeeNotAllowed))
        );
        // Swap olmadan pair'e doğrudan transfer.
        assert_eq!(check(&t, false, std::vec![token_transfer_ctx(&t, &t.usdc.address, &d.pair, 1_000)]), Err(Ok(Error::PayeeNotAllowed)));
        // Swap tutarından farklı tutarda pair transferi eşleşmez.
        assert_eq!(
            check(&t, false, std::vec![
                swap_ctx(&t, 1_000, 1, usdc_xlm(&t), &t.account),
                token_transfer_ctx(&t, &t.usdc.address, &d.pair, 9_000_000),
            ]),
            Err(Ok(Error::PayeeNotAllowed))
        );
        // Bir swap tek bir transferi örter; ikinci eşleşen transfer ayrıca denetlenir.
        assert_eq!(
            check(&t, false, std::vec![
                swap_ctx(&t, 1_000, 1, usdc_xlm(&t), &t.account),
                token_transfer_ctx(&t, &t.usdc.address, &d.pair, 1_000),
                token_transfer_ctx(&t, &t.usdc.address, &d.pair, 1_000),
            ]),
            Err(Ok(Error::PayeeNotAllowed))
        );
        // XLM'yi swap olmadan başka yere göndermek (politika varlığı değil).
        assert_eq!(check(&t, false, std::vec![token_transfer_ctx(&t, &d.xlm.address, &thief, 1)]), Err(Ok(Error::ContextNotAllowed)));
        assert_eq!(spent(&t), 0);
    }

    #[test]
    fn dex_disabled_policy_rejects_swaps() {
        let t = setup_opts(true);
        let d = t.dex.as_ref().unwrap();
        // DEX'siz politikaya geç (sahip imzası ile).
        let mut p = t.client.get_policy();
        p.dex_router = None;
        p.dex_factory = None;
        p.pairs = Vec::new(&t.env);
        t.env.mock_all_auths();
        t.client.set_policy(&p);
        t.env.set_auths(&[]);
        assert_eq!(
            check(&t, false, std::vec![
                swap_ctx(&t, 1_000, 1, usdc_xlm(&t), &t.account),
                token_transfer_ctx(&t, &t.usdc.address, &d.pair, 1_000),
            ]),
            Err(Ok(Error::ContextNotAllowed))
        );
    }

    // --- Uçtan uca: gerçek Soroswap router + ajan imzalı auth kaydı ---
    use super::e2e::{entry, inv};

    fn swap_with_agent(t: &T, amount_in: i128, min_out: i128, path: std::vec::Vec<Address>, nonce: i64) -> Result<std::vec::Vec<i128>, ()> {
        let d = t.dex.as_ref().unwrap();
        let args = swap_args(&t.env, amount_in, min_out, path.clone(), &t.account);
        let transfer_args: Vec<Val> = (t.account.clone(), d.pair.clone(), amount_in).into_val(&t.env);
        let root = inv(&t.env, &d.router, "swap_exact_tokens_for_tokens", args.clone(),
            std::vec![inv(&t.env, &path[0], "transfer", transfer_args, std::vec![])]);
        t.env.set_auths(&[entry(t, &t.agent_sk, true, root, nonce)]);
        let r = t.env.try_invoke_contract::<Vec<i128>, soroban_sdk::Error>(&d.router, &Symbol::new(&t.env, "swap_exact_tokens_for_tokens"), args);
        match r {
            Ok(Ok(v)) => Ok(v.iter().collect()),
            _ => Err(()),
        }
    }

    #[test]
    fn real_router_agent_swap_and_limits() {
        let t = setup_opts(true);
        let d = t.dex.as_ref().unwrap();
        let usdc0 = t.usdc.balance(&t.account);
        let xlm0 = d.xlm.balance(&t.account);

        let amounts = swap_with_agent(&t, 5_000_000, 1, usdc_xlm(&t), 1).expect("tavan içi swap geçmeli");
        assert_eq!(amounts[0], 5_000_000);
        assert!(amounts[1] > 0);
        assert_eq!(t.usdc.balance(&t.account), usdc0 - 5_000_000);
        assert_eq!(d.xlm.balance(&t.account), xlm0 + amounts[1]);
        assert_eq!(spent(&t), 5_000_000);

        // Tek işlem tavanı üstü → red, bakiye değişmez.
        assert!(swap_with_agent(&t, 20_000_000, 1, usdc_xlm(&t), 2).is_err());
        // Kayma korumasız → red.
        assert!(swap_with_agent(&t, 1_000_000, 0, usdc_xlm(&t), 3).is_err());
        assert_eq!(t.usdc.balance(&t.account), usdc0 - 5_000_000);

        // Ters yön (XLM → USDC) izinli ve USDC tavanına sayılmaz.
        let back = std::vec![d.xlm.address.clone(), t.usdc.address.clone()];
        swap_with_agent(&t, 10_000_000, 1, back, 4).expect("XLM satışı geçmeli");
        assert_eq!(spent(&t), 5_000_000);

        // Günlük tavan (5 USDC) swap'larla da dolar: 0,5 + 4 × 1 = 4,5 USDC;
        // beşinci 1 USDC'lik swap tavanı aşar ve reddedilir.
        let mut ok = 0;
        for n in 5..10 {
            if swap_with_agent(&t, 10_000_000, 1, usdc_xlm(&t), n).is_ok() {
                ok += 1;
            }
        }
        assert_eq!(ok, 4);
        assert_eq!(spent(&t), 45_000_000);
        // Tavanı tam dolduran 0,5 USDC geçer, bir birim fazlası geçmez.
        swap_with_agent(&t, 5_000_000, 1, usdc_xlm(&t), 10).expect("tavanı tam dolduran swap geçmeli");
        assert_eq!(spent(&t), 50_000_000);
        assert!(swap_with_agent(&t, 1_000, 1, usdc_xlm(&t), 11).is_err());
    }
}
