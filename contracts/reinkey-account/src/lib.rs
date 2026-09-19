//! Reinkey Account: ajanın akıllı hesabı. Fonu tutar, politikayı `__check_auth`
//! içinde uygular.
//!
//! İki imzacı vardır:
//! - Sahip (`Sig::Owner`): her şeye yetkilidir; politikayı değiştirir, hesabı
//!   dondurur, fonu çeker.
//! - Ajan (`Sig::Agent`): yalnızca politika içinde harcar. İzinli bağlamlar:
//!   * `asset.transfer(self, to, amount)`: `to` izinli alıcı ya da güvenilen
//!     kanal kontratı; tek transfer ve günlük tavan kontrol edilir.
//!   * `channel.open(self, payee, asset, …)`: `payee` izinli, varlık politika
//!     varlığı. Depozito tutarı, aynı auth ağacındaki iç içe `transfer`
//!     bağlamında sayılır; `open` ayrıca sayılmaz (çift sayım yok).
//!   * `channel.top_up(…)`: tutar yine iç içe `transfer` bağlamında sayılır.
//!   * `dex_router.swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline)`
//!     (Soroswap): `to` hesabın kendisi, çift izinli, tek adım, `amount_out_min > 0`.
//!     Satılan varlık politika varlığıysa (USDC) tutar tek işlem ve günlük tavana
//!     sayılır. Router'ın altında gelen `token.transfer(self, pair, amount_in)`
//!     bağlamı, alıcısı factory'nin `get_pair` ile döndürdüğü pair ise o swap'ın
//!     parçası olarak kabul edilir ve ayrıca sayılmaz.
//!   Diğer her şey `ContextNotAllowed`.
//!
//! Kredi hesabı (controller): sahip `set_controller` ile hesabı BİR KEZ bir
//! kontrole (kredi havuzu kontratı) devredebilir. Devirden sonra sahip imzası
//! geçersizdir (`ControllerLocked`); `freeze`/`unfreeze`/`set_policy` ve
//! `recall` yalnızca controller tarafından çağrılabilir. Böylece havuzun
//! verdiği krediyi ne ajan ne de hesabı kuran kişi dışarı çıkarabilir.
#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    symbol_short, Address, Bytes, BytesN, Env, IntoVal, Symbol, TryFromVal, Val, Vec,
};

/// ~5 sn ledger ile bir gün.
pub const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_TTL: u32 = 518_400; // ~30 gün

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Not: geçersiz ed25519 imzasında host işlemi kendisi durdurur; zincirde
    /// bu kod yerine host kripto hatası görülür. Sözlük bütünlüğü için ayrıldı.
    BadSignature = 1,
    PolicyExpired = 2,
    AccountFrozen = 3,
    ContextNotAllowed = 4,
    PayeeNotAllowed = 5,
    PerTxCapExceeded = 6,
    DailyCapExceeded = 7,
    /// Swap çifti politikada yok ya da çok adımlı yol.
    PairNotAllowed = 8,
    /// `amount_out_min == 0`: kayma koruması olmayan swap.
    SlippageUnbounded = 9,
    /// Hesap bir controller'a devredilmiş; sahip imzası artık geçersiz.
    ControllerLocked = 10,
    /// Controller zaten atanmış ya da çağıran controller değil.
    ControllerMismatch = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    /// Ajanın ed25519 açık anahtarı.
    pub agent_key: BytesN<32>,
    /// Tavanların uygulandığı varlık (USDC SAC).
    pub asset: Address,
    /// Tek transfer / tek kanal depozitosu tavanı.
    pub per_tx_cap: i128,
    /// Günlük toplam çıkış tavanı.
    pub daily_cap: i128,
    /// İzinli alıcılar (satıcılar).
    pub payees: Vec<Address>,
    /// Güvenilen kanal kontratı; depozito transferleri buraya yapılabilir.
    pub channel: Address,
    pub expires_ledger: u32,
    /// İzinli DEX router'ı (Soroswap). None ise swap kapalı.
    pub dex_router: Option<Address>,
    /// Router'ın factory'si; pair adresi buradan doğrulanır.
    pub dex_factory: Option<Address>,
    /// İzinli (satılan, alınan) varlık çiftleri.
    pub pairs: Vec<(Address, Address)>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Sig {
    Owner(BytesN<64>),
    Agent(BytesN<64>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spent {
    pub day: u32,
    pub amount: i128,
}

#[contracttype]
enum DataKey {
    Owner,
    Policy,
    Spent,
    Frozen,
    Controller,
}

fn bump(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
}

fn controller(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Controller)
}

/// Yönetim çağrılarının yetkisi: controller varsa o, yoksa hesabın kendisi (sahip imzası).
fn admin_auth(env: &Env) {
    match controller(env) {
        Some(c) => c.require_auth(),
        None => env.current_contract_address().require_auth(),
    }
}

fn today(env: &Env) -> u32 {
    env.ledger().sequence() / LEDGERS_PER_DAY
}

fn load_policy(env: &Env) -> Policy {
    env.storage().instance().get(&DataKey::Policy).unwrap()
}

fn current_spent(env: &Env) -> Spent {
    let day = today(env);
    match env.storage().instance().get::<_, Spent>(&DataKey::Spent) {
        Some(s) if s.day == day => s,
        _ => Spent { day, amount: 0 },
    }
}

fn arg<T: TryFromVal<Env, Val>>(env: &Env, args: &Vec<Val>, i: u32) -> Result<T, Error> {
    let v = args.get(i).ok_or(Error::ContextNotAllowed)?;
    T::try_from_val(env, &v).map_err(|_| Error::ContextNotAllowed)
}

#[contract]
pub struct ReinkeyAccount;

#[contractimpl]
impl ReinkeyAccount {
    pub fn __constructor(env: Env, owner: BytesN<32>, policy: Policy) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Policy, &policy);
        env.storage().instance().set(&DataKey::Frozen, &false);
        bump(&env);
    }

    pub fn get_policy(env: Env) -> Policy {
        load_policy(&env)
    }

    /// (gün, bugün harcanan). Gün değiştiyse harcama 0 döner.
    pub fn get_spent(env: Env) -> (u32, i128) {
        let s = current_spent(&env);
        (s.day, s.amount)
    }

    pub fn is_frozen(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Frozen)
            .unwrap_or(false)
    }

    pub fn get_owner(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }

    pub fn get_controller(env: Env) -> Option<Address> {
        controller(&env)
    }

    /// Hesabı bir controller'a devreder. Yalnızca sahip, yalnızca bir kez.
    pub fn set_controller(env: Env, controller_addr: Address) -> Result<(), Error> {
        env.current_contract_address().require_auth();
        if controller(&env).is_some() {
            return Err(Error::ControllerMismatch);
        }
        env.storage().instance().set(&DataKey::Controller, &controller_addr);
        bump(&env);
        Ok(())
    }

    /// Controller fonu geri çeker (kredi tasfiyesi / hat kapanışı).
    pub fn recall(env: Env, asset: Address, to: Address, amount: i128) -> Result<(), Error> {
        let c = controller(&env).ok_or(Error::ControllerMismatch)?;
        c.require_auth();
        if amount > 0 {
            soroban_sdk::token::TokenClient::new(&env, &asset).transfer(&env.current_contract_address(), &to, &amount);
        }
        bump(&env);
        Ok(())
    }

    /// Sahip (ya da devredildiyse controller). Ajan imzası bu bağlamı reddeder.
    pub fn set_policy(env: Env, policy: Policy) {
        admin_auth(&env);
        env.storage().instance().set(&DataKey::Policy, &policy);
        bump(&env);
    }

    pub fn freeze(env: Env) {
        admin_auth(&env);
        env.storage().instance().set(&DataKey::Frozen, &true);
        bump(&env);
    }

    pub fn unfreeze(env: Env) {
        admin_auth(&env);
        env.storage().instance().set(&DataKey::Frozen, &false);
        bump(&env);
    }
}

#[contractimpl]
impl CustomAccountInterface for ReinkeyAccount {
    type Signature = Sig;
    type Error = Error;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: Sig,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        let payload: Bytes = signature_payload.to_bytes().into();
        match signature {
            Sig::Owner(sig) => {
                if controller(&env).is_some() {
                    return Err(Error::ControllerLocked);
                }
                let owner: BytesN<32> = env.storage().instance().get(&DataKey::Owner).unwrap();
                env.crypto().ed25519_verify(&owner, &payload, &sig);
                Ok(())
            }
            Sig::Agent(sig) => {
                let policy = load_policy(&env);
                if env
                    .storage()
                    .instance()
                    .get::<_, bool>(&DataKey::Frozen)
                    .unwrap_or(false)
                {
                    return Err(Error::AccountFrozen);
                }
                if env.ledger().sequence() > policy.expires_ledger {
                    return Err(Error::PolicyExpired);
                }
                env.crypto().ed25519_verify(&policy.agent_key, &payload, &sig);

                let outflow = check_contexts(&env, &policy, &auth_contexts)?;
                if outflow > 0 {
                    let mut spent = current_spent(&env);
                    let total = spent
                        .amount
                        .checked_add(outflow)
                        .ok_or(Error::DailyCapExceeded)?;
                    if total > policy.daily_cap {
                        return Err(Error::DailyCapExceeded);
                    }
                    spent.amount = total;
                    env.storage().instance().set(&DataKey::Spent, &spent);
                    bump(&env);
                }
                Ok(())
            }
        }
    }
}

/// Router'ın altında beklenen girdi transferi: (token, pair, tutar).
type ExpectedTransfer = (Address, Address, i128);

/// Swap bağlamını denetler. Beklenen girdi transferini ve tavana sayılacak
/// çıkışı döndürür.
fn check_swap(env: &Env, policy: &Policy, args: &Vec<Val>) -> Result<(ExpectedTransfer, i128), Error> {
    let me = env.current_contract_address();
    let amount_in: i128 = arg(env, args, 0)?;
    let amount_out_min: i128 = arg(env, args, 1)?;
    let path: Vec<Address> = arg(env, args, 2)?;
    let to: Address = arg(env, args, 3)?;
    if to != me {
        return Err(Error::PayeeNotAllowed);
    }
    if path.len() != 2 {
        return Err(Error::PairNotAllowed);
    }
    let sell = path.get(0).unwrap();
    let buy = path.get(1).unwrap();
    if !policy.pairs.contains(&(sell.clone(), buy.clone())) {
        return Err(Error::PairNotAllowed);
    }
    if amount_in <= 0 {
        return Err(Error::ContextNotAllowed);
    }
    if amount_out_min <= 0 {
        return Err(Error::SlippageUnbounded);
    }
    let mut outflow = 0;
    if sell == policy.asset {
        if amount_in > policy.per_tx_cap {
            return Err(Error::PerTxCapExceeded);
        }
        outflow = amount_in;
    }
    // Pair adresi zincirden doğrulanır: router'ın altındaki transferin alıcısı
    // yalnızca bu adres olabilir. (Router şu an çağrı yığınında olduğu için ona
    // geri çağrı yapılamaz; factory yığında değildir.)
    let factory = policy.dex_factory.clone().ok_or(Error::ContextNotAllowed)?;
    let pair_args: Vec<Val> = (sell.clone(), buy).into_val(env);
    let pair = env
        .try_invoke_contract::<Address, soroban_sdk::Error>(&factory, &Symbol::new(env, "get_pair"), pair_args)
        .map_err(|_| Error::PairNotAllowed)?
        .map_err(|_| Error::PairNotAllowed)?;
    Ok(((sell, pair, amount_in), outflow))
}

/// Ajan imzası için bağlamları denetler, toplam çıkışı döndürür.
fn check_contexts(env: &Env, policy: &Policy, contexts: &Vec<Context>) -> Result<i128, Error> {
    let transfer = symbol_short!("transfer");
    let open = symbol_short!("open");
    let top_up = symbol_short!("top_up");
    let swap = Symbol::new(env, "swap_exact_tokens_for_tokens");
    let me = env.current_contract_address();
    let mut outflow: i128 = 0;

    // Kanala transfer yalnızca aynı auth ağacında open/top_up varsa geçerli;
    // aksi hâlde depozito kaydı olmayan para kanal kontratında kilitli kalırdı.
    let has_channel_call = contexts.iter().any(|ctx| match ctx {
        Context::Contract(c) => c.contract == policy.channel && (c.fn_name == open || c.fn_name == top_up),
        _ => false,
    });

    // 1. geçiş: izinli swap'ları doğrula, altlarında beklenen transferleri topla.
    let mut expected: Vec<ExpectedTransfer> = Vec::new(env);
    for ctx in contexts.iter() {
        if let Context::Contract(c) = ctx {
            if policy.dex_router.as_ref() == Some(&c.contract) && c.fn_name == swap {
                let (exp, out) = check_swap(env, policy, &c.args)?;
                expected.push_back(exp);
                outflow = outflow.checked_add(out).ok_or(Error::DailyCapExceeded)?;
            }
        }
    }

    // 2. geçiş: her bağlam ya bir swap, ya bir swap'ın girdi transferi, ya da
    // kanal/satıcı kuralına uyan bir bağlam olmalı.
    for ctx in contexts.iter() {
        let c = match ctx {
            Context::Contract(c) => c,
            _ => return Err(Error::ContextNotAllowed),
        };
        let fname: Symbol = c.fn_name.clone();
        if policy.dex_router.as_ref() == Some(&c.contract) && fname == swap {
            // 1. geçişte denetlendi.
        } else if fname == transfer && !expected.is_empty() && matches_expected(env, &me, &c.contract, &c.args, &mut expected)? {
            // İzinli bir swap'ın girdi transferi; tutar swap'ta sayıldı.
        } else if c.contract == policy.asset && fname == transfer {
            let from: Address = arg(env, &c.args, 0)?;
            let to: Address = arg(env, &c.args, 1)?;
            let amount: i128 = arg(env, &c.args, 2)?;
            if from != me || amount < 0 {
                return Err(Error::ContextNotAllowed);
            }
            if to == policy.channel {
                if !has_channel_call {
                    return Err(Error::ContextNotAllowed);
                }
            } else if !policy.payees.contains(&to) {
                return Err(Error::PayeeNotAllowed);
            }
            if amount > policy.per_tx_cap {
                return Err(Error::PerTxCapExceeded);
            }
            outflow = outflow.checked_add(amount).ok_or(Error::DailyCapExceeded)?;
        } else if c.contract == policy.channel && fname == open {
            let payer: Address = arg(env, &c.args, 0)?;
            let payee: Address = arg(env, &c.args, 1)?;
            let asset: Address = arg(env, &c.args, 2)?;
            if payer != me || asset != policy.asset {
                return Err(Error::ContextNotAllowed);
            }
            if !policy.payees.contains(&payee) {
                return Err(Error::PayeeNotAllowed);
            }
        } else if c.contract == policy.channel && fname == top_up {
            // Tutar iç içe transfer bağlamında sayılır.
        } else {
            return Err(Error::ContextNotAllowed);
        }
    }
    Ok(outflow)
}

/// Transfer bağlamı beklenen bir swap girdisiyle birebir eşleşiyorsa onu
/// listeden düşer (her swap tek bir transferi örter).
fn matches_expected(
    env: &Env,
    me: &Address,
    token: &Address,
    args: &Vec<Val>,
    expected: &mut Vec<ExpectedTransfer>,
) -> Result<bool, Error> {
    let from: Address = arg(env, args, 0)?;
    let to: Address = arg(env, args, 1)?;
    let amount: i128 = arg(env, args, 2)?;
    if &from != me {
        return Ok(false);
    }
    for i in 0..expected.len() {
        let (t, pair, amt) = expected.get(i).unwrap();
        if &t == token && pair == to && amt == amount {
            expected.remove(i);
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod test;
