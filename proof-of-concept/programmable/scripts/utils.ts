import { applyParamsToScript, Emulator, Data, MintingPolicy, Script, SpendingValidator, UTxO, LucidEvolution, validatorToScriptHash, validatorToAddress } from "@lucid-evolution/lucid";

import { BLOCKFROST_API_KEY, BLOCKFROST_URL, CONFIRMS_WAIT } from "./config.ts";
// import { OurEmulator } from "./emulatorProvider.ts";

export const FIXED_MIN_ADA = 2000000n;

async function writeStringWithoutNewline(s: string) {
  console.log(s); // this unfortunately prints a new line, no workaround found so far for the test environment
}

export function isEmulator(lucid: LucidEvolution) {
  // return lucid.provider instanceof OurEmulator;
  return lucid.config().provider instanceof Emulator;
}

export function awaitTxConfirms(
  lucid: LucidEvolution,
  txHash: string,
  confirms = CONFIRMS_WAIT,
  checkInterval = 3000,
): Promise<boolean> {
  return new Promise((res) => {
    if (isEmulator(lucid)) {
      (lucid.config().provider as Emulator).awaitBlock(confirms);
      return res(true);
    }

    writeStringWithoutNewline(`Waiting for ${confirms} tx confirmations...`);
    const confirmation = setInterval(async () => {
      try {
        const isConfirmed = await fetch(`${BLOCKFROST_URL}/txs/${txHash}`, {
          headers: { project_id: BLOCKFROST_API_KEY },
        }).then((res) => res.json());
        writeStringWithoutNewline(".");

        if (isConfirmed && !isConfirmed.error) {
          try {
            const blockHash = isConfirmed.block;
            const block = await fetch(`${BLOCKFROST_URL}/blocks/${blockHash}`, {
              headers: { project_id: BLOCKFROST_API_KEY },
            }).then((res) => res.json());

            if (block.confirmations >= confirms) {
              writeStringWithoutNewline("\n");
              console.log(`Transaction confirmed!${getFormattedTxDetails(txHash, lucid)}`);
              clearInterval(confirmation);
              await new Promise((res) => setTimeout(() => res(1), 1000));
              return res(true);
            }
          } catch (error) {
            console.log("Error fetching block info, retrying...", error);
          }
        }
      } catch (error) {
        console.log("Error fetching transaction info, retrying...", error);
      }
    }, checkInterval);
  });
}

export function filterUTXOsByTxHash(utxos: UTxO[], txhash: string) {
  return utxos.filter((x) => txhash == x.txHash);
}

export async function getWalletBalanceLovelace(lucid: LucidEvolution) {
  const utxos = await lucid.wallet().getUtxos();
  return utxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
}

export function cardanoscanLink(txHash: string, lucid: LucidEvolution) {
  return isEmulator(lucid) ? "" : `Check details at https://preview.cardanoscan.io/transaction/${txHash} `;
}

export function getFormattedTxDetails(txHash: string, lucid: LucidEvolution) {
  return `\n\tTx ID: ${txHash}\n\t${cardanoscanLink(txHash, lucid)}`;
}

export function encodeBase64(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

export function decodeBase64(str: string): string {
  return Buffer.from(str, "base64").toString("utf-8");
}

export function filterUndefined(inputList: (string | undefined)[]): string[] {
  return inputList.filter((item): item is string => !!item);
}

export async function sleep(milliseconds: bigint): Promise<void> {
  const oneDayInMilliseconds = BigInt(24 * 60 * 60 * 1000);

  if (milliseconds >= oneDayInMilliseconds) {
    await new Promise((resolve) => setTimeout(resolve, Number(oneDayInMilliseconds)));
    await sleep(milliseconds - oneDayInMilliseconds);
  } else {
    await new Promise((resolve) => setTimeout(resolve, Number(milliseconds)));
  }
}

export function getCurrentTime(lucid: LucidEvolution) {
  if (isEmulator(lucid)) {
    // return (lucid.provider as OurEmulator).now();
    return (lucid.config().provider as Emulator).now();
  }
  const current = new Date();
  return current.getTime();
}

export function second() {
  return 1000;
}

export function minute() {
  return 60 * second();
}

export function hour() {
  return 60 * minute();
}

// export function privateKeyToPubKeyHash(bech32PrivateKey: string) {
//   return C.PrivateKey.from_bech32(bech32PrivateKey).to_public().hash();
// }

// export function pubKeyHashToAddress(pubKeyHash: C.Ed25519KeyHash) {
//   return C.EnterpriseAddress.new(0, C.StakeCredential.from_keyhash(pubKeyHash))
//     .to_address()
//     .to_bech32(undefined);
// }

export async function fundWallet(
  lucid: LucidEvolution,
  address: string,
  lovelace: bigint,
) {
  const tx = await lucid
    .newTx()
    .pay.ToAddress(address, { lovelace })
    .complete();

  const signedTx = await tx.sign.withWallet().complete();
  const submittedTx = await signedTx.submit();

  console.log(
    `Funded wallet ${address}${getFormattedTxDetails(submittedTx, lucid)}`,
  );

  await awaitTxConfirms(lucid, submittedTx);
}

interface BlueprintJSON {
  validators: {
    title: string;
    compiledCode: string;
    hash: string;
  }[];
}

type ValidatorData = {
  validator: SpendingValidator;
  address: string;
  hash: string;
};

export function setupValidator(
  lucid: LucidEvolution,
  blueprint: BlueprintJSON,
  name: string,
  parameters?: Data[],
): ValidatorData {
  const jsonData = blueprint.validators.find((v) => v.title == name);
  if (!jsonData) {
    throw new Error(`Validator with a name ${name} was not found.`);
  }
  const compiledCode = jsonData.compiledCode;
  const validator: Script = {
    type: "PlutusV2",
    script: parameters === undefined ? compiledCode : applyParamsToScript(compiledCode, parameters),
  };
  const address = validatorToAddress(lucid.config().network!, validator);
  const hash = validatorToScriptHash(validator);

  return { validator, address, hash };
}

type MintingPolicyData = {
  policy: MintingPolicy;
  policyId: string;
};

export function setupMintingPolicy(
  lucid: LucidEvolution,
  blueprint: BlueprintJSON,
  name: string,
  parameters?: Data[],
): MintingPolicyData {
  const jsonData = blueprint.validators.find((v) => v.title == name);
  if (!jsonData) {
    throw new Error("Validation token policy not found.");
  }
  const compiledCode = jsonData.compiledCode;
  const policy: MintingPolicy = {
    type: "PlutusV2",
    script: parameters === undefined ? compiledCode : applyParamsToScript(compiledCode, parameters),
  };
  const policyId = validatorToScriptHash(policy);
  return { policy, policyId };
}
