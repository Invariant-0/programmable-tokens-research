use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address, Script}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}

pub type BlacklistDatum {
  blacklisted_pkhs: List<VerificationKeyHash>,
}

pub type BlacklistRedeemer {
  Blacklist(VerificationKeyHash)
  Whitelist(VerificationKeyHash)
}

pub const own_asset_name = "BLACKLIST"

validator blacklist_reference(
  bootstrap_utxo_ref: OutputReference,
  owner: VerificationKeyHash,
) {
  spend(
    d: Option<BlacklistDatum>,
    redeemer: BlacklistRedeemer,
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
    expect new_datum: BlacklistDatum = new_datum_raw

    let expected_new_datum =
      when redeemer is {
        Blacklist(whom) ->
          BlacklistDatum {
            // we don't really care if the address is already blacklisted or not, it's an admin action
            blacklisted_pkhs: list.push(datum.blacklisted_pkhs, whom),
          }
        Whitelist(whom) ->
          BlacklistDatum {
            // we don't really care if the address was actually blacklisted or not, it's an admin action
            blacklisted_pkhs: list.filter(
              datum.blacklisted_pkhs,
              fn(pk) { pk != whom },
            ),
          }
      }

    and {
      // Only owner can update the blacklist
      list.has(tx.extra_signatories, owner),
      // An action has to happen
      new_datum == expected_new_datum,
      // Output has to be kept "light"
      ( new_output.value |> assets.policies |> list.length ) == 2,
    }
  }

  mint(_redeemer: Void, own_policy_id: PolicyId, tx: Transaction) {
    expect [Pair(asset_name, amount)] =
      tx.mint
        |> assets.tokens(own_policy_id)
        |> dict.to_pairs()
    expect Some(blacklist_output) =
      tx.outputs
        |> list.find(
            fn(output) {
              quantity_of(output.value, own_policy_id, own_asset_name) == 1
            },
          )
    expect InlineDatum(blacklist_datum_raw) = blacklist_output.datum
    expect blacklist_datum: BlacklistDatum = blacklist_datum_raw

    and {
      // This guarantees that only one such token will ever be created
      tx.inputs
        |> list.any(fn(input) { input.output_reference == bootstrap_utxo_ref }),
      // Check minted asset name and amount
      asset_name == own_asset_name,
      amount == 1,
      // Check newly created freeze output to be used as a reference input
      blacklist_output.address.payment_credential == Script(own_policy_id),
      ( blacklist_output.value |> assets.policies |> list.length ) == 2,
      blacklist_datum.blacklisted_pkhs == [],
    }
  }

  else(_) {
    fail
  }
}
