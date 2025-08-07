use aiken/collection/dict
use aiken/collection/list
use cardano/assets.{AssetName, PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, Transaction}
use programmable/freeze_reference.{FreezableDatum}

// Programmable Check Token for a single policy of freezable programmable tokens (parameter).
// It checks that a Freeze UTxO is included in reference inputs and it is not currently frozen.
// Warning: The token can end up outside of a proof UTxO. It is harmless without a PVT.
validator freezable_check(
  freeze_validity_token_policy_id: PolicyId,
  freeze_validity_token_asset_name: AssetName,
  programmable_token_policy_id: PolicyId,
) {
  mint(_redeemer: Void, own_policy_id: PolicyId, tx: Transaction) {
    expect Some(freeze_ref_input) =
      tx.reference_inputs
        |> list.find(
            fn(ref) {
              quantity_of(
                ref.output.value,
                freeze_validity_token_policy_id,
                freeze_validity_token_asset_name,
              ) == 1
            },
          )

    expect InlineDatum(freeze_ref_datum_raw) = freeze_ref_input.output.datum
    expect freeze_ref_datum: FreezableDatum = freeze_ref_datum_raw

    expect [Pair(asset_name, amount)] =
      tx.mint
        |> assets.tokens(own_policy_id)
        |> dict.to_pairs()

    and {
      !freeze_ref_datum.is_frozen,
      asset_name == programmable_token_policy_id,
      amount == 1,
    }
  }

  else(_) {
    fail
  }
}
