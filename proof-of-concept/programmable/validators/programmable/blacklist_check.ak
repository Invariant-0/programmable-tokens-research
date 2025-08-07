use aiken/collection/dict
use aiken/collection/list
use cardano/address.{Address, VerificationKey}
use cardano/assets.{AssetName, PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, Transaction}
use programmable/blacklist_reference.{BlacklistDatum}

// Programmable Check Token for a single policy of blacklist-enabled programmable tokens (parameter).
// It checks that a Blacklist UTxO is included in reference inputs and verifies that no blacklisted addresses are involved in the transaction.
// Warning: The token can end up outside of a proof UTxO. It is harmless without a PVT.
validator blacklist_check(
  blacklist_validity_token_policy_id: PolicyId,
  blacklist_validity_token_asset_name: AssetName,
  programmable_token_policy_id: PolicyId,
) {
  mint(_redeemer: Void, own_policy_id: PolicyId, tx: Transaction) {
    // Find the blacklist reference UTxO
    expect Some(blacklist_ref_input) =
      tx.reference_inputs
        |> list.find(
            fn(ref) {
              quantity_of(
                ref.output.value,
                blacklist_validity_token_policy_id,
                blacklist_validity_token_asset_name,
              ) == 1
            },
          )

    // Extract the blacklist datum
    expect InlineDatum(blacklist_ref_datum_raw) =
      blacklist_ref_input.output.datum
    expect blacklist_ref_datum: BlacklistDatum = blacklist_ref_datum_raw

    // Extract credentials of all inputs or outputs that hold programmable tokens
    let relevant_credentials =
      tx.inputs
        |> list.map(fn(input) { input.output })
        |> list.concat(tx.outputs)
        |> list.filter_map(
            fn(output) {
              let has_programmable_tokens =
                (
                  output.value
                    |> assets.tokens(programmable_token_policy_id)
                    |> dict.to_pairs()
                    |> list.length
                ) > 0
              when has_programmable_tokens is {
                True -> {
                  expect VerificationKey(pkh) =
                    output.address.payment_credential
                  Some(pkh)
                }
                False -> None
              }
            },
          )

    // Check that none of the relevant credentials are blacklisted
    let forbidden_transfer =
      relevant_credentials
        |> list.any(
            fn(pkh) { list.has(blacklist_ref_datum.blacklisted_pkhs, pkh) },
          )

    // Validate the minted token
    expect [Pair(asset_name, amount)] =
      tx.mint
        |> assets.tokens(own_policy_id)
        |> dict.to_pairs()

    and {
      !forbidden_transfer,
      asset_name == programmable_token_policy_id,
      amount == 1,
    }
  }

  else(_) {
    fail
  }
}
