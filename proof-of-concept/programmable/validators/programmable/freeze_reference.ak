use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Script}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}

pub type FreezableDatum {
  is_frozen: Bool,
}

pub const own_asset_name = "FREEZE"

validator freeze_reference(
  bootstrap_utxo_ref: OutputReference,
  owner: VerificationKeyHash,
) {
  spend(
    d: Option<FreezableDatum>,
    _redeemer: Void,
    own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(datum) = d
    expect Some(own_input) =
      list.find(tx.inputs, fn(input) { input.output_reference == own_ref })
    expect Script(own_policy_id) = own_input.output.address.payment_credential
    expect Some(new_output) =
      tx.outputs
        |> list.find(
            fn(output) {
              and {
                output.address == own_input.output.address,
                quantity_of(output.value, own_policy_id, own_asset_name) == 1,
              }
            },
          )

    expect InlineDatum(new_datum_raw) = new_output.datum
    expect new_datum: FreezableDatum = new_datum_raw

    and {
      // Only owner can freeze and unfreeze
      list.has(tx.extra_signatories, owner),
      // An action has to happen
      new_datum.is_frozen != datum.is_frozen,
      // Output has to be kept "light"
      ( new_output.value |> assets.policies |> list.length ) == 2,
    }
  }

  mint(_redeemer: Void, own_policy_id: PolicyId, tx: Transaction) {
    expect [Pair(asset_name, amount)] =
      tx.mint
        |> assets.tokens(own_policy_id)
        |> dict.to_pairs()
    expect Some(freeze_output) =
      tx.outputs
        |> list.find(
            fn(output) {
              quantity_of(output.value, own_policy_id, own_asset_name) == 1
            },
          )
    expect InlineDatum(freeze_datum_raw) = freeze_output.datum
    expect freeze_datum: FreezableDatum = freeze_datum_raw

    and {
      // This guarantees that only one such token will ever be created
      tx.inputs
        |> list.any(fn(input) { input.output_reference == bootstrap_utxo_ref }),
      // Check minted asset name and amount
      asset_name == own_asset_name,
      amount == 1,
      // Check newly created freeze output to be used as a reference input
      freeze_output.address.payment_credential == Script(own_policy_id),
      ( freeze_output.value |> assets.policies |> list.length ) == 2,
      freeze_datum.is_frozen == False,
    }
  }

  else(_) {
    fail
  }
}
