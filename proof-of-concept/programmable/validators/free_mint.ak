use cardano/transaction.{Transaction}

// This is just a simple policy to mint unique tokens.
// Nothing special here, anyone can mint the tokens anytime.
// Just for simplicity :)
validator free_mint(_parametrize_with_random_word: ByteArray) {
  mint(_redeemer: Void, _p: Data, _tx: Transaction) {
    True
  }

  else(_) {
    fail
  }
}
