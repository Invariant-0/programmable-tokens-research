import { beforeAll, describe, expect, it } from 'vitest'
import { awaitTxConfirms } from "./scripts/utils.ts";
import { setupEmulator, setupTestnet } from "./scripts/setupLucid.ts";
import { Data, UTxO, LucidEvolution, Address } from "@lucid-evolution/lucid";
import { bootstrapFreezableProgrammableToken, FreezableProgrammableTokenInfo, FreezableRefInfo, getTemplateValidators } from "./scripts/bootstrap.ts";
import { 
  privateKeyToPubKeyHash, 
  FreezableDatum, 
  findProofForGivenUTxO, 
  fetchAdaOnlyUtxos, 
  fetchBiggestUtxoWithToken, 
  createFeeUtxos 
} from "./test-utils.ts";

const fetchBiggestUtxoWithX = async (lucid: LucidEvolution, xInfo: FreezableProgrammableTokenInfo): Promise<UTxO> => {
  return fetchBiggestUtxoWithToken(lucid, xInfo.programmableTokenScript.tokenString);
}

const submitBootstrapRefTx = async (lucid: LucidEvolution, bootstrapFreezableRef): Promise<FreezableRefInfo> => {
  const adaOnlyUtxos = await fetchAdaOnlyUtxos(lucid);
  const refBootstrapUtxo = adaOnlyUtxos[0];
  const refInfo = bootstrapFreezableRef(refBootstrapUtxo);

  const tx = await lucid
    .newTx()
    .collectFrom([refBootstrapUtxo])
    .pay.ToContract(
      refInfo.freezeRefValidatorScript.address,
      { kind: "inline", value: Data.to({ is_frozen: false }, FreezableDatum) },
      { [refInfo.freezeRefValidityTokenScript.tokenString]: BigInt(1) },
    )
    .mintAssets({ [refInfo.freezeRefValidityTokenScript.tokenString]: 1n }, Data.void())
    .attach.MintingPolicy(refInfo.freezeRefValidityTokenScript.policy)
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

const submitBootstrapProgrammableTokenTx = async (lucid: LucidEvolution, refInfo, bootstrapProgrammableToken): Promise<FreezableProgrammableTokenInfo> => {
  const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
  const ownAddress = await lucid.wallet().address();
  const xBootstrapUtxo = (await lucid.wallet().getUtxos())[0];
  const xInfo = bootstrapProgrammableToken(refInfo, xBootstrapUtxo);

  const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];

  const tx = await lucid
    .newTx()
    .collectFrom([xBootstrapUtxo])
    .readFrom([freezeRefUtxo])
    .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 1_000n })
    .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
    .mintAssets({ [xInfo.programmableTokenScript.tokenString]: 1_000n }, Data.void())
    .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
    .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
    .attach.MintingPolicy(xInfo.programmableTokenScript.policy)
    .attach.MintingPolicy(pvtScript.policy)
    .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
    .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

  const signedTx = await tx.sign.withWallet().complete();
  const txHash = await signedTx.submit();

  await awaitTxConfirms(lucid, txHash);
  return xInfo;
}

const submitAllBootstrapTransactions = async (lucid: LucidEvolution, freezeAdmin: string, assetName: string = "X"): Promise<FreezableProgrammableTokenInfo> => {
  const { bootstrapFreezableRef, bootstrapProgrammableToken } = bootstrapFreezableProgrammableToken(lucid, assetName, freezeAdmin);
  const refInfo = await submitBootstrapRefTx(lucid, bootstrapFreezableRef);
  const xInfo = await submitBootstrapProgrammableTokenTx(lucid, refInfo, bootstrapProgrammableToken);
  return xInfo;
}



describe("Bootstrap", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const freezeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Creating freezable ref input", async () => {
    const { bootstrapFreezableRef } = bootstrapFreezableProgrammableToken(lucid, "X", freezeAdmin);
    await submitBootstrapRefTx(lucid, bootstrapFreezableRef);
  })

  it("Minting programmable tokens X", async () => {
    await submitAllBootstrapTransactions(lucid, freezeAdmin);
  });

  it("Minting programmable tokens X into multiple UTxOs", async () => {
    const { bootstrapFreezableRef, bootstrapProgrammableToken } = bootstrapFreezableProgrammableToken(lucid, "X", freezeAdmin);
    const refInfo = await submitBootstrapRefTx(lucid, bootstrapFreezableRef);

    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const ownAddress = await lucid.wallet().address();
    const xBootstrapUtxo = (await lucid.wallet().getUtxos())[0];
    const xInfo = bootstrapProgrammableToken(refInfo, xBootstrapUtxo);

    const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];

    const tx = await lucid
      .newTx()
      .collectFrom([xBootstrapUtxo])
      .readFrom([freezeRefUtxo])
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 700n })
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 100n })
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 200n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [xInfo.programmableTokenScript.tokenString]: 1_000n }, Data.void())
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.programmableTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  });
});

describe("Sending programmable tokens", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const freezeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  })

  it("Transferring all X to another account - valid transfer", async () => {
    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    const ownAddress = await lucid.wallet().address();
    const ownUtxos = await lucid.utxosAt(ownAddress);
    const utxoWithX = ownUtxos.find((utxo) => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0)!;

    const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];
    const proofUtxo = await findProofForGivenUTxO(lucid, utxoWithX, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);

    const tx = await lucid
      .newTx()
      .collectFrom([utxoWithX])
      .readFrom([freezeRefUtxo, proofUtxo])
      .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 1_000n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .attach.SpendingValidator(proofValidatorScript.validator)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  });

  it("Transferring all X to another account - trying to create proof but not referencing previous", async () => {
    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    const ownAddress = await lucid.wallet().address();
    const ownUtxos = await lucid.utxosAt(ownAddress);
    const utxoWithX = ownUtxos.find((utxo) => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0)!;

    const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];

    const submission = async () => {
      const tx = await lucid
        .newTx()
        .collectFrom([utxoWithX])
        .readFrom([freezeRefUtxo])
        .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 1_000n })
        .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
        .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
        .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
        .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
        .attach.MintingPolicy(pvtScript.policy)
        .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

      const signedTx = await tx.sign.withWallet().complete();
      const txHash = await signedTx.submit();

      await awaitTxConfirms(lucid, txHash);
    };

    await expect(submission).rejects.toThrowError();
  });

  it("Transferring all X to another account - invalid transfer", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);
    const utxoWithX = await fetchBiggestUtxoWithX(lucid, xInfo);

    const tx = await lucid
      .newTx()
      .collectFrom([utxoWithX])
      .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 1_000n })
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  });

  it("Transferring part of X to another account - invalid transfer", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);
    const ownAddress = await lucid.wallet().address();
    const utxoWithX = await fetchBiggestUtxoWithX(lucid, xInfo);

    const tx = await lucid
      .newTx()
      .collectFrom([utxoWithX])
      .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 500n })
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 500n })
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  });

  it("Transferring part of X to another account - valid transfer", async () => {
    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    const ownAddress = await lucid.wallet().address();
    const ownUtxos = await lucid.utxosAt(ownAddress);
    const utxoWithX = ownUtxos.find((utxo) => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0)!;

    const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];
    const proofUtxo = await findProofForGivenUTxO(lucid, utxoWithX, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);

    const tx = await lucid
      .newTx()
      .collectFrom([utxoWithX])
      .readFrom([freezeRefUtxo, proofUtxo])
      .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 400n })
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 600n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  });

  it("Multiple transfers of X through multiple accounts - valid transfers", async () => {
    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    // Step 1: {acc0 = 1_000} -> {acc0 = 600, acc1 = 400}
    const ownAddress = await lucid.wallet().address();
    const ownUtxos = await lucid.utxosAt(ownAddress);
    const utxoWithX = ownUtxos.find((utxo) => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0)!;

    const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];
    const proofUtxo = await findProofForGivenUTxO(lucid, utxoWithX, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);

    const tx = await lucid
      .newTx()
      .collectFrom([utxoWithX])
      .readFrom([freezeRefUtxo, proofUtxo])
      .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 400n })
      .pay.ToAddress(ownAddress, { [xInfo.programmableTokenScript.tokenString]: 600n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);

    // Step 2: {acc0 = 600, acc1 = 400} -> {acc1 = 400, acc2 = 600}
    const ownUtxos2 = await lucid.utxosAt(ownAddress);
    const utxoWithX2 = ownUtxos2.find((utxo) => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0)!;
    const proofUtxo2 = await findProofForGivenUTxO(lucid, utxoWithX2, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);

    const tx2 = await lucid
      .newTx()
      .collectFrom([utxoWithX2])
      .readFrom([freezeRefUtxo, proofUtxo2!])
      .pay.ToAddress(emulatorAccounts[2].address, { [xInfo.programmableTokenScript.tokenString]: 600n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx2 = await tx2.sign.withWallet().complete();
    const txHash2 = await signedTx2.submit();

    await awaitTxConfirms(lucid, txHash2);

    // Step 3: {acc1 = 400, acc2 = 600} -> {acc1 = 100, acc2 = 900}
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey); // Temp. as acc1 is the actor in this step

    const ownAddress3 = await lucid.wallet().address();
    const ownUtxos3 = await lucid.utxosAt(ownAddress3);
    const utxoWithX3 = ownUtxos3.find((utxo) => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0)!;
    const proofUtxo3 = await findProofForGivenUTxO(lucid, utxoWithX3, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);

    const tx3 = await lucid
      .newTx()
      .collectFrom([utxoWithX3])
      .readFrom([freezeRefUtxo, proofUtxo3!])
      .pay.ToAddress(emulatorAccounts[2].address, { [xInfo.programmableTokenScript.tokenString]: 300n })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx3 = await tx3.sign.withWallet().complete();
    const txHash3 = await signedTx3.submit();

    await awaitTxConfirms(lucid, txHash3);

    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert back
  });
});

const updateIsFrozen = async (lucid: LucidEvolution, xInfo: FreezableProgrammableTokenInfo, newIsFrozen: boolean) => {
  const ownAddress = await lucid.wallet().address();
  const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];
  const adaOnlyUtxos = await fetchAdaOnlyUtxos(lucid);
  const tx = await lucid
    .newTx()
    .collectFrom([freezeRefUtxo], Data.void())
    .pay.ToContract(
      xInfo.freezeRefValidatorScript.address,
      { kind: "inline", value: Data.to({ is_frozen: newIsFrozen }, FreezableDatum) },
      { [xInfo.freezeRefValidityTokenScript.tokenString]: 1n },
    )
    .addSigner(ownAddress)
    .attach.SpendingValidator(xInfo.freezeRefValidatorScript.validator)
    .complete({presetWalletInputs: adaOnlyUtxos});

  const signedTx = await tx.sign.withWallet().complete();
  const txHash = await signedTx.submit();

  await awaitTxConfirms(lucid, txHash);
}

const transferX = async (lucid: LucidEvolution, xInfo: FreezableProgrammableTokenInfo, recipient: Address, amount: bigint) => {
  const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);

  const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];
  const utxoWithX = await fetchBiggestUtxoWithX(lucid, xInfo);
  const proofUtxo = await findProofForGivenUTxO(lucid, utxoWithX, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);

  const submission = async () => {
    const tx = await lucid
      .newTx()
      .collectFrom([utxoWithX])
      .readFrom([freezeRefUtxo, proofUtxo])
      .pay.ToAddress(recipient, { [xInfo.programmableTokenScript.tokenString]: amount })
      .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
      .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
      .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
      .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
      .attach.MintingPolicy(pvtScript.policy)
      .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    await awaitTxConfirms(lucid, txHash);
  }

  // Return the function so it can be asserted to fail if desired
  return submission;
}

describe("Freeze functionality", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const freezeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  })

  it("Admin can freeze", async () => {
    // Acc0 is the admin
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);
    await updateIsFrozen(lucid, xInfo, true);
  });

  it("Non-admin can NOT freeze", async () => {
    // Acc0 is the admin
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    // Acc1 is the actor in this step, he is NOT the admin
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);

    const submission = async () => {
      await updateIsFrozen(lucid, xInfo, true);
    }

    await expect(submission).rejects.toThrowError();

     // Revert back
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Admin can freeze and unfreeze", async () => {
    // Acc0 is the admin
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    // Step 1: Freeze
    await updateIsFrozen(lucid, xInfo, true);

    // Step 2: Unfreeze
    await updateIsFrozen(lucid, xInfo, false);
  });

  it("No valid transfer when frozen", async () => {
    // Acc0 is the admin
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    // Step 1: Freeze
    await updateIsFrozen(lucid, xInfo, true);

    // Step 2: Attempt transfer
    const submission = await transferX(lucid, xInfo, emulatorAccounts[1].address, 500n);
    await expect(submission).rejects.toThrowError();
  });

  it("Transfer -> freeze -> no transfer -> unfreeze -> transfer", async () => {
    // Acc0 is the admin
    const xInfo = await submitAllBootstrapTransactions(lucid, freezeAdmin);

    // Step 1: Transfer
    const submission0 = await transferX(lucid, xInfo, emulatorAccounts[1].address, 500n);
    await submission0();

    // Step 2: Freeze
    await updateIsFrozen(lucid, xInfo, true);

    // Step 3: Attempt transfer when frozen
    const submission3 = await transferX(lucid, xInfo, emulatorAccounts[1].address, 100n);
    await expect(submission3).rejects.toThrowError();

    // Step 4: Unfreeze
    await updateIsFrozen(lucid, xInfo, false);

    // Step 5: Transfer freely since it's unfrozen already
    const submission5 = await transferX(lucid, xInfo, emulatorAccounts[2].address, 400n);
    await submission5();
  });
});

const transferXY = async (lucid: LucidEvolution, xInfo: FreezableProgrammableTokenInfo, yInfo: FreezableProgrammableTokenInfo, recipient: Address, xAmount: bigint, yAmount: bigint) => {
  const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);

    const freezeRefUtxoX = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];
    const freezeRefUtxoY = (await lucid.utxosAt(yInfo.freezeRefValidatorScript.address))[0];
    const utxoWithX = await fetchBiggestUtxoWithX(lucid, xInfo);
    const utxoWithY = await fetchBiggestUtxoWithX(lucid, yInfo);
    const proofUtxoX = await findProofForGivenUTxO(lucid, utxoWithX, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);
    const proofUtxoY = await findProofForGivenUTxO(lucid, utxoWithY, proofValidatorScript.address, yInfo.freezableCheckTokenScript.tokenString);

    const submission = async () => {
      const tx = await lucid
        .newTx()
        .collectFrom([utxoWithX, utxoWithY])
        .readFrom([freezeRefUtxoX, freezeRefUtxoY, proofUtxoX, proofUtxoY])
        .pay.ToAddress(recipient, { [xInfo.programmableTokenScript.tokenString]: xAmount })
        .pay.ToAddress(recipient, { [yInfo.programmableTokenScript.tokenString]: yAmount })
        .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n, [yInfo.freezableCheckTokenScript.tokenString]: 1n })
        .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
        .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
        .mintAssets({ [yInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
        .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
        .attach.MintingPolicy(yInfo.freezableCheckTokenScript.policy)
        .attach.MintingPolicy(pvtScript.policy)
        .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

      const signedTx = await tx.sign.withWallet().complete();
      const txHash = await signedTx.submit();

      await awaitTxConfirms(lucid, txHash);
    }

    return submission;
}

describe("Multiple freezable programmable tokens X, Y", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const xFreezeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();
  const yFreezeAdmin = privateKeyToPubKeyHash(emulatorAccounts[1].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  })

  it("Freezing one token does not freeze another programmable token", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);
    const yInfo = await submitAllBootstrapTransactions(lucid, yFreezeAdmin);

    // Step 1: Transfer both tokens separately
    const submission0 = await transferX(lucid, xInfo, emulatorAccounts[1].address, 500n);
    await submission0();

    const submission1 = await transferX(lucid, yInfo, emulatorAccounts[1].address, 500n);
    await submission1();

    // Step 2: Freeze first token only
    await updateIsFrozen(lucid, xInfo, true);

    // Step 3: Transferring frozen token X fails
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission3 = await transferX(lucid, xInfo, emulatorAccounts[2].address, 200n);
    await expect(submission3).rejects.toThrowError();

    // Step 4: Transferring non-frozen token Y succeeds
    const submission4 = await transferX(lucid, yInfo, emulatorAccounts[2].address, 200n);
    await submission4();

    // Step 5: Unfreeze token X
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
    await updateIsFrozen(lucid, xInfo, false);
  });

  it("Can not send frozen token by referencing bad freeze reference", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);
    const yInfo = await submitAllBootstrapTransactions(lucid, yFreezeAdmin);

    await updateIsFrozen(lucid, xInfo, true);

    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);
    const freezeRefUtxo = (await lucid.utxosAt(yInfo.freezeRefValidatorScript.address))[0]; // the other token's valid reference
    const utxoWithX = await fetchBiggestUtxoWithX(lucid, xInfo);
    const proofUtxo = await findProofForGivenUTxO(lucid, utxoWithX, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString);

    const submission = async () => {
      const tx = await lucid
        .newTx()
        .collectFrom([utxoWithX])
        .readFrom([freezeRefUtxo, proofUtxo])
        .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 200n })
        .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
        .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
        .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
        .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
        .attach.MintingPolicy(pvtScript.policy)
        .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

      const signedTx = await tx.sign.withWallet().complete();
      const txHash = await signedTx.submit();

      await awaitTxConfirms(lucid, txHash);
    }

    await expect(submission).rejects.toThrowError();

    await updateIsFrozen(lucid, xInfo, false);
  });

  it("Single proof for both tokens", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);
    const yInfo = await submitAllBootstrapTransactions(lucid, yFreezeAdmin);

    const submission = await transferXY(lucid, xInfo, yInfo, emulatorAccounts[1].address, 300n, 200n);
    await submission();
  });

  it("Single proof for both tokens can be referenced one at a time", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);
    const yInfo = await submitAllBootstrapTransactions(lucid, yFreezeAdmin);

    const submission = await transferXY(lucid, xInfo, yInfo, emulatorAccounts[1].address, 300n, 200n);
    await submission();

    // Step 2: Use the combined proof for another transfer of just one token at a time for both
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission2 = await transferX(lucid, xInfo, emulatorAccounts[2].address, 300n);
    await submission2();

    const submission3 = await transferX(lucid, yInfo, emulatorAccounts[2].address, 200n);
    await submission3();
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert back
  });

  it("Single proof for both tokens can be referenced for both at once", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);
    const yInfo = await submitAllBootstrapTransactions(lucid, yFreezeAdmin);

    const submission = await transferXY(lucid, xInfo, yInfo, emulatorAccounts[1].address, 300n, 200n);
    await submission();

    // Step 2: Use the combined proof for another transfer of both tokens at once
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission2 = await transferXY(lucid, xInfo, yInfo, emulatorAccounts[2].address, 300n, 200n);
    await submission2();
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey); // Revert back
  });
});

describe("Merging UTxOs", async () => {
  const { lucid, emulatorAccounts } = await setupEmulator();
  const xFreezeAdmin = privateKeyToPubKeyHash(emulatorAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    for (const account of emulatorAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid);
    }
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  })

  it("Creating more UTxOs inside own wallet -> merge them -> transfer away", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);

    // Step 1: Send to own new UTxO
    const submission0 = await transferX(lucid, xInfo, emulatorAccounts[0].address, 200n);
    await submission0();

    const submission1 = await transferX(lucid, xInfo, emulatorAccounts[0].address, 300n);
    await submission1();

    const submission2 = await transferX(lucid, xInfo, emulatorAccounts[0].address, 500n);
    await submission2();

    // Step 2: Merge all programmable tokens
    const { pvtScript, proofValidatorScript } = getTemplateValidators(lucid);

    const freezeRefUtxo = (await lucid.utxosAt(xInfo.freezeRefValidatorScript.address))[0];
    const utxos = await lucid.wallet().getUtxos();
    const allTokenUtxos = utxos.filter(utxo => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0n);
    const proofUtxos = await Promise.all(
      allTokenUtxos
        .map(async (utxoWithX) => findProofForGivenUTxO(lucid, utxoWithX, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString))
    );

    const submission3 = async () => {
      const tx = await lucid
        .newTx()
        .collectFrom(allTokenUtxos)
        .readFrom([freezeRefUtxo, ...proofUtxos])
        .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 1_000n })
        .pay.ToAddress(proofValidatorScript.address, { [pvtScript.tokenString]: 1n, [xInfo.freezableCheckTokenScript.tokenString]: 1n })
        .mintAssets({ [pvtScript.tokenString]: 1n }, Data.void())
        .mintAssets({ [xInfo.freezableCheckTokenScript.tokenString]: 1n }, Data.void())
        .attach.MintingPolicy(xInfo.freezableCheckTokenScript.policy)
        .attach.MintingPolicy(pvtScript.policy)
        .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

      const signedTx = await tx.sign.withWallet().complete();
      const txHash = await signedTx.submit();

      await awaitTxConfirms(lucid, txHash);
    }

    await submission3();

    // Step 3: Send them all to acc2
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const submission4 = await transferX(lucid, xInfo, emulatorAccounts[2].address, 1_000n);
    await submission4();
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });

  it("Creating more UTxOs inside own wallet -> merge them without creating proof (invalid)", async () => {
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);

    // Step 1: Send to own new UTxO
    const submission0 = await transferX(lucid, xInfo, emulatorAccounts[0].address, 200n);
    await submission0();

    const submission1 = await transferX(lucid, xInfo, emulatorAccounts[0].address, 300n);
    await submission1();

    const submission2 = await transferX(lucid, xInfo, emulatorAccounts[0].address, 500n);
    await submission2();

    // Step 2: Merge all programmable tokens
    const utxos = await lucid.wallet().getUtxos();
    const allTokenUtxos = utxos.filter(utxo => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0n);

    const submission3 = async () => {
      const tx = await lucid
        .newTx()
        .collectFrom(allTokenUtxos)
        .pay.ToAddress(emulatorAccounts[1].address, { [xInfo.programmableTokenScript.tokenString]: 1_000n })
        .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

      const signedTx = await tx.sign.withWallet().complete();
      const txHash = await signedTx.submit();

      await awaitTxConfirms(lucid, txHash);
    }

    await submission3();

    // Step 3: No proof now exists
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[1].privateKey);
    const utxos2 = await lucid.wallet().getUtxos();
    const utxo2 = utxos2.filter(utxo => utxo.assets[xInfo.programmableTokenScript.tokenString] > 0n)[0];
    const { proofValidatorScript } = getTemplateValidators(lucid);
    await expect(async () => await findProofForGivenUTxO(lucid, utxo2, proofValidatorScript.address, xInfo.freezableCheckTokenScript.tokenString)).rejects.toThrowError();
    lucid.selectWallet.fromPrivateKey(emulatorAccounts[0].privateKey);
  });
});

describe.skip("Testnet basic showcase", async () => {
  const { lucid, testnetAccounts } = await setupTestnet();
  const xFreezeAdmin = privateKeyToPubKeyHash(testnetAccounts[0].privateKey).to_hex();

  beforeAll(async () => {
    // Optional: Create smaller ADA-only UTxOs for each wallet to cover transaction fees
    // This splits large UTxOs into smaller ones, ensuring there's always ADA available for fees
    // Uncomment the following code if wallets have large UTxOs that need to be split:

    for (const account of testnetAccounts) {
      lucid.selectWallet.fromPrivateKey(account.privateKey);
      await createFeeUtxos(lucid, 2);  // Creates 2 small ADA UTxOs per wallet
    }
    lucid.selectWallet.fromPrivateKey(testnetAccounts[0].privateKey);
  });

  it("Testnet flow", async () => {
    console.log("\n=== CARDANO TESTNET SHOWCASE ===");
    console.log("Demonstrating programmable freezable token functionalities\n");

    // Step 1: Minting the tokens
    console.log("🔧 Step 1: Minting programmable tokens and performing other bootstrap transactions...");
    const xInfo = await submitAllBootstrapTransactions(lucid, xFreezeAdmin);
    console.log("✅ Successfully minted programmable tokens with freeze functionality\n");

    // Step 2: Transfer of token from wallet A to wallet B
    console.log("💸 Step 2: Transferring tokens from wallet A to wallet B...");
    console.log(`Transferring 400 tokens from admin (${await testnetAccounts[0].address()}) to wallet B (${await testnetAccounts[1].address()})`);
    const submission0 = await transferX(lucid, xInfo, await testnetAccounts[1].address(), 400n);
    await submission0();
    console.log("✅ Transfer successful - tokens moved from wallet A to wallet B\n");

    // Step 3: Freezing of tokens by administrator
    console.log("🧊 Step 3: Administrator freezing all tokens...");
    await updateIsFrozen(lucid, xInfo, true);
    console.log("✅ Tokens successfully frozen by administrator\n");

    // Step 4: Verify frozen tokens cannot be transferred
    console.log("🚫 Step 4: Verifying frozen tokens cannot be transferred...");
    lucid.selectWallet.fromPrivateKey(testnetAccounts[1].privateKey);
    try {
      const submission2 = await transferX(lucid, xInfo, await testnetAccounts[2].address(), 200n);
      await submission2();
      console.log("❌ ERROR: Transfer should have failed but succeeded!");
    } catch (error) {
      console.log("✅ Transfer correctly blocked - frozen tokens cannot be moved\n");
    }

    // Step 5: Unfreezing of tokens by administrator
    console.log("🔓 Step 5: Administrator unfreezing tokens...");
    lucid.selectWallet.fromPrivateKey(testnetAccounts[0].privateKey); // only admin can unfreeze
    await updateIsFrozen(lucid, xInfo, false);
    console.log("✅ Tokens successfully unfrozen by administrator\n");

    // Step 6: Verify unfrozen tokens can be transferred
    console.log("✅ Step 6: Verifying unfrozen tokens can now be transferred...");
    console.log(`Transferring 200 tokens from wallet B (${await testnetAccounts[1].address()}) to wallet C (${await testnetAccounts[2].address()})`);
    lucid.selectWallet.fromPrivateKey(testnetAccounts[1].privateKey);
    const submission3 = await transferX(lucid, xInfo, await testnetAccounts[2].address(), 200n);
    await submission3();
    console.log("✅ Transfer successful - unfrozen tokens can be moved normally\n");

    console.log("🎉 TESTNET SHOWCASE COMPLETE! 🎉");
    console.log("All functionalities demonstrated successfully:");
    console.log("  ✓ Minting programmable tokens");
    console.log("  ✓ Token transfer between wallets");
    console.log("  ✓ Freezing tokens by administrator");
    console.log("  ✓ Unfreezing tokens by administrator");

    // Revert back to admin wallet
    lucid.selectWallet.fromPrivateKey(testnetAccounts[0].privateKey);
  });
});
