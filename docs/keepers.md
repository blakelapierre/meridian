# MERIDIAN
## Keepers

A keeper is a client with no body and no picture. It mines a proof-of-work chain. That chain is what makes a hole official. A vote can show the pit early. The block is the decision.

The client is [tools/archive/index.html](../tools/archive/index.html). `npm start`, then open [http://127.0.0.1:8080/tools/archive/](http://127.0.0.1:8080/tools/archive/). It announces `role: archive` on the lighthouse. A walk tab answers. Digs are still predicted locally. The archive mines a checked proposal even before the vote seals. When the block arrives, every linked client draws that tip, including one that never voted. A heavier chain replaces it. A hole you dug yourself stays on your screen until a block includes it. The walk line changes from `provisional` to `official`.

A block commits the edits since the previous tip, the chunk hash those edits produce, and a nonce. The hash of that block must have **16** leading zero bits. A heavier chain wins. Weight is `2^(bits - 8)`, so one harder block can outrank several easier ones. Ties break toward the lower block id. An empty block, a skipped seq, or a hash that does not replay is refused. The lighthouse still does not see the blocks.

## Keep

Keep is the block reward. It is not metal and not scrip. A vote, a checkpoint, and time spent linked do not mint it.

| Event | Keep |
|---|---|
| A block this key mined that is still an ancestor of the heaviest tip | 10 |

A fork that loses pays nothing. The receipt is recomputed from the tip, so an orphaned block drops off the score.

## In-game bonus

Every 30 keep, which is three blocks that are still canonical, the receipt may claim one crate: **2 metal** and **1 fiber**. The next three blocks can claim another. Keep is not spent.

The archive page records the claim. It does not add the metal to a backpack. A later acceptance pays the crate to the player key named with the receipt. Until that happens, the crate is a claim, not a balance.

## Real-world bounty

The client does not send money. It signs a receipt: the archive pubkey, the keep, the blocks, the height, and the tip it is standing on.

Suggested rate, which a treasurer may change by publishing a new one:

| | |
|---|---|
| Rate | $0.02 per keep, so $0.20 a canonical block |
| Cap | $40 per pubkey per quarter |
| Proof | The signed receipt, plus the blocks another archive or a player still holds on the heaviest chain |
| Paid to | An address the operator publishes out of band. It is not a field in the game. |

A receipt whose blocks are not on the heaviest chain is refused. One payout address per pubkey per quarter. No treasury in this repository means the receipt is the claim, not a payment.
