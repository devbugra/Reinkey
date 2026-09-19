# @reinkey/core

Reinkey protocol core: voucher encoding and signing, reason codes and the shared wire types. Used by [Reinkey Reins](../sdk/README.md) (`@reinkey/sdk`, agent side). Most applications should depend on that package, or on [Reinkey Meter](../meter/README.md) (`@reinkey/meter`, seller side), rather than on this one directly.

> **Status: pre-release.** Stellar **testnet only**, contracts **unaudited**, **not yet published to npm**; the install line below is what it will be.

```sh
npm i @reinkey/core
```

Node 20+. ESM only.

```ts
import { signVoucher, verifyVoucher, voucherPublicKey, bytesToHex, codeFromChainError } from "@reinkey/core";

const v = { networkPassphrase, channelContract: channelContractId, channelId: 7n, cumulative: 5000n };
const sig = signVoucher(v, secret);                       // ed25519 over the domain-separated voucher hash
verifyVoucher(v, sig, voucherPublicKey(secret));          // true
codeFromChainError("… Error(Contract, #7) …");            // "DAILY_CAP_EXCEEDED"
```

- **Vouchers** — `encodeVoucherMessage`, `hashVoucher`, `signVoucher`, `verifyVoucher`, `voucherPublicKey`. The message layout must match the channel contract byte for byte: domain `reinkey:voucher:v1`, network id, contract id, `u64` channel id, `i128` cumulative.
- **Reason codes** — `ACCOUNT_ERRORS`, `CHANNEL_ERRORS`, `CHAIN_ERRORS` (contract error numbers → names), `OFFCHAIN_CODES`, `codeFromChainError`, `chainCodeName`.
- **Types** — `PaymentRequired`, `ChannelRequirement`, `ExactRequirement`, `ChannelPayload`, `ChannelReceipt`, `ErrorBody`, `ChannelSnapshot`, `Unit`, `Source`.

## License

MIT
