import { applyParamsToScript, Data, LucidEvolution, MintingPolicy, SpendingValidator } from "@lucid-evolution/lucid";
import { validatorToScriptHash, validatorToAddress, mintingPolicyToId } from "@lucid-evolution/utils";
import blueprint from "../plutus.json" with { type: "json" };

// A helper struct that contains all the stuff we need to use a minting policy
export interface MintingPolicyArtefact {
  policy: MintingPolicy;
  policyId: string;
  tokenString: string;
  tokenNameHex: string;
}

// A helper struct that contains all we need to use a validator
export interface ValidatorArtefact {
  validator: SpendingValidator;
  scriptHash: string;
  address: string;
}

export function readValidator(name: string): string {
  const validator = blueprint.validators.find((v) => v.title === name);
  if (!validator) {
    throw new Error("Validator not found");
  }
  return validator.compiledCode;
}

export function createValidatorArtefact(
  lucid: LucidEvolution,
  path: string,
  parameters?: Data[],
): ValidatorArtefact {
  const code = readValidator(path);
  const validator: SpendingValidator = { type: "PlutusV3", script: parameters === undefined ? code : applyParamsToScript(code, parameters) };

  return {
    validator,
    scriptHash: validatorToScriptHash(validator),
    address: validatorToAddress(lucid.config().network!, validator),
  };
}

export function createMintingPolicyArtefact(
  lucid: LucidEvolution,
  path: string,
  tokenNameHex: string,
  parameters?: Data[],
): MintingPolicyArtefact {
  const code = readValidator(path);
  const policy: MintingPolicy = { type: "PlutusV3", script: parameters === undefined ? code : applyParamsToScript(code, parameters) };
  const policyId = mintingPolicyToId(policy);

  return {
    policy,
    policyId,
    tokenString: `${policyId}${tokenNameHex}`,
    tokenNameHex,
  };
}
