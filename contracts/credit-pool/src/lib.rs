//! Credit Pool: kısıta dayalı (teminatsız) kredi.
//!
//! Fikir: Reinkey Account'taki fon yalnızca politikanın izin verdiği adreslere
//! gidebilir. Hesap bu havuza devredildiğinde (`set_controller`) sahip imzası
//! da geçersizleşir; krediyi ne ajan ne de hesabı kuran kişi dışarı çıkarabilir.
//! Kaçamayan sermayeye teminat gerekmez.
//!
//! - Yatırımcı USDC yatırır, pay alır. Pay fiyatı =
//!   (havuzdaki USDC + açık kredilerin borcu + havuzdaki XLM × fiyat) / toplam pay.
//! - `open_line`: yönetici, controller'ı bu havuz olan bir hesaba limit kadar
//!   USDC aktarır; borç = limit.
//! - `health`: hesabın değeri (USDC + XLM × fiyat) ve borcu.
//! - `liquidate`: herkes çağırabilir. Değer, borcun `liq_threshold_bps` oranının
//!   altına düştüyse hesap dondurulur ve kalan fon havuza çekilir; zarar pay
//!   fiyatına yansır.
//! - `close_line`: borç + kâr payı havuza, kalan kâr lehdara gider.
//!
//! FİYAT: ihtiyatlı değerleme. Oracle (Reflector) ve DEX pair fiyatından
//! DÜŞÜK olanı kullanılır. Böylece DEX fiyatını şişirerek hesap sağlıklı
//! gösterilemez. UYARI: yalnızca pair kaynağı tanımlıysa fiyat tek bir büyük
//! işlemle manipüle edilebilir; pair fiyatını düşürmek haksız tasfiyeyi
//! tetikleyebilir (borç verene değil, borçluya zarar). Mainnet için oracle
//! zorunlu tutulmalı ve TWAP kullanılmalıdır.
//!
//! KAPSAM DIŞI: hesabın açık kanallarındaki harcanmamış depozito sağlık
//! hesabına katılmaz (kanal kontratında hesaba göre dizin yok). Kanala kilitlenen
//! tutar bu yüzden değer kaybı gibi görünür; bu ihtiyatlı yöndedir.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token::TokenClient, Address,
    Env, IntoVal, Symbol, Val, Vec,
};

const BPS: i128 = 10_000;
const SCALE: i128 = 10_000_000; // 7 ondalık
const INSTANCE_TTL: u32 = 518_400;
const PERSISTENT_TTL: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 40,
    InsufficientShares = 41,
    InsufficientLiquidity = 42,
    LineExists = 43,
    LineNotFound = 44,
    /// Hesabın controller'ı bu havuz değil.
    NotController = 45,
    NotLiquidatable = 46,
    PriceUnavailable = 47,
    /// Hat kapanışı için hesapta borcu karşılayacak USDC yok (önce XLM satılmalı).
    InsufficientUsdc = 48,
    NotAuthorized = 49,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub usdc: Address,
    pub xlm: Address,
    /// Reflector oracle (SEP-40). None ise kullanılmaz.
    pub oracle: Option<Address>,
    /// Soroswap USDC/XLM pair'i. None ise kullanılmaz.
    pub pair: Option<Address>,
    /// Değer < borç × bu oran ise tasfiye edilebilir (9000 = %90).
    pub liq_threshold_bps: u32,
    /// Kârdan havuza giden pay (2000 = %20).
    pub profit_share_bps: u32,
    /// Oracle fiyatı bundan eskiyse yok sayılır (saniye).
    pub max_price_age: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Line {
    pub debt: i128,
    pub beneficiary: Address,
    pub open: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Health {
    pub value: i128,
    pub debt: i128,
    pub usdc: i128,
    pub xlm: i128,
    /// 1 XLM kaç USDC (7 ondalık).
    pub price: i128,
    pub liquidatable: bool,
}

// Reflector (SEP-40) arayüz tipleri.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contracttype]
enum DataKey {
    Config,
    TotalShares,
    TotalDebt,
    Shares(Address),
    Line(Address),
}

fn cfg(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

fn bump(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
}

fn get_i128(env: &Env, k: &DataKey) -> i128 {
    env.storage().instance().get(k).unwrap_or(0)
}

fn shares_of(env: &Env, a: &Address) -> i128 {
    env.storage().persistent().get(&DataKey::Shares(a.clone())).unwrap_or(0)
}

fn set_shares(env: &Env, a: &Address, v: i128) {
    let k = DataKey::Shares(a.clone());
    env.storage().persistent().set(&k, &v);
    env.storage().persistent().extend_ttl(&k, PERSISTENT_TTL, PERSISTENT_TTL);
}

fn line_of(env: &Env, a: &Address) -> Option<Line> {
    env.storage().persistent().get(&DataKey::Line(a.clone()))
}

fn set_line(env: &Env, a: &Address, l: &Line) {
    let k = DataKey::Line(a.clone());
    env.storage().persistent().set(&k, l);
    env.storage().persistent().extend_ttl(&k, PERSISTENT_TTL, PERSISTENT_TTL);
}

fn pow10(n: u32) -> i128 {
    10i128.pow(n)
}

/// Oracle fiyatı (7 ondalık). Bayat ya da yoksa None.
fn oracle_price(env: &Env, c: &Config) -> Option<i128> {
    let oracle = c.oracle.as_ref()?;
    let args: Vec<Val> = (Asset::Other(Symbol::new(env, "XLM")),).into_val(env);
    let data = env
        .try_invoke_contract::<Option<PriceData>, soroban_sdk::Error>(oracle, &Symbol::new(env, "lastprice"), args)
        .ok()?
        .ok()??;
    let dec = env
        .try_invoke_contract::<u32, soroban_sdk::Error>(oracle, &Symbol::new(env, "decimals"), Vec::new(env))
        .ok()?
        .ok()?;
    if data.price <= 0 || env.ledger().timestamp().saturating_sub(data.timestamp) > c.max_price_age {
        return None;
    }
    Some(data.price.checked_mul(SCALE)? / pow10(dec))
}

/// DEX spot fiyatı (7 ondalık): USDC rezervi / XLM rezervi. Manipüle edilebilir.
fn pair_price(env: &Env, c: &Config) -> Option<i128> {
    let pair = c.pair.as_ref()?;
    let (r0, r1) = env
        .try_invoke_contract::<(i128, i128), soroban_sdk::Error>(pair, &Symbol::new(env, "get_reserves"), Vec::new(env))
        .ok()?
        .ok()?;
    let t0 = env
        .try_invoke_contract::<Address, soroban_sdk::Error>(pair, &Symbol::new(env, "token_0"), Vec::new(env))
        .ok()?
        .ok()?;
    let (usdc_r, xlm_r) = if t0 == c.usdc { (r0, r1) } else { (r1, r0) };
    if usdc_r <= 0 || xlm_r <= 0 {
        return None;
    }
    Some(usdc_r.checked_mul(SCALE)? / xlm_r)
}

/// İhtiyatlı fiyat: mevcut kaynakların düşük olanı.
fn price(env: &Env, c: &Config) -> Result<i128, Error> {
    match (oracle_price(env, c), pair_price(env, c)) {
        (Some(a), Some(b)) => Ok(a.min(b)),
        (Some(a), None) => Ok(a),
        (None, Some(b)) => Ok(b),
        (None, None) => Err(Error::PriceUnavailable),
    }
}

fn xlm_value(xlm: i128, price: i128) -> i128 {
    xlm * price / SCALE
}

fn total_assets(env: &Env, c: &Config) -> Result<i128, Error> {
    let me = env.current_contract_address();
    let usdc = TokenClient::new(env, &c.usdc).balance(&me);
    let xlm = TokenClient::new(env, &c.xlm).balance(&me);
    let xlm_val = if xlm > 0 { xlm_value(xlm, price(env, c)?) } else { 0 };
    Ok(usdc + get_i128(env, &DataKey::TotalDebt) + xlm_val)
}

fn health_of(env: &Env, c: &Config, account: &Address, line: &Line) -> Result<Health, Error> {
    let usdc = TokenClient::new(env, &c.usdc).balance(account);
    let xlm = TokenClient::new(env, &c.xlm).balance(account);
    let p = price(env, c)?;
    let value = usdc + xlm_value(xlm, p);
    let liquidatable = line.open && value * BPS < line.debt * c.liq_threshold_bps as i128;
    Ok(Health { value, debt: line.debt, usdc, xlm, price: p, liquidatable })
}

fn recall(env: &Env, account: &Address, asset: &Address, to: &Address, amount: i128) {
    if amount > 0 {
        let args: Vec<Val> = (asset.clone(), to.clone(), amount).into_val(env);
        let _: () = env.invoke_contract(account, &symbol_short!("recall"), args);
    }
}

#[contract]
pub struct CreditPool;

#[contractimpl]
impl CreditPool {
    pub fn __constructor(env: Env, config: Config) {
        env.storage().instance().set(&DataKey::Config, &config);
        bump(&env);
    }

    pub fn get_config(env: Env) -> Config {
        cfg(&env)
    }

    /// Fiyat kaynaklarını günceller (yönetici).
    pub fn set_price_sources(env: Env, oracle: Option<Address>, pair: Option<Address>) {
        let mut c = cfg(&env);
        c.admin.require_auth();
        c.oracle = oracle;
        c.pair = pair;
        env.storage().instance().set(&DataKey::Config, &c);
        bump(&env);
    }

    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<i128, Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let c = cfg(&env);
        let total_shares = get_i128(&env, &DataKey::TotalShares);
        let assets = total_assets(&env, &c)?;
        let minted = if total_shares == 0 || assets == 0 { amount } else { amount * total_shares / assets };
        if minted <= 0 {
            return Err(Error::InvalidAmount);
        }
        TokenClient::new(&env, &c.usdc).transfer(&from, &env.current_contract_address(), &amount);
        set_shares(&env, &from, shares_of(&env, &from) + minted);
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares + minted));
        bump(&env);
        env.events().publish((symbol_short!("pool"), symbol_short!("deposited"), from), (amount, minted));
        Ok(minted)
    }

    pub fn withdraw(env: Env, from: Address, shares: i128) -> Result<i128, Error> {
        from.require_auth();
        let have = shares_of(&env, &from);
        if shares <= 0 || shares > have {
            return Err(Error::InsufficientShares);
        }
        let c = cfg(&env);
        let total_shares = get_i128(&env, &DataKey::TotalShares);
        let amount = shares * total_assets(&env, &c)? / total_shares;
        let usdc = TokenClient::new(&env, &c.usdc);
        if usdc.balance(&env.current_contract_address()) < amount {
            return Err(Error::InsufficientLiquidity);
        }
        set_shares(&env, &from, have - shares);
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares - shares));
        usdc.transfer(&env.current_contract_address(), &from, &amount);
        bump(&env);
        env.events().publish((symbol_short!("pool"), symbol_short!("withdrawn"), from), (amount, shares));
        Ok(amount)
    }

    /// Pay bakiyesi (SEP-41 uyumlu ad).
    pub fn balance(env: Env, id: Address) -> i128 {
        shares_of(&env, &id)
    }

    /// Pay devri: paylar alınıp satılabilir.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        let have = shares_of(&env, &from);
        if amount <= 0 || amount > have {
            return Err(Error::InsufficientShares);
        }
        set_shares(&env, &from, have - amount);
        set_shares(&env, &to, shares_of(&env, &to) + amount);
        Ok(())
    }

    pub fn total_shares(env: Env) -> i128 {
        get_i128(&env, &DataKey::TotalShares)
    }

    pub fn total_debt(env: Env) -> i128 {
        get_i128(&env, &DataKey::TotalDebt)
    }

    pub fn total_assets(env: Env) -> Result<i128, Error> {
        total_assets(&env, &cfg(&env))
    }

    /// Bir payın USDC değeri (7 ondalık). Pay yokken 1.0.
    pub fn share_price(env: Env) -> Result<i128, Error> {
        let ts = get_i128(&env, &DataKey::TotalShares);
        if ts == 0 {
            return Ok(SCALE);
        }
        Ok(total_assets(&env, &cfg(&env))? * SCALE / ts)
    }

    pub fn price(env: Env) -> Result<i128, Error> {
        price(&env, &cfg(&env))
    }

    /// Yönetici, controller'ı bu havuz olan bir hesaba kredi hattı açar.
    /// Hesabın politikasını (izinli alıcılar!) incelemek yöneticinin sorumluluğundadır.
    pub fn open_line(env: Env, account: Address, limit: i128, beneficiary: Address) -> Result<(), Error> {
        let c = cfg(&env);
        c.admin.require_auth();
        if limit <= 0 {
            return Err(Error::InvalidAmount);
        }
        if line_of(&env, &account).map(|l| l.open).unwrap_or(false) {
            return Err(Error::LineExists);
        }
        let ctrl = env
            .try_invoke_contract::<Option<Address>, soroban_sdk::Error>(&account, &Symbol::new(&env, "get_controller"), Vec::new(&env))
            .map_err(|_| Error::NotController)?
            .map_err(|_| Error::NotController)?;
        if ctrl != Some(env.current_contract_address()) {
            return Err(Error::NotController);
        }
        let usdc = TokenClient::new(&env, &c.usdc);
        if usdc.balance(&env.current_contract_address()) < limit {
            return Err(Error::InsufficientLiquidity);
        }
        usdc.transfer(&env.current_contract_address(), &account, &limit);
        set_line(&env, &account, &Line { debt: limit, beneficiary, open: true });
        env.storage()
            .instance()
            .set(&DataKey::TotalDebt, &(get_i128(&env, &DataKey::TotalDebt) + limit));
        bump(&env);
        env.events().publish((symbol_short!("pool"), Symbol::new(&env, "line_opened"), account), limit);
        Ok(())
    }

    pub fn get_line(env: Env, account: Address) -> Option<Line> {
        line_of(&env, &account)
    }

    pub fn health(env: Env, account: Address) -> Result<Health, Error> {
        let line = line_of(&env, &account).ok_or(Error::LineNotFound)?;
        health_of(&env, &cfg(&env), &account, &line)
    }

    /// Herkes çağırabilir. Eşik altındaki hesabı dondurur, fonu havuza çeker.
    /// Dönen değer: geri alınan toplam (USDC cinsinden).
    pub fn liquidate(env: Env, account: Address) -> Result<i128, Error> {
        let c = cfg(&env);
        let mut line = line_of(&env, &account).ok_or(Error::LineNotFound)?;
        if !line.open {
            return Err(Error::LineNotFound);
        }
        let h = health_of(&env, &c, &account, &line)?;
        if !h.liquidatable {
            return Err(Error::NotLiquidatable);
        }
        let me = env.current_contract_address();
        let _: () = env.invoke_contract(&account, &symbol_short!("freeze"), Vec::new(&env));
        recall(&env, &account, &c.usdc, &me, h.usdc);
        recall(&env, &account, &c.xlm, &me, h.xlm);

        let debt = line.debt;
        line.debt = 0;
        line.open = false;
        set_line(&env, &account, &line);
        env.storage()
            .instance()
            .set(&DataKey::TotalDebt, &(get_i128(&env, &DataKey::TotalDebt) - debt));
        bump(&env);
        env.events().publish(
            (symbol_short!("pool"), Symbol::new(&env, "liquidated"), account),
            (debt, h.value, debt - h.value),
        );
        Ok(h.value)
    }

    /// Hattı kapatır: borç + kâr payı havuza, kalan kâr ve XLM lehdara gider.
    /// Yönetici ya da lehdar çağırabilir. Hesapta borcu karşılayacak USDC olmalı.
    pub fn close_line(env: Env, caller: Address, account: Address) -> Result<i128, Error> {
        let c = cfg(&env);
        let mut line = line_of(&env, &account).ok_or(Error::LineNotFound)?;
        if !line.open {
            return Err(Error::LineNotFound);
        }
        if caller != c.admin && caller != line.beneficiary {
            return Err(Error::NotAuthorized);
        }
        caller.require_auth();
        let usdc_bal = TokenClient::new(&env, &c.usdc).balance(&account);
        if usdc_bal < line.debt {
            return Err(Error::InsufficientUsdc);
        }
        let profit = usdc_bal - line.debt;
        let fee = profit * c.profit_share_bps as i128 / BPS;
        let me = env.current_contract_address();
        let _: () = env.invoke_contract(&account, &symbol_short!("freeze"), Vec::new(&env));
        recall(&env, &account, &c.usdc, &me, line.debt + fee);
        recall(&env, &account, &c.usdc, &line.beneficiary, profit - fee);
        let xlm_bal = TokenClient::new(&env, &c.xlm).balance(&account);
        recall(&env, &account, &c.xlm, &line.beneficiary, xlm_bal);

        env.storage()
            .instance()
            .set(&DataKey::TotalDebt, &(get_i128(&env, &DataKey::TotalDebt) - line.debt));
        line.debt = 0;
        line.open = false;
        set_line(&env, &account, &line);
        bump(&env);
        env.events().publish(
            (symbol_short!("pool"), Symbol::new(&env, "line_closed"), account),
            (profit, fee),
        );
        Ok(fee)
    }
}

#[cfg(test)]
mod test;
