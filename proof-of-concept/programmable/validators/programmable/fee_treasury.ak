use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}

// Treasury for fee-on-transfer programmable tokens. All fees go here.
// It checks that the admin is a signatory of the transaction and doesn't care about anything else.
// The differentiator is used to make the validator unique, giving an address that is not used anywhere else.
validator fee_treasury(admin: VerificationKeyHash, _differentiator: ByteArray) {
  spend(
    _d: Option<Data>,
    _redeemer: Void,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    list.has(tx.extra_signatories, admin)
  }

  else(_) {
    fail
  }
}
