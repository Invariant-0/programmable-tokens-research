import { Data, CML, UTxO, LucidEvolution } from "@lucid-evolution/lucid";
import { awaitTxConfirms } from "./scripts/utils.ts";

export const privateKeyToPubKeyHash = (bech32PrivateKey: string) => CML.PrivateKey.from_bech32(bech32PrivateKey).to_public().hash();

export const FreezableRefDatumSchema = Data.Object({ is_frozen: Data.Boolean() });
export type FreezableDatum = Data.Static<typeof FreezableRefDatumSchema>;
export const FreezableDatum = FreezableRefDatumSchema as unknown as FreezableDatum;

export const BlacklistRefDatumSchema = Data.Object({ blacklisted_pkhs: Data.Array(Data.Bytes()) });
export type BlacklistDatum = Data.Static<typeof BlacklistRefDatumSchema>;
export const BlacklistDatum = BlacklistRefDatumSchema as unknown as BlacklistDatum;

export const BlacklistRedeemerSchema = Data.Enum([
  Data.Object({ Blacklist: Data.Object({ 0: Data.Bytes() }) }),
  Data.Object({ Whitelist: Data.Object({ 0: Data.Bytes() }) }),
]);
export type BlacklistRedeemer = Data.Static<typeof BlacklistRedeemerSchema>;
export const BlacklistRedeemer = BlacklistRedeemerSchema as unknown as BlacklistRedeemer;

export const findProofForGivenUTxO = async (lucid: LucidEvolution, utxo: UTxO, proofAddress: string, pctTokenString: string): Promise<UTxO> => {
  const proofs = await lucid.utxosAt(proofAddress);
  const proof = proofs.find(proof => proof.txHash === utxo.txHash && proof.assets[pctTokenString] > 0);
  if (!proof) throw Error("No proof found");
  return proof;
}

export const fetchAdaOnlyUtxos = async (lucid: LucidEvolution): Promise<UTxO[]> => {
  const utxos = await lucid.wallet().getUtxos();
  return utxos.filter(utxo => Object.keys(utxo.assets).length === 1);
}

export const fetchBiggestUtxoWithToken = async (lucid: LucidEvolution, tokenString: string): Promise<UTxO> => {
  const utxos = await lucid.wallet().getUtxos();
  const allTokenUtxos = utxos.filter(utxo => utxo.assets[tokenString] > 0n);
  // From smallest to biggest
  const compareUtxos = (a: UTxO, b: UTxO) => {
    const amt0 = a.assets[tokenString];
    const amt1 = b.assets[tokenString];
    return amt0 > amt1 ? 1 : amt0 < amt1 ? -1 : 0;
  }
  const sortedUtxos = allTokenUtxos.sort(compareUtxos).reverse();
  const utxo = sortedUtxos[0];
  if (!utxo) throw Error(`No utxo with token ${tokenString} found`);
  return utxo;
}

export const createFeeUtxos = async (lucid: LucidEvolution, count = 200) => {
  const ownAddress = await lucid.wallet().address();
  const tx = await Array(count)
    .fill(0)
    .reduce(
      acc => acc.pay.ToAddress(ownAddress, { lovelace: 20_000_000n }),
      lucid.newTx(),
    )
    .complete({presetWalletInputs: await fetchAdaOnlyUtxos(lucid)});

  const signedTx = await tx.sign.withWallet().complete();
  const txHash = await signedTx.submit();

  await awaitTxConfirms(lucid, txHash);
}
