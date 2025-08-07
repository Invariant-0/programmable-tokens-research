use aiken/collection/dict
use aiken/collection/list
use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}

// Simple minting validation checking that the token is created in exactly 1k quantity and only once.
// Note that no transfer validation is implemented here, it cannot be here.
// P.S.: It could be extended such that it implements CIP-68.
validator programmable_token(bootstrap_utxo_ref: OutputReference) {
  mint(_redeemer: Void, own_policy_id: PolicyId, tx: Transaction) {
    // Asset name is unchecked, but there is only a single asset name. Allows us to visually differentiate in the off-chain
    expect [Pair(_asset_name, amount)] =
      tx.mint
        |> assets.tokens(own_policy_id)
        |> dict.to_pairs()
    and {
      // This guarantees that only one such token will ever be created
      tx.inputs
        |> list.any(fn(input) { input.output_reference == bootstrap_utxo_ref }),
      // Check minted asset amount
      amount == 1_000,
    }
  }

  else(_) {
    fail
  }
}
