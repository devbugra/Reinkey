//! Reinkey `channel`: tek yönlü (ödeyen → satıcı) ödeme kanalı.
//!
//! Ödeyen depozito kilitler; zincir dışında kümülatif, imzalı kuponlar
//! gönderir; satıcı (ya da onun adına herhangi biri) en yüksek kuponu tek
//! işlemle tahsil eder. Kümülatif tutar tek yönlü arttığı için çift harcama
//! yapısal olarak imkânsızdır.
//!
//! Kupon bayt düzeni (docs/BACKEND.md §3.1):
//!   "reinkey:voucher:v1" ‖ network_id ‖ contract_id ‖ id (u64 BE) ‖ cumulative (i128 BE)
//!   hash = sha256(message); imzalanan şey hash'in kendisi.
#![no_std]

use soroban_sdk::{
    address_payload::AddressPayload, contract, contracterror, contractevent, contractimpl,
    contracttype, panic_with_error, token, Address, Bytes, BytesN, Env,
};

/// Ödeyenin, süre dolduktan sonra kanalı kapatabilmesi için beklemesi gereken ek süre.
pub const CLOSE_GRACE_LEDGERS: u32 = 120;
/// Kanal kaydının, süre + grace sonrasında da okunabilmesi için ek TTL payı.
const TTL_MARGIN_LEDGERS: u32 = 17_280; // ~1 gün
const INSTANCE_TTL: u32 = 518_400; // ~30 gün
const VOUCHER_DOMAIN: &[u8] = b"reinkey:voucher:v1";

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ChannelNotFound = 20,
    ChannelClosed = 21,
    /// Not: geçersiz imzada host `ed25519_verify` işlemi kendisi durdurur, bu
    /// yüzden zincirde bu kod yerine bir host kripto hatası görülür. Kod,
    /// zincir dışı doğrulayıcıyla aynı sözlüğü paylaşmak için ayrılmıştır.
    VoucherBadSignature = 22,
    VoucherNotIncreasing = 23,
    ExceedsDeposit = 24,
    NotExpired = 25,
    NotAuthorized = 26,
    InvalidArgument = 27,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Channel {
    pub payer: Address,
    pub payee: Address,
    pub asset: Address,
    pub deposit: i128,
    pub claimed: i128,
    pub voucher_key: BytesN<32>,
    pub expiry_ledger: u32,
    pub open: bool,
}

#[contracttype]
enum DataKey {
    NextId,
    Channel(u64),
}

#[contractevent(topics = ["channel", "opened"], data_format = "map")]
pub struct Opened {
    #[topic]
    pub id: u64,
    pub payer: Address,
    pub payee: Address,
    pub asset: Address,
    pub deposit: i128,
    pub expiry_ledger: u32,
}

#[contractevent(topics = ["channel", "topped_up"], data_format = "map")]
pub struct ToppedUp {
    #[topic]
    pub id: u64,
    pub amount: i128,
    pub deposit: i128,
}

#[contractevent(topics = ["channel", "claimed"], data_format = "map")]
pub struct Claimed {
    #[topic]
    pub id: u64,
    pub amount: i128,
    pub cumulative: i128,
}

#[contractevent(topics = ["channel", "closed"], data_format = "map")]
pub struct Closed {
    #[topic]
    pub id: u64,
    pub refunded: i128,
    pub claimed: i128,
}

/// Kupon mesajını kodlar. Kontrat kimliği parametre alınır ki aynı fonksiyon
/// sabit test vektörüyle (kimlik 0x02×32) doğrulanabilsin.
pub fn voucher_message(
    env: &Env,
    network_id: &BytesN<32>,
    contract_id: &BytesN<32>,
    id: u64,
    cumulative: i128,
) -> Bytes {
    let mut msg = Bytes::from_slice(env, VOUCHER_DOMAIN);
    msg.append(&Bytes::from(network_id.clone()));
    msg.append(&Bytes::from(contract_id.clone()));
    msg.extend_from_array(&id.to_be_bytes());
    msg.extend_from_array(&cumulative.to_be_bytes());
    msg
}

pub fn voucher_hash(
    env: &Env,
    network_id: &BytesN<32>,
    contract_id: &BytesN<32>,
    id: u64,
    cumulative: i128,
) -> BytesN<32> {
    let msg = voucher_message(env, network_id, contract_id, id, cumulative);
    env.crypto().sha256(&msg).to_bytes()
}

fn self_contract_id(env: &Env) -> BytesN<32> {
    match env.current_contract_address().to_payload() {
        Some(AddressPayload::ContractIdHash(h)) => h,
        _ => panic_with_error!(env, Error::InvalidArgument),
    }
}

fn load(env: &Env, id: u64) -> Channel {
    env.storage()
        .persistent()
        .get(&DataKey::Channel(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::ChannelNotFound))
}

fn save(env: &Env, id: u64, ch: &Channel) {
    let key = DataKey::Channel(id);
    env.storage().persistent().set(&key, ch);
    // Kayıt, süre + grace + pay boyunca yaşamalı; sonrasında da `get` okunabilsin.
    let now = env.ledger().sequence();
    let until = ch
        .expiry_ledger
        .saturating_add(CLOSE_GRACE_LEDGERS)
        .saturating_add(TTL_MARGIN_LEDGERS);
    let want = until.saturating_sub(now).max(TTL_MARGIN_LEDGERS);
    let ttl = want.min(env.storage().max_ttl());
    env.storage().persistent().extend_ttl(&key, ttl, ttl);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
}

#[contract]
pub struct ChannelContract;

#[contractimpl]
impl ChannelContract {
    /// Kanal açar ve depozitoyu ödeyenden bu kontrata aktarır.
    pub fn open(
        env: Env,
        payer: Address,
        payee: Address,
        asset: Address,
        deposit: i128,
        voucher_key: BytesN<32>,
        expiry_ledger: u32,
    ) -> u64 {
        payer.require_auth();
        if deposit <= 0 || expiry_ledger <= env.ledger().sequence() || payer == payee {
            panic_with_error!(&env, Error::InvalidArgument);
        }
        token::Client::new(&env, &asset).transfer(
            &payer,
            &env.current_contract_address(),
            &deposit,
        );

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1u64);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let ch = Channel {
            payer: payer.clone(),
            payee: payee.clone(),
            asset: asset.clone(),
            deposit,
            claimed: 0,
            voucher_key,
            expiry_ledger,
            open: true,
        };
        save(&env, id, &ch);
        Opened {
            id,
            payer,
            payee,
            asset,
            deposit,
            expiry_ledger,
        }
        .publish(&env);
        id
    }

    /// Açık bir kanala depozito ekler.
    pub fn top_up(env: Env, id: u64, amount: i128) {
        let mut ch = load(&env, id);
        ch.payer.require_auth();
        if !ch.open {
            panic_with_error!(&env, Error::ChannelClosed);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidArgument);
        }
        token::Client::new(&env, &ch.asset).transfer(
            &ch.payer,
            &env.current_contract_address(),
            &amount,
        );
        ch.deposit += amount;
        save(&env, id, &ch);
        ToppedUp {
            id,
            amount,
            deposit: ch.deposit,
        }
        .publish(&env);
    }

    /// En yüksek kuponu tahsil eder. Herkes çağırabilir; para yalnızca payee'ye gider.
    pub fn claim(env: Env, id: u64, cumulative: i128, sig: BytesN<64>) -> i128 {
        let mut ch = load(&env, id);
        if !ch.open {
            panic_with_error!(&env, Error::ChannelClosed);
        }
        if cumulative <= ch.claimed {
            panic_with_error!(&env, Error::VoucherNotIncreasing);
        }
        if cumulative > ch.deposit {
            panic_with_error!(&env, Error::ExceedsDeposit);
        }
        let hash = voucher_hash(
            &env,
            &env.ledger().network_id(),
            &self_contract_id(&env),
            id,
            cumulative,
        );
        env.crypto()
            .ed25519_verify(&ch.voucher_key, &Bytes::from(hash), &sig);

        let amount = cumulative - ch.claimed;
        token::Client::new(&env, &ch.asset).transfer(
            &env.current_contract_address(),
            &ch.payee,
            &amount,
        );
        ch.claimed = cumulative;
        save(&env, id, &ch);
        Claimed {
            id,
            amount,
            cumulative,
        }
        .publish(&env);
        amount
    }

    /// Kanalı kapatır ve tahsil edilmemiş depozitoyu ödeyene iade eder.
    /// payee her an kapatabilir; payer ancak `expiry_ledger + grace` sonrasında.
    pub fn close(env: Env, id: u64, caller: Address) -> i128 {
        caller.require_auth();
        let mut ch = load(&env, id);
        if !ch.open {
            panic_with_error!(&env, Error::ChannelClosed);
        }
        if caller == ch.payee {
            // serbest
        } else if caller == ch.payer {
            if env.ledger().sequence() <= ch.expiry_ledger.saturating_add(CLOSE_GRACE_LEDGERS) {
                panic_with_error!(&env, Error::NotExpired);
            }
        } else {
            panic_with_error!(&env, Error::NotAuthorized);
        }

        let refunded = ch.deposit - ch.claimed;
        if refunded > 0 {
            token::Client::new(&env, &ch.asset).transfer(
                &env.current_contract_address(),
                &ch.payer,
                &refunded,
            );
        }
        ch.open = false;
        save(&env, id, &ch);
        Closed {
            id,
            refunded,
            claimed: ch.claimed,
        }
        .publish(&env);
        refunded
    }

    pub fn get(env: Env, id: u64) -> Channel {
        load(&env, id)
    }
}

#[cfg(test)]
mod test;
