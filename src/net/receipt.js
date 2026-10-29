import { encode } from "../sim/cbor.js";
import { pubkeyHex, receiptBody } from "../sim/keeper.js";
import { signBytes } from "./identity.js";

export function signReceipt(identity, ledger, now) {
  const body = receiptBody(ledger, now);
  const signed = signBytes(identity, encode(body));
  return {
    body,
    sig: pubkeyHex(signed.sig),
    pubkey: pubkeyHex(signed.pubkey),
  };
}
