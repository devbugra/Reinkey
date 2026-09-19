// /demo/chat yedek modu: sahnede okunacak ~600 token'lık hazır metin.
// Token = bir kelime ve ardındaki boşluk.

export const FALLBACK_TEXT = `Every time an AI agent pays for something today, it waits. On most networks a single payment is a full transaction: it is built, signed, broadcast, and then the agent sits idle until a ledger closes. On Stellar that is about five seconds. Five seconds is fast for a person buying coffee. It is an eternity for an agent that wants to read an order book twenty times a minute, or pay a language model for every token it streams back.

The x402 protocol gave the web a native way to charge for a request. A server answers with status 402, Payment Required, and tells the client exactly what to pay, in which asset, and to whom. The client pays and retries. No accounts, no API keys, no invoices. But when every call is its own on-chain payment, the latency and the fees scale with every request, and the chain becomes the bottleneck of the conversation.

Reinkey brings metered x402 to Stellar. The idea is old and proven: a payment channel. The agent opens a channel once, in a single Soroban transaction, and locks a small USDC deposit inside a contract. From then on, every call carries an off-chain voucher, signed by a key the channel knows. The voucher does not say pay five hundred stroops. It says, in total, I owe this much from this channel. Because the amount is cumulative and only ever increases, there is nothing to double spend. The seller keeps only the latest voucher, and the latest voucher is always worth the most.

Verification happens in memory. The facilitator checks the signature, checks that the total went up by at least the price, checks that it does not exceed the deposit, and answers in a few milliseconds. The chain is not involved at all. Then, periodically, the facilitator takes the highest voucher it has seen and submits a single claim transaction. The contract verifies the same signature, pays the seller the difference, and records the new total. Four hundred paid calls, one transaction.

Safety comes from the deposit, not from trust. The seller can never claim more than the agent locked, and the agent can never spend more than it deposited. When the channel expires, the agent can close it and take back whatever was not claimed. The facilitator pays the network fees, so the agent does not even need to hold lumens.

This is why the stream you are reading right now is being paid for token by token. Every fifty tokens, the server pauses and asks for the next slice. The agent signs a new voucher, a slightly larger number, and the words keep flowing. No transaction, no waiting, no ledger. If the agent runs out of deposit, the server simply stops, even in the middle of a sentence, because nothing unpaid is ever delivered.

Agents are starting to spend money on their own. They buy data, compute, inference, and each other's services. They need payments that move at the speed of software, with limits that software cannot talk its way around. Stellar gives us cheap settlement, fee sponsorship, and programmable accounts. Payment channels give us speed. Together they make it possible to pay for the internet one request, and one token, at a time, while the chain still has the final word on every cent that moves.

That is the whole trick. Lock once, sign many times, settle rarely, and let the contract enforce the rules. Thank you for listening, and thank you for paying attention, quite literally, one token at a time.`;

export function fallbackTokens(): string[] {
  return FALLBACK_TEXT.match(/\S+\s*/g) ?? [];
}
