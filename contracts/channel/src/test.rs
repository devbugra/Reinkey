extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};

fn hex32(s: &str) -> [u8; 32] {
    let v = hex_decode(s);
    v.try_into().unwrap()
}

fn hex_decode(s: &str) -> std::vec::Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

fn to_hex(b: &[u8]) -> std::string::String {
    b.iter().map(|x| std::format!("{:02x}", x)).collect()
}

/// docs/BACKEND.md §3.2 — backend ve SDK ile ortak test vektörü. DEĞİŞTİRME.
#[test]
fn voucher_test_vector() {
    let env = Env::default();
    let network_id = BytesN::from_array(&env, &hex32(
        "cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472",
    ));
    // network_id = sha256("Test SDF Network ; September 2015")
    let passphrase = Bytes::from_slice(&env, b"Test SDF Network ; September 2015");
    assert_eq!(env.crypto().sha256(&passphrase).to_bytes(), network_id);

    let contract_id = BytesN::from_array(&env, &[0x02; 32]);
    let msg = voucher_message(&env, &network_id, &contract_id, 42, 135_000);
    let mut buf = std::vec![0u8; msg.len() as usize];
    msg.copy_into_slice(&mut buf);
    assert_eq!(
        to_hex(&buf),
        "7265696e6b65793a766f75636865723a7631cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd4720202020202020202020202020202020202020202020202020202020202020202000000000000002a00000000000000000000000000020f58"
    );

    let hash = voucher_hash(&env, &network_id, &contract_id, 42, 135_000);
    assert_eq!(
        to_hex(&hash.to_array()),
        "09e5987e1dd2a9bc88f7547fe9b9f63f93904814dbc9a0736bc80e9e1c94fcff"
    );

    let sk = SigningKey::from_bytes(&[0x01; 32]);
    assert_eq!(
        to_hex(sk.verifying_key().as_bytes()),
        "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c"
    );
    let sig = sk.sign(&hash.to_array());
    assert_eq!(
        to_hex(&sig.to_bytes()),
        "07d349e172fba846b558b11d69aac42df4a6acdf09ed0c63a00f3f1dc86c911cd5118cfe983abb8e41e0bdddd118f31aa70b7a0d0639246188ee312192607e0d"
    );

    // Host doğrulaması da aynı imzayı kabul etmeli.
    env.crypto().ed25519_verify(
        &BytesN::from_array(&env, sk.verifying_key().as_bytes()),
        &Bytes::from(hash),
        &BytesN::from_array(&env, &sig.to_bytes()),
    );
}

struct Setup {
    env: Env,
    client: ChannelContractClient<'static>,
    contract: Address,
    token: TokenClient<'static>,
    payer: Address,
    payee: Address,
    sk: SigningKey,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_sequence_number(1_000);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &sac.address());
    let payer = Address::generate(&env);
    let payee = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&payer, &100_000_000);

    let contract = env.register(ChannelContract, ());
    let client = ChannelContractClient::new(&env, &contract);
    let sk = SigningKey::from_bytes(&[0x07; 32]);
    Setup { env, client, contract, token, payer, payee, sk }
}

fn sign(s: &Setup, id: u64, cumulative: i128) -> BytesN<64> {
    let contract_id = match s.contract.to_payload() {
        Some(AddressPayload::ContractIdHash(h)) => h,
        _ => panic!(),
    };
    let hash = voucher_hash(&s.env, &s.env.ledger().network_id(), &contract_id, id, cumulative);
    BytesN::from_array(&s.env, &s.sk.sign(&hash.to_array()).to_bytes())
}

fn open(s: &Setup, deposit: i128) -> u64 {
    let key = BytesN::from_array(&s.env, s.sk.verifying_key().as_bytes());
    s.client.open(&s.payer, &s.payee, &s.token.address, &deposit, &key, &2_000)
}

#[test]
fn open_claim_close_flow() {
    let s = setup();
    let id = open(&s, 10_000_000);
    assert_eq!(id, 1);
    assert_eq!(s.token.balance(&s.contract), 10_000_000);
    assert_eq!(s.token.balance(&s.payer), 90_000_000);

    // İki kupon; yalnızca en yüksek olan tahsil edilir.
    let paid = s.client.claim(&id, &135_000, &sign(&s, id, 135_000));
    assert_eq!(paid, 135_000);
    let paid = s.client.claim(&id, &400_000, &sign(&s, id, 400_000));
    assert_eq!(paid, 265_000);
    assert_eq!(s.token.balance(&s.payee), 400_000);

    let ch = s.client.get(&id);
    assert_eq!(ch.claimed, 400_000);
    assert!(ch.open);

    // Satıcı hemen kapatabilir; kalan ödeyene döner.
    let refunded = s.client.close(&id, &s.payee);
    assert_eq!(refunded, 9_600_000);
    assert_eq!(s.token.balance(&s.payer), 99_600_000);
    assert!(!s.client.get(&id).open);
}

#[test]
fn claim_rejects_replay_and_overdraw() {
    let s = setup();
    let id = open(&s, 1_000_000);
    s.client.claim(&id, &500_000, &sign(&s, id, 500_000));

    let r = s.client.try_claim(&id, &500_000, &sign(&s, id, 500_000));
    assert_eq!(r, Err(Ok(e(Error::VoucherNotIncreasing))));
    let r = s.client.try_claim(&id, &400_000, &sign(&s, id, 400_000));
    assert_eq!(r, Err(Ok(e(Error::VoucherNotIncreasing))));
    let r = s.client.try_claim(&id, &1_000_001, &sign(&s, id, 1_000_001));
    assert_eq!(r, Err(Ok(e(Error::ExceedsDeposit))));
}

#[test]
fn claim_rejects_bad_signature() {
    let s = setup();
    let id = open(&s, 1_000_000);
    // Başka bir tutar için imza → host kripto hatası.
    let r = s.client.try_claim(&id, &600_000, &sign(&s, id, 500_000));
    assert!(r.is_err());
    // Başka bir kanal kimliği için imza.
    let r = s.client.try_claim(&id, &500_000, &sign(&s, id + 1, 500_000));
    assert!(r.is_err());
    assert_eq!(s.client.get(&id).claimed, 0);
}

#[test]
fn payer_close_waits_for_expiry_and_grace() {
    let s = setup();
    let id = open(&s, 1_000_000);
    let r = s.client.try_close(&id, &s.payer);
    assert_eq!(r, Err(Ok(e(Error::NotExpired))));

    s.env.ledger().set_sequence_number(2_000 + CLOSE_GRACE_LEDGERS);
    assert_eq!(s.client.try_close(&id, &s.payer), Err(Ok(e(Error::NotExpired))));

    s.env.ledger().set_sequence_number(2_001 + CLOSE_GRACE_LEDGERS);
    assert_eq!(s.client.close(&id, &s.payer), 1_000_000);
    assert_eq!(s.token.balance(&s.payer), 100_000_000);

    let r = s.client.try_claim(&id, &1, &sign(&s, id, 1));
    assert_eq!(r, Err(Ok(e(Error::ChannelClosed))));
}

#[test]
fn stranger_cannot_close_and_top_up_works() {
    let s = setup();
    let id = open(&s, 1_000_000);
    let stranger = Address::generate(&s.env);
    assert_eq!(s.client.try_close(&id, &stranger), Err(Ok(e(Error::NotAuthorized))));

    s.client.top_up(&id, &500_000);
    assert_eq!(s.client.get(&id).deposit, 1_500_000);
    s.client.claim(&id, &1_200_000, &sign(&s, id, 1_200_000));
    assert_eq!(s.token.balance(&s.payee), 1_200_000);
}

#[test]
fn invalid_open_and_missing_channel() {
    let s = setup();
    let key = BytesN::from_array(&s.env, s.sk.verifying_key().as_bytes());
    let r = s.client.try_open(&s.payer, &s.payee, &s.token.address, &0, &key, &2_000);
    assert_eq!(r, Err(Ok(e(Error::InvalidArgument))));
    let r = s.client.try_open(&s.payer, &s.payee, &s.token.address, &10, &key, &999);
    assert_eq!(r, Err(Ok(e(Error::InvalidArgument))));
    assert_eq!(s.client.try_get(&99), Err(Ok(e(Error::ChannelNotFound))));
}

fn e(x: Error) -> soroban_sdk::Error {
    x.into()
}
