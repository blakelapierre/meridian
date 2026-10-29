# MERIDIAN
## Keepers

A keeper is a client with no body and no picture. It stays in a cell, checks terrain proposals, and remembers the ops it accepted. Players run one so the crust still certifies when they are the only person awake.

The client is [tools/archive/index.html](../tools/archive/index.html). `npm start`, then open [http://127.0.0.1:8080/tools/archive/](http://127.0.0.1:8080/tools/archive/). It announces `role: archive` on the lighthouse. A walk tab answers that peer and sends digs to it. The lighthouse still does not see the ops.

A keeper does not dig, shoot, or hold a strike body. It votes yes only when the same edit check a player uses would pass. A late second vote is ignored by the digger, so two keepers do not stall the trench.

## Keep

Keep is not metal and not scrip. The archive key earns it.

| Event | Keep |
|---|---|
| A terrain vote this archive signed | 1 |
| Ten minutes linked to at least one player | 1 |
| A checkpoint a joiner accepts | 5 |

## In-game bonus

Every 30 keep, the receipt may claim one crate: **2 metal** and **1 fiber**. The next 30 keep can claim another. Keep is not spent. The crate is a gate, so a long-running archive does not mint a pile.

The archive page records the claim. It does not add the metal to a backpack. A player quorum accepts the signed receipt, then pays the crate to the player key named in that acceptance. Until that op exists, the crate is a claim, not a balance.

## Real-world bounty

The client does not send money. It signs a receipt: the archive pubkey, the keep, the votes, the presence, and the ops it holds.

Suggested rate, which a treasurer may change by publishing a new one:

| | |
|---|---|
| Rate | $0.02 per keep |
| Cap | $40 per pubkey per quarter |
| Proof | The signed receipt, plus a checkpoint another archive or a player still holds |
| Paid to | An address the operator publishes out of band. It is not a field in the game. |

A receipt that disagrees with a checkpoint other keepers hold is refused. One payout address per pubkey per quarter. No treasury in this repository means the receipt is the claim, not a payment.
