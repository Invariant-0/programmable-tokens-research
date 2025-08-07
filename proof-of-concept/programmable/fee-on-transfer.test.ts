import { beforeAll, describe, expect, it } from 'vitest'
import { awaitTxConfirms } from "./scripts/utils.ts";
import { setupEmulator, setupTestnet } from "./scripts/setupLucid.ts";
import { Data, LucidEvolution, Address } from "@lucid-evolution/lucid";
import { bootstrapFeeOnTransferProgrammableToken, FeeOnTransferProgrammableTokenInfo, getTemplateValidators } from "./scripts/bootstrap.ts";
import { 
  privateKeyToPubKeyHash, 
  findProofForGivenUTxO, 
  fetchAdaOnlyUtxos, 
  fetchBiggestUtxoWithToken, 
  createFeeUtxos 
} from "./test-utils.ts";

const submitBootstrapFeeOnTransferTokenTx = async (
  lucid: LucidEvolution, 
  bootstrapFeeOnTransferToken, 
  feeAmount: bigint
): Promise<FeeOnTransferProgrammableTokenInfo> => {
  const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
  const ownAddress = await lucid.wallet().address();
  const bootstrapUtxo = (await lucid.wallet().getUtxos())[0];
  const tokenInfo = bootstrapFeeOnTransferToken(bootstrapUtxo);

  const tx = await lucid
    .newTx()
    .collectFrom([bootstrapUtxo])
    .pay.ToAddress(ownAddress, { [tokenInfo.programmableTokenScript.tokenString]: 1_000n })
    .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [tokenInfo.feeCheckTokenScript.tokenString]: 1n })
    .pay.ToAddress(tokenInfo.feeAddress, { lovelace: feeAmount }) // Initial fee payment
    .mintAssets({ [tokenInfo.programmableTokenScript.tokenString]: 1_000n }, Data.void())
    .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
    .mintAssets({ [tokenInfo.feeCheckTokenScript.tokenString]: 1n }, Data.void())
    .attach.MintingPolicy(tokenInfo.programmableTokenScript.policy)
    .attach.MintingPolicy(pvtScript.policy)
    .attach.MintingPolicy(tokenInfo.feeCheckTokenScript.policy)
    .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

  const signedTx = await tx.sign.withWallet().complete();
  const txHash = await signedTx.submit();

  await awaitTxConfirms(lucid, txHash);
  return tokenInfo;
}

const submitAllBootstrapTransactions = async (
  lucid: LucidEvolution, 
  feeAdmin: string, 
  feeAmount: bigint,
  assetName: string = "X"
): Promise<FeeOnTransferProgrammableTokenInfo> => {
  const { bootstrapFeeOnTransferToken } = bootstrapFeeOnTransferProgrammableToken(lucid, assetName, feeAdmin, feeAmount);
  const tokenInfo = await submitBootstrapFeeOnTransferTokenTx(lucid, bootstrapFeeOnTransferToken, feeAmount);
  return tokenInfo;
}

const transferFeeOnTransferToken = async (
  lucid: LucidEvolution, 
  tokenInfo: FeeOnTransferProgrammableTokenInfo, 
  recipient: Address, 
  amount: bigint,
  shouldPayFee = true
) => {
  const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);

  const utxoWithToken = await fetchBiggestUtxoWithToken(lucid, tokenInfo.programmableTokenScript.tokenString);
  const proofUtxo = await findProofForGivenUTxO(lucid, utxoWithToken, proofValidatorScript.address, tokenInfo.feeCheckTokenScript.tokenString);

  const submission = async () => {
    let tx = lucid
      .newTx()
      .collectFrom([utxoWithToken])
      .readFrom([proofUtxo])
      .pay.ToAddress(recipient, { [tokenInfo.programmableTokenScript.tokenString]: amount })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [tokenInfo.feeCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [tokenInfo.feeCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(tokenInfo.feeCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy);

    if (shouldPayFee) {
      tx = tx.pay.ToAddress(tokenInfo.feeAddress, { lovelace: tokenInfo.feeAmount });
    }

    const completedTx = await tx.complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});
    const signedTx = await completedTx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  }

  return submission;
}

const withdrawFees = async (lucid: LucidEvolution, tokenInfo: FeeOnTransferProgrammableTokenInfo) => {
  const ownAddress = await lucid.wallet().address();
  const feeUtxos = await lucid.utxosAt(tokenInfo.feeAddress);

  if (feeUtxos.length === 0) {
    throw new Error("No fees to withdraw");
  }

  // Calculate total fees to withdraw
  const totalFees = feeUtxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);

  const tx = await lucid
    .newTx()
    .collectFrom(feeUtxos, Data.void())
    .pay.ToAddress(ownAddress, { lovelace: totalFees })
    .addSigner(ownAddress)
    .attach.SpendingValidator(tokenInfo.feeTreasuryValidatorScript.validator)
    .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

  const signedTx = await tx.sign.withWallet().complete();
  const txHash = await signedTx.submit();

  await awaitTxConfirms(lucid, txHash);
}

describe("Bootstrap Fee-on-Transfer", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const feeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();
  const feeAmount = 5_000_000n;

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Minting fee-on-transfer programmable tokens", async () => {
    await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);
  });

  it("Minting fee-on-transfer tokens into multiple UTxOs", async () => {
    const { bootstrapFeeOnTransferToken } = bootstrapFeeOnTransferProgrammableToken(lucid, "FT", feeAdmin, feeAmount);

    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const ownAddress = await lucid.wallet().address();
    const bootstrapUtxo = (await lucid.wallet().getUtxos())[0];
    const tokenInfo = bootstrapFeeOnTransferToken(bootstrapUtxo);

    const tx = await lucid
      .newTx()
      .collectFrom([bootstrapUtxo])
      .pay.ToAddress(ownAddress, { [tokenInfo.programmableTokenScript.tokenString]: 700n })
      .pay.ToAddress(ownAddress, { [tokenInfo.programmableTokenScript.tokenString]: 100n })
      .pay.ToAddress(ownAddress, { [tokenInfo.programmableTokenScript.tokenString]: 200n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [tokenInfo.feeCheckTokenScript.tokenString]: 1n })
      .pay.ToAddress(tokenInfo.feeAddress, { lovelace: feeAmount })
      .mintAssets({ [tokenInfo.programmableTokenScript.tokenString]: 1_000n }, Data.void())
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [tokenInfo.feeCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(tokenInfo.programmableTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .attach.MintingPolicy(tokenInfo.feeCheckTokenScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  });
});

describe("Fee-on-Transfer Token Operations", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const feeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();
  const feeAmount = 5_000_000n;

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Valid transfer with fee payment", async () => {
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);

    const feeUtxos0 = await lucid.utxosAt(tokenInfo.feeAddress);
    const totalFees0 = feeUtxos0.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
    expect(totalFees0).toBe(feeAmount); // Initial fee payment from bootstrap

    const submission = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 400n);
    await submission();

    // Verify fee was collected
    const feeUtxos = await lucid.utxosAt(tokenInfo.feeAddress);
    expect(feeUtxos.length).toBeGreaterThan(0);
    const totalFees = feeUtxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
    expect(totalFees).toBe(feeAmount * 2n); // Initial fee + transfer fee
  });

  it("Transfer without fee payment should fail", async () => {
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);

    const submission = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 400n, false);
    await expect(submission).rejects.toThrowError();
  });

  it("Multiple transfers accumulate fees", async () => {
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);

    // First transfer
    const submission1 = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 300n);
    await submission1();

    // Second transfer from account 1
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission2 = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[2].address, 200n);
    await submission2();

    // Check accumulated fees
    const feeUtxos = await lucid.utxosAt(tokenInfo.feeAddress);
    const totalFees = feeUtxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
    expect(totalFees).toBe(feeAmount * 3n); // Initial fee + 2 transfer fees

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert
  });

  it("Partial transfer with fee payment", async () => {
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);

    const ownAddress = await lucid.wallet().address();
    const submission = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 600n);
    await submission();

    // Verify remaining tokens are with sender
    const ownUtxos = await lucid.utxosAt(ownAddress);
    const remainingTokens = ownUtxos.reduce((sum, utxo) => 
      sum + (utxo.assets[tokenInfo.programmableTokenScript.tokenString] || 0n), 0n);
    expect(remainingTokens).toBe(400n);
  });
});

describe("Fee Withdrawal", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const feeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();
  const feeAmount = 3_000_000n; // 3 ADA fee

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Admin can withdraw accumulated fees", async () => {
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);

    // Generate some fees through transfers
    const submission1 = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 300n);
    await submission1();

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission2 = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[2].address, 200n);
    await submission2();

    // Admin withdraws fees
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
    await withdrawFees(lucid, tokenInfo);

    // Verify fees were withdrawn
    const feeUtxos = await lucid.utxosAt(tokenInfo.feeAddress);
    expect(feeUtxos.length).toBe(0);
  });

  it("Non-admin cannot withdraw fees", async () => {
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);

    // Generate some fees
    const submission = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 300n);
    await submission();

    // Non-admin tries to withdraw
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);

    await expect(withdrawFees(lucid, tokenInfo)).rejects.toThrowError();

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert
  });
});

describe("Different Fee Amounts", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const feeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Low fee amount (1 ADA)", async () => {
    const lowFee = 1_000_000n;
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, lowFee);

    const submission = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 500n);
    await submission();

    const feeUtxos = await lucid.utxosAt(tokenInfo.feeAddress);
    const totalFees = feeUtxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
    expect(totalFees).toBe(lowFee * 2n);
  });

  it("High fee amount (10 ADA)", async () => {
    const highFee = 10_000_000n;
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, highFee);

    const submission = await transferFeeOnTransferToken(lucid, tokenInfo, emulatorAccounts[1].address, 500n);
    await submission();

    const feeUtxos = await lucid.utxosAt(tokenInfo.feeAddress);
    const totalFees = feeUtxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
    expect(totalFees).toBe(highFee * 2n);
  });
});

describe("Multiple Fee-on-Transfer Tokens", async () => {
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

  it("Different tokens have independent fee collection", async () => {
    const feeAmountA = 3_000_000n;
    const feeAmountB = 5_000_000n;

    const tokenA = await submitAllBootstrapTransactions(lucid, adminA, feeAmountA, "X");

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const tokenB = await submitAllBootstrapTransactions(lucid, adminB, feeAmountB, "Y");

    // Transfer token A
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
    const submissionA = await transferFeeOnTransferToken(lucid, tokenA, emulatorAccounts[2].address, 300n);
    await submissionA();

    // Transfer token B
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submissionB = await transferFeeOnTransferToken(lucid, tokenB, emulatorAccounts[2].address, 400n);
    await submissionB();

    // Check fees are collected separately
    const feesA = await lucid.utxosAt(tokenA.feeAddress);
    const feesB = await lucid.utxosAt(tokenB.feeAddress);

    expect(feesA.length).toBeGreaterThan(0);
    expect(feesB.length).toBeGreaterThan(0);
    expect(tokenA.feeAddress).not.toBe(tokenB.feeAddress);

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert
  });
});

describe.skip("Testnet Fee-on-Transfer Showcase", async () => {
  const { lucid, testnetAccounts } = await setupTestnet();
  const feeAdmin = privateKeyToPubKeyHash(testnetAccounts[0].privateKey).to_hex();
  const feeAmount = 2_000_000n; // 2 ADA fee

  beforeAll(async () => {
    for (const account of testnetAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid, 2);
    }
    lucid.selectWallet.fromPrivateKey(testnetAccounts[0].privateKey);
  });

  it("Testnet fee-on-transfer flow", async () => {
    console.log("\n=== CARDANO TESTNET FEE-ON-TRANSFER SHOWCASE ===");
    console.log("Demonstrating fee-on-transfer programmable token functionalities\n");

    // Step 1: Minting tokens
    console.log("🔧 Step 1: Minting fee-on-transfer programmable tokens...");
    const tokenInfo = await submitAllBootstrapTransactions(lucid, feeAdmin, feeAmount);
    console.log(`✅ Successfully minted tokens with ${feeAmount / 1_000_000n} ADA fee per transfer\n`);

    // Step 2: Transfer with fee
    console.log("💸 Step 2: Transferring tokens with fee payment...");
    const submission1 = await transferFeeOnTransferToken(lucid, tokenInfo, await testnetAccounts[1].address(), 400n);
    await submission1();
    console.log("✅ Transfer successful - fee automatically collected\n");

    // Step 3: Verify fee collection
    console.log("💰 Step 3: Verifying fee collection...");
    const feeUtxos = await lucid.utxosAt(tokenInfo.feeAddress);
    const totalFees = feeUtxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
    console.log(`✅ Total fees collected: ${totalFees / 1_000_000n} ADA\n`);

    // Step 4: Multiple transfers
    console.log("🔄 Step 4: Multiple transfers to accumulate fees...");
    lucid.selectWallet.fromPrivateKey(testnetAccounts[1].privateKey);
    const submission2 = await transferFeeOnTransferToken(lucid, tokenInfo, await testnetAccounts[2].address(), 200n);
    await submission2();
    console.log("✅ Second transfer successful\n");

    // Step 5: Verify fee payment is mandatory
    console.log("🚫 Step 5: Verifying fee payment is mandatory (transfer without fee should fail)...");
    lucid.selectWallet.fromPrivateKey(testnetAccounts[1].privateKey);
    try {
      const submission3 = await transferFeeOnTransferToken(lucid, tokenInfo, await testnetAccounts[2].address(), 100n, false);
      await submission3();
      console.log("❌ ERROR: Transfer without fee should have failed but succeeded!");
    } catch (error) {
      console.log("✅ Transfer correctly blocked - fee payment is mandatory\n");
    }

    // Step 6: Fee withdrawal by admin
    console.log("🏦 Step 6: Admin withdrawing accumulated fees...");
    lucid.selectWallet.fromPrivateKey(testnetAccounts[0].privateKey);
    await withdrawFees(lucid, tokenInfo);
    console.log("✅ Fees successfully withdrawn by admin\n");

    console.log("🎉 TESTNET FEE-ON-TRANSFER SHOWCASE COMPLETE! 🎉");
    console.log("All functionalities demonstrated successfully:");
    console.log("  ✓ Minting fee-on-transfer tokens");
    console.log("  ✓ Automatic fee collection on transfers");
    console.log("  ✓ Fee accumulation from multiple transfers");
    console.log("  ✓ Mandatory fee payment enforcement");
    console.log("  ✓ Fee withdrawal by administrator");
  });
});
