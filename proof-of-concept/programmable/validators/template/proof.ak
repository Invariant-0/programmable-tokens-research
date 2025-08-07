use aiken/collection/dict
use aiken/collection/list
use cardano/address.{Script}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{Input, Output, Transaction, find_script_outputs}

const pvt_asset_name = "PVT"

const max_pct_in_proof = 10

validator proof {
  spend(_datum: Option<Data>, _redeemer: Void, _o: Data, _tx: Data) {
    // Proof UTxO.
    // It is constant for all programmable tokens.
    // All programmable tokens X transferred in the transaction this UTxO was created in are valid iff:
    // - It contains the Proof Validity Token (PVT).
    // - Tokens X use programmable check PCT_X.
    // - PCT_X is inside this UTxO.

    // The validation never validates, meaning the proofs are never lost.
    // As mentioned in the whitepaper, this can be extended.
    False
  }

  mint(_redeemer: Void, own_policy_id: PolicyId, tx: Transaction) {
    // Proof Validity Token minting policy.
    // It is constant for all programmable tokens.
    // It checks the newly created proof and verifies that it can really prove all those programmable tokens.
    // Warning: This is the most critical part of the template of all programmable tokens.
    // Warning: It does not check that a proof is created for ALL programmable tokens contained in the transaction.
    // Warning: It also does not check that a particular PCT_X is correct for a programmable token X.
    expect [proof_output] = find_script_outputs(tx.outputs, own_policy_id)

    let pcts = get_proof_pcts(proof_output.value, own_policy_id)
    let programmable_checks =
      pcts
        |> list.all(
            fn(pct) {
              let (pct_policy_id, pct_asset_name, amount) = pct
              let x_policy_id = pct_asset_name

              and {
                amount == 1,
                // The programmable check minting policy is run, so the programmable check is enforced.
                quantity_of(tx.mint, pct_policy_id, x_policy_id) == 1,
              }
            },
          )

    // Helper structures so we can easily verify token history -- we can create proof only if all input tokens are valid
    let x_policy_to_pct =
      pcts
        |> list.map(
            fn((pct_policy_id, x_policy_id, _amount)) {
              Pair(x_policy_id, pct_policy_id)
            },
          )
        |> dict.from_pairs
    let proven_history =
      tx.reference_inputs
        |> list.filter(
            fn(ref) {
              and {
                quantity_of(ref.output.value, own_policy_id, pvt_asset_name) == 1,
                ref.output.address.payment_credential == Script(own_policy_id),
              }
            },
          )
        |> list.map(
            fn(ref) {
              let proof_pcts = get_proof_pcts(ref.output.value, own_policy_id)
              let proven_tokens_in_tx =
                proof_pcts
                  |> list.map(
                      fn((pct_policy_id, x_policy_id, _amount)) {
                        Pair(x_policy_id, pct_policy_id)
                      },
                    )
                  |> dict.from_pairs

              Pair(ref.output_reference.transaction_id, proven_tokens_in_tx)
            },
          )
        |> dict.from_pairs

    let history_checks =
      // The history is checked for every input's tokens individually
      tx.inputs
        |> list.all(
            fn(input) {
              input.output.value
                |> assets.policies
                |> list.all(
                    fn(x_policy_id) {
                      when dict.get(x_policy_to_pct, x_policy_id) is {
                        // No proof is created for x_policy_id in this transaction
                        None -> True
                        // A proof is created for x_policy_id, need to check history
                        Some(pct_policy_id) ->
                          when
                            dict.get(
                              proven_history,
                              input.output_reference.transaction_id,
                            )
                          is {
                            // There is no proof created in the transaction where the input was created, fail
                            None -> False
                            // There is a proof coming from the transaction, need to check that it contains relevant PCT_X
                            Some(proven_records) ->
                              ( proven_records |> dict.get(x_policy_id) ) == Some(
                                pct_policy_id,
                              )
                          }
                      }
                    },
                  )
            },
          )

    let unique_pct_per_x =
      pcts
        |> list.map(fn((_pct_policy_id, x_policy_id, _amount)) { x_policy_id })
        |> fn(all_x_policies) {
            (
              all_x_policies
                |> list.unique
                |> list.length
            ) == (
              all_x_policies
                |> list.length
            )
          }

    and {
      quantity_of(tx.mint, own_policy_id, pvt_asset_name) == 1,
      quantity_of(proof_output.value, own_policy_id, pvt_asset_name) == 1,
      programmable_checks,
      history_checks,
      unique_pct_per_x,
      ( pcts |> list.length ) < max_pct_in_proof,
    }
  }

  else(_) {
    fail
  }
}

// A valid proof contains Ada, single PVT and possibly multiple check tokens.
pub fn get_proof_pcts(value, pvt_policy_id) {
  value
    |> assets.add(pvt_policy_id, pvt_asset_name, -1)
    |> assets.without_lovelace
    |> assets.flatten
}
