use aiken/collection/dict
use aiken/collection/list
use cardano/address.{Address}
use cardano/assets.{PolicyId, from_lovelace}
use cardano/transaction.{Transaction}

// Programmable Check Token for a single policy of fee-on-transfer programmable tokens (parameter).
// It checks that a fee-on-transfer UTxO is included in reference inputs and it is not currently frozen.
// Warning: The token can end up outside of a proof UTxO. It is harmless without a PVT.
validator fee_check(
  fee_fixed_address: Address,
  fee_fixed_lovelace_amount: Int,
  programmable_token_policy_id: PolicyId,
) {
  mint(_redeemer: Void, own_policy_id: PolicyId, tx: Transaction) {
    let fee_paid =
      tx.outputs
        |> list.any(
            fn(output) {
              and {
                output.address == fee_fixed_address,
                output.value == from_lovelace(fee_fixed_lovelace_amount),
              }
            },
          )

    expect [Pair(asset_name, amount)] =
      tx.mint
        |> assets.tokens(own_policy_id)
        |> dict.to_pairs()

    and {
      fee_paid,
      asset_name == programmable_token_policy_id,
      amount == 1,
    }
  }

  else(_) {
    fail
  }
}
