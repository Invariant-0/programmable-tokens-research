import { Constr, fromText, LucidEvolution, OutRef, Address } from "@lucid-evolution/lucid";
import { createMintingPolicyArtefact, createValidatorArtefact, MintingPolicyArtefact, ValidatorArtefact } from "./validators.ts";

function utxoRefDataStruct(utxoRef: OutRef) {
  return new Constr(0, [utxoRef.txHash, BigInt(utxoRef.outputIndex)]);
}

export interface FreezableProgrammableTokenInfo extends FreezableRefInfo {
  programmableTokenScript: MintingPolicyArtefact;
  freezableCheckTokenScript: MintingPolicyArtefact;
}

export interface FreezableRefInfo {
  freezeRefValidityTokenScript: MintingPolicyArtefact;
  freezeRefValidatorScript: ValidatorArtefact;
}

export interface FeeOnTransferProgrammableTokenInfo {
  programmableTokenScript: MintingPolicyArtefact;
  feeCheckTokenScript: MintingPolicyArtefact;
  feeTreasuryValidatorScript: ValidatorArtefact;
  feeAddress: Address;
  feeAmount: bigint;
}

export interface BlacklistProgrammableTokenInfo extends BlacklistRefInfo {
  programmableTokenScript: MintingPolicyArtefact;
  blacklistCheckTokenScript: MintingPolicyArtefact;
}

export interface BlacklistRefInfo {
  blacklistRefValidityTokenScript: MintingPolicyArtefact;
  blacklistRefValidatorScript: ValidatorArtefact;
}

export const bootstrapFreezableProgrammableToken = (
  lucid: LucidEvolution,
  programmableTokenAssetName: string,
  freezeAdmin: string,
) => ({
  bootstrapFreezableRef: (bootstrapUtxo: OutRef): FreezableRefInfo => {
    const utxoData = utxoRefDataStruct(bootstrapUtxo);
    const freezeRefValidityTokenAssetName = "FREEZE";

    const freezeRefValidityTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/freeze_reference.freeze_reference.mint",
      fromText(freezeRefValidityTokenAssetName),
      [utxoData, freezeAdmin],
    );

    const freezeRefValidatorScript = createValidatorArtefact(
      lucid,
      "programmable/freeze_reference.freeze_reference.spend",
      [utxoData, freezeAdmin],
    );

    return {
      freezeRefValidityTokenScript,
      freezeRefValidatorScript,
    };
  },
  bootstrapProgrammableToken: (refInfo: FreezableRefInfo, bootstrapUtxo: OutRef): FreezableProgrammableTokenInfo => {
    const utxoData = utxoRefDataStruct(bootstrapUtxo);
    const { freezeRefValidityTokenScript } = refInfo;

    const programmableTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/programmable_token.programmable_token.mint",
      fromText(programmableTokenAssetName),
      [utxoData],
    );

    const freezableCheckTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/freezable_check.freezable_check.mint",
      programmableTokenScript.policyId,
      [freezeRefValidityTokenScript.policyId, freezeRefValidityTokenScript.tokenNameHex, programmableTokenScript.policyId],
    );

    return {
      ...refInfo,
      programmableTokenScript,
      freezableCheckTokenScript,
    };
  },
});

type TemplateValidatorInfo = {
  pvtScript: MintingPolicyArtefact;
  proofValidatorScript: ValidatorArtefact;
};

export function getTemplateValidators(lucid: LucidEvolution): TemplateValidatorInfo {
  const pvtAssetName = "PVT";

  const pvtScript = createMintingPolicyArtefact(lucid, "template/proof.proof.mint", fromText(pvtAssetName));
  const proofValidatorScript = createValidatorArtefact(lucid, "template/proof.proof.spend");

  return {
    pvtScript,
    proofValidatorScript,
  };
}

// Use this function with different [randomBootstrapWord]s for new non-programmable tokens.
// Reusing [randomBootstrapWord] yields the same minting policy. A different word yields a different one.
export function bootstrapRandomNewToken(
  lucid: LucidEvolution,
  randomBootstrapWord: string,
): MintingPolicyArtefact {
  const freeMintScript = createMintingPolicyArtefact(lucid, "free_mint.free_mint.mint", fromText(randomBootstrapWord), [fromText(randomBootstrapWord)]);

  return freeMintScript;
}

export const bootstrapFeeOnTransferProgrammableToken = (
  lucid: LucidEvolution,
  programmableTokenAssetName: string,
  feeAdmin: string,
  feeAmount: bigint,
) => {
  const bootstrapFeeOnTransferToken = (bootstrapUtxo: OutRef): FeeOnTransferProgrammableTokenInfo => {
    const utxoData = utxoRefDataStruct(bootstrapUtxo);

    // Create programmable token
    const programmableTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/programmable_token.programmable_token.mint",
      fromText(programmableTokenAssetName),
      [utxoData],
    );

    // Create fee treasury validator
    const feeTreasuryValidatorScript = createValidatorArtefact(
      lucid,
      "programmable/fee_treasury.fee_treasury.spend",
      [feeAdmin, fromText(`${programmableTokenScript.policyId}-DIFF`)],
    );

    // Construct Address parameter for Aiken: Address(PaymentCredential, Option<StakeCredential>)
    // PaymentCredential::Script(ScriptHash), StakeCredential::None
    const feeAddressParam = new Constr(0, [
      new Constr(1, [feeTreasuryValidatorScript.scriptHash]), // Script credential with script hash
      new Constr(1, []) // None for stake credential
    ]);

    // Create fee check token
    const feeCheckTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/fee_check.fee_check.mint",
      programmableTokenScript.policyId,
      [feeAddressParam, feeAmount, programmableTokenScript.policyId],
    );

    return {
      programmableTokenScript,
      feeCheckTokenScript,
      feeTreasuryValidatorScript,
      feeAddress: feeTreasuryValidatorScript.address,
      feeAmount,
    };
  };

  return { bootstrapFeeOnTransferToken };
};

export const bootstrapBlacklistProgrammableToken = (
  lucid: LucidEvolution,
  programmableTokenAssetName: string,
  blacklistAdmin: string,
) => ({
  bootstrapBlacklistRef: (bootstrapUtxo: OutRef): BlacklistRefInfo => {
    const utxoData = utxoRefDataStruct(bootstrapUtxo);
    const blacklistRefValidityTokenAssetName = "BLACKLIST";

    const blacklistRefValidityTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/blacklist_reference.blacklist_reference.mint",
      fromText(blacklistRefValidityTokenAssetName),
      [utxoData, blacklistAdmin],
    );

    const blacklistRefValidatorScript = createValidatorArtefact(
      lucid,
      "programmable/blacklist_reference.blacklist_reference.spend",
      [utxoData, blacklistAdmin],
    );

    return {
      blacklistRefValidityTokenScript,
      blacklistRefValidatorScript,
    };
  },
  bootstrapProgrammableToken: (refInfo: BlacklistRefInfo, bootstrapUtxo: OutRef): BlacklistProgrammableTokenInfo => {
    const utxoData = utxoRefDataStruct(bootstrapUtxo);
    const { blacklistRefValidityTokenScript } = refInfo;

    const programmableTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/programmable_token.programmable_token.mint",
      fromText(programmableTokenAssetName),
      [utxoData],
    );

    const blacklistCheckTokenScript = createMintingPolicyArtefact(
      lucid,
      "programmable/blacklist_check.blacklist_check.mint",
      programmableTokenScript.policyId,
      [blacklistRefValidityTokenScript.policyId, blacklistRefValidityTokenScript.tokenNameHex, programmableTokenScript.policyId],
    );

    return {
      ...refInfo,
      programmableTokenScript,
      blacklistCheckTokenScript,
    };
  },
});
