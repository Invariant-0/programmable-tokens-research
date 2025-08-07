import { beforeAll, describe, expect, it } from 'vitest'
import { awaitTxConfirms } from "./scripts/utils.ts";
import { setupEmulator, setupTestnet } from "./scripts/setupLucid.ts";
import { Data, LucidEvolution, Address } from "@lucid-evolution/lucid";
import { bootstrapBlacklistProgrammableToken, BlacklistProgrammableTokenInfo, BlacklistRefInfo, getTemplateValidators } from "./scripts/bootstrap.ts";
import { 
  privateKeyToPubKeyHash, 
  BlacklistDatum, 
  BlacklistRedeemer,
  findProofForGivenUTxO, 
  fetchAdaOnlyUtxos, 
  fetchBiggestUtxoWithToken, 
  createFeeUtxos 
} from "./test-utils.ts";

const submitBootstrapBlacklistRefTx = async (lucid: LucidEvolution, bootstrapBlacklistRef): Promise<BlacklistRefInfo> => {
  const adaOnlyUtxos = await fetchAdaOnlyUtxos(lucid);
  const refBootstrapUtxo = adaOnlyUtxos[0];
  const refInfo = bootstrapBlacklistRef(refBootstrapUtxo);

  const tx = await lucid
    .newTx()
    .collectFrom([refBootstrapUtxo])
    .pay.ToContract(
      refInfo.blacklistRefValidatorScript.address,
      { kind: "inline", value: Data.to({ blacklisted_pkhs: [] }, BlacklistDatum) },
      { [refInfo.blacklistRefValidityTokenScript.tokenString]: BigInt(1) },
    )
    .mintAssets({ [refInfo.blacklistRefValidityTokenScript.tokenString]: 1n }, Data.void())
    .attach.MintingPolicy(refInfo.blacklistRefValidityTokenScript.policy)
    .complete({presetWalletInputs: adaOnlyUtxos});

  try {
    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();
    await awaitTxConfirms(lucid, txHash);
  } catch (error) {
    throw new Error(`Transaction failed: ${JSON.stringify(error)}`);
  }

  return refInfo;
}

const submitBootstrapBlacklistProgrammableTokenTx = async (lucid: LucidEvolution, refInfo, bootstrapProgrammableToken): Promise<BlacklistProgrammableTokenInfo> => {
  const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
  const ownAddress = await lucid.wallet().address();
  const xBootstrapUtxo = (await lucid.wallet().getUtxos())[0];
  const xInfo = bootstrapProgrammableToken(refInfo, xBootstrapUtxo);

  const blacklistRefUtxo = (await lucid.utxosAt(xInfo.blacklistRefValidatorScript.address))[0];

  const tx = await lucid
    .newTx()
    .collectFrom([xBootstrapUtxo])
    .readFrom([blacklistRefUtxo])
    .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 1_000n })
    .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.blacklistCheckTokenScript.tokenString]: 1n })
    .mintAssets({ [xInfo.programmableTokenScript.tokenString]: 1_000n }, Data.void())
    .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
    .mintAssets({ [xInfo.blacklistCheckTokenScript.tokenString]: 1n }, Data.void())
    .attach.MintingPolicy(xInfo.programmableTokenScript.policy)
    .attach.MintingPolicy(pvtScript.policy)
    .attach.MintingPolicy(xInfo.blacklistCheckTokenScript.policy)
    .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

  const signedTx = await tx.sign.withWallet().complete();
  const txHash = await signedTx.submit();

  await awaitTxConfirms(lucid, txHash);
  return xInfo;
}

const submitAllBootstrapTransactions = async (lucid: LucidEvolution, blacklistAdmin: string, assetName: string = "BL"): Promise<BlacklistProgrammableTokenInfo> => {
  const { bootstrapBlacklistRef, bootstrapProgrammableToken } = bootstrapBlacklistProgrammableToken(lucid, assetName, blacklistAdmin);
  const refInfo = await submitBootstrapBlacklistRefTx(lucid, bootstrapBlacklistRef);
  const xInfo = await submitBootstrapBlacklistProgrammableTokenTx(lucid, refInfo, bootstrapProgrammableToken);
  return xInfo;
}

// Helper to get current blacklist for testing purposes
const getCurrentBlacklist = async (lucid: LucidEvolution, xInfo: BlacklistProgrammableTokenInfo): Promise<string[]> => {
  const blacklistRefUtxo = (await lucid.utxosAt(xInfo.blacklistRefValidatorScript.address))[0];
  if (!blacklistRefUtxo.datum) {
    throw new Error("Blacklist reference UTxO has no datum");
  }
  const currentBlacklist = Data.from(blacklistRefUtxo.datum, BlacklistDatum);
  return currentBlacklist.blacklisted_pkhs;
}

// Update blacklist by providing both input and output as expected by validator
const updateBlacklist = async (lucid: LucidEvolution, xInfo: BlacklistProgrammableTokenInfo, action: "blacklist" | "whitelist", targetPkh: string) => {
  const ownAddress = await lucid.wallet().address();
  const blacklistRefUtxo = (await lucid.utxosAt(xInfo.blacklistRefValidatorScript.address))[0];
  const adaOnlyUtxos = await fetchAdaOnlyUtxos(lucid);

  // Get current blacklist to calculate new state
  const currentBlacklist = await getCurrentBlacklist(lucid, xInfo);

  // Calculate new blacklist based on action
  const newBlacklist = action === "blacklist" 
    ? [...currentBlacklist, targetPkh]
    : currentBlacklist.filter(pkh => pkh !== targetPkh);

  const redeemer = action === "blacklist" 
    ? Data.to({ Blacklist: { 0: targetPkh } }, BlacklistRedeemer)
    : Data.to({ Whitelist: { 0: targetPkh } }, BlacklistRedeemer);

  const tx = await lucid
    .newTx()
    .collectFrom([blacklistRefUtxo], redeemer)
    .pay.ToContract(
      xInfo.blacklistRefValidatorScript.address,
      { kind: "inline", value: Data.to({ blacklisted_pkhs: newBlacklist }, BlacklistDatum) },
      { [xInfo.blacklistRefValidityTokenScript.tokenString]: 1n },
    )
    .addSigner(ownAddress)
    .attach.SpendingValidator(xInfo.blacklistRefValidatorScript.validator)
    .complete({presetWalletInputs: adaOnlyUtxos});

  const signedTx = await tx.sign.withWallet().complete();
  const txHash = await signedTx.submit();

  await awaitTxConfirms(lucid, txHash);
}

const transferBlacklistToken = async (lucid: LucidEvolution, xInfo: BlacklistProgrammableTokenInfo, recipient: Address, amount: bigint) => {
  const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);

  const blacklistRefUtxo = (await lucid.utxosAt(xInfo.blacklistRefValidatorScript.address))[0];
  const utxoWithToken = await fetchBiggestUtxoWithToken(lucid, xInfo.programmableTokenScript.tokenString);
  const proofUtxo = await findProofForGivenUTxO(lucid, utxoWithToken, proofValidatorScript.address, xInfo.blacklistCheckTokenScript.tokenString);

  const submission = async () => {
    const tx = await lucid
      .newTx()
      .collectFrom([utxoWithToken])
      .readFrom([blacklistRefUtxo, proofUtxo])
      .pay.ToAddress(recipient, { [xInfo.programmableTokenScript.tokenString]: amount })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.blacklistCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.blacklistCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.blacklistCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  }

  return submission;
}

describe("Bootstrap Blacklist", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const blacklistAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Creating blacklist ref input", async () => {
    const { bootstrapBlacklistRef } = bootstrapBlacklistProgrammableToken(lucid, "BL", blacklistAdmin);
    await submitBootstrapBlacklistRefTx(lucid, bootstrapBlacklistRef);
  })

  it("Minting blacklist programmable tokens", async () => {
    await submitAllBootstrapTransactions(lucid, blacklistAdmin);
  });

  it("Minting blacklist tokens into multiple UTxOs", async () => {
    const { bootstrapBlacklistRef, bootstrapProgrammableToken } = bootstrapBlacklistProgrammableToken(lucid, "BL", blacklistAdmin);
    const refInfo = await submitBootstrapBlacklistRefTx(lucid, bootstrapBlacklistRef);

    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const ownAddress = await lucid.wallet().address();
    const xBootstrapUtxo = (await lucid.wallet().getUtxos())[0];
    const xInfo = bootstrapProgrammableToken(refInfo, xBootstrapUtxo);

    const blacklistRefUtxo = (await lucid.utxosAt(xInfo.blacklistRefValidatorScript.address))[0];

    const tx = await lucid
      .newTx()
      .collectFrom([xBootstrapUtxo])
      .readFrom([blacklistRefUtxo])
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 700n })
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 100n })
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 200n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.blacklistCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [xInfo.programmableTokenScript.tokenString]: 1_000n }, Data.void())
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.blacklistCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.programmableTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .attach.MintingPolicy(xInfo.blacklistCheckTokenScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  });
});

describe("Blacklist Token Operations", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const blacklistAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Valid transfer to non-blacklisted address", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);

    const submission = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[1].address, 400n);
    await submission();
  });

  it("Transfer to blacklisted address should fail", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);
    const targetPkh = privateKeyToPubKeyHash(emulatorAccounts[1].privateKey).to_hex();

    // Blacklist the target address
    await updateBlacklist(lucid, xInfo, "blacklist", targetPkh);

    // Try to transfer to blacklisted address
    const submission = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[1].address, 400n);
    await expect(submission).rejects.toThrowError();
  });

  it("Transfer from blacklisted address should fail", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);

    // First transfer to account 1
    const submission1 = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[1].address, 400n);
    await submission1();

    // Blacklist account 1
    const targetPkh = privateKeyToPubKeyHash(emulatorAccounts[1].privateKey).to_hex();
    await updateBlacklist(lucid, xInfo, "blacklist", targetPkh);

    // Account 1 tries to transfer (should fail)
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission2 = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[2].address, 200n);
    await expect(submission2).rejects.toThrowError();

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert
  });

  it("Transfer between non-blacklisted addresses succeeds", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);

    // Transfer to account 1
    const submission1 = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[1].address, 400n);
    await submission1();

    // Account 1 transfers to account 2 (should succeed)
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission2 = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[2].address, 300n);
    await submission2();

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert
  });
});

describe("Blacklist Management", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const blacklistAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Admin can blacklist addresses", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);
    const targetPkh = privateKeyToPubKeyHash(emulatorAccounts[1].privateKey).to_hex();

    await updateBlacklist(lucid, xInfo, "blacklist", targetPkh);

    // Verify blacklist was updated
    const currentBlacklist = await getCurrentBlacklist(lucid, xInfo);
    expect(currentBlacklist).toContain(targetPkh);
  });

  it("Admin can whitelist addresses", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);
    const targetPkh = privateKeyToPubKeyHash(emulatorAccounts[1].privateKey).to_hex();

    // First blacklist
    await updateBlacklist(lucid, xInfo, "blacklist", targetPkh);

    // Then whitelist
    await updateBlacklist(lucid, xInfo, "whitelist", targetPkh);

    // Verify address was removed from blacklist
    const finalBlacklist = await getCurrentBlacklist(lucid, xInfo);
    expect(finalBlacklist).not.toContain(targetPkh);
  });

  it("Non-admin cannot modify blacklist", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);
    const targetPkh = privateKeyToPubKeyHash(emulatorAccounts[2].privateKey).to_hex();

    // Non-admin tries to blacklist
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);

    await expect(updateBlacklist(lucid, xInfo, "blacklist", targetPkh)).rejects.toThrowError();

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert
  });

  it("Blacklist -> transfer fails -> whitelist -> transfer succeeds", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);
    const targetPkh = privateKeyToPubKeyHash(emulatorAccounts[1].privateKey).to_hex();

    // Step 1: Initial transfer succeeds
    const submission1 = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[1].address, 300n);
    await submission1();

    // Step 2: Blacklist address
    await updateBlacklist(lucid, xInfo, "blacklist", targetPkh);

    // Step 3: Transfer to blacklisted address fails
    const submission2 = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[1].address, 200n);
    await expect(submission2).rejects.toThrowError();

    // Step 4: Whitelist address
    await updateBlacklist(lucid, xInfo, "whitelist", targetPkh);

    // Step 5: Transfer succeeds again
    const submission3 = await transferBlacklistToken(lucid, xInfo, emulatorAccounts[1].address, 200n);
    await submission3();
  });
});

describe("Multiple Blacklist Tokens", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const adminA = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();
  const adminB = privateKeyToPubKeyHash(emulatorAccounts[1].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Independent blacklists for different tokens", async () => {
    const tokenA = await submitAllBootstrapTransactions(lucid, adminA, "BLA");

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const tokenB = await submitAllBootstrapTransactions(lucid, adminB, "BLB");

    const targetPkh = privateKeyToPubKeyHash(emulatorAccounts[2].privateKey).to_hex();

    // Admin A blacklists address for token A only
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
    await updateBlacklist(lucid, tokenA, "blacklist", targetPkh);

    // Transfer token A to blacklisted address fails
    const submissionA = await transferBlacklistToken(lucid, tokenA, emulatorAccounts[2].address, 300n);
    await expect(submissionA).rejects.toThrowError();

    // Transfer token B to same address succeeds (independent blacklist)
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submissionB = await transferBlacklistToken(lucid, tokenB, emulatorAccounts[2].address, 400n);
    await submissionB();

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert
  });
});

describe.skip("Testnet Blacklist Showcase", async () => {
  const { lucid, testnetAccounts } = await setupTestnet();
  const blacklistAdmin = privateKeyToPubKeyHash(testnetAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of testnetAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid, 2);
    }
    lucid.selectWallet.fromPrivateKey(testnetAccounts[0].privateKey);
  });

  it("Testnet blacklist flow", async () => {
    console.log("\n=== CARDANO TESTNET BLACKLIST SHOWCASE ===");
    console.log("Demonstrating blacklist programmable token functionalities\n");

    // Step 1: Minting tokens
    console.log("🔧 Step 1: Minting blacklist programmable tokens...");
    const xInfo = await submitAllBootstrapTransactions(lucid, blacklistAdmin);
    console.log("✅ Successfully minted tokens with blacklist functionality\n");

    // Step 2: Transfer to non-blacklisted address
    console.log("💸 Step 2: Transferring tokens to non-blacklisted address...");
    const submission1 = await transferBlacklistToken(lucid, xInfo, await testnetAccounts[1].address(), 400n);
    await submission1();
    console.log("✅ Transfer successful - recipient not blacklisted\n");

    // Step 3: Blacklist an address
    console.log("🚫 Step 3: Admin blacklisting an address...");
    const targetPkh = privateKeyToPubKeyHash(testnetAccounts[2].privateKey).to_hex();
    await updateBlacklist(lucid, xInfo, "blacklist", targetPkh);
    console.log("✅ Address successfully blacklisted\n");

    // Step 4: Verify blacklisted transfer fails
    console.log("🚫 Step 4: Verifying transfer to blacklisted address fails...");
    try {
      const submission2 = await transferBlacklistToken(lucid, xInfo, await testnetAccounts[2].address(), 200n);
      await submission2();
      console.log("❌ ERROR: Transfer to blacklisted address should have failed!");
    } catch (error) {
      console.log("✅ Transfer correctly blocked - address is blacklisted\n");
    }

    // Step 5: Whitelist the address
    console.log("✅ Step 5: Admin whitelisting the address...");
    await updateBlacklist(lucid, xInfo, "whitelist", targetPkh);
    console.log("✅ Address successfully removed from blacklist\n");

    // Step 6: Transfer succeeds after whitelisting
    console.log("💸 Step 6: Verifying transfer succeeds after whitelisting...");
    const submission3 = await transferBlacklistToken(lucid, xInfo, await testnetAccounts[2].address(), 200n);
    await submission3();
    console.log("✅ Transfer successful - address no longer blacklisted\n");

    console.log("🎉 TESTNET BLACKLIST SHOWCASE COMPLETE! 🎉");
    console.log("All functionalities demonstrated successfully:");
    console.log("  ✓ Minting blacklist programmable tokens");
    console.log("  ✓ Transfers to non-blacklisted addresses");
    console.log("  ✓ Blacklisting addresses by administrator");
    console.log("  ✓ Blocking transfers involving blacklisted addresses");
    console.log("  ✓ Whitelisting addresses by administrator");
    console.log("  ✓ Restored transfers after whitelisting");
  });
});
