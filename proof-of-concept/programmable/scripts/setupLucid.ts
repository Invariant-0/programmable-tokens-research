import { BLOCKFROST_API_KEY, BLOCKFROST_URL, PRIVATE_KEY, PRIVATE_KEY2, PRIVATE_KEY3 } from "./config.ts";
import { Emulator, generatePrivateKey, EmulatorAccount, Lucid, Provider, makeWalletFromPrivateKey, PROTOCOL_PARAMETERS_DEFAULT, generateEmulatorAccountFromPrivateKey, PrivateKey, Blockfrost } from "@lucid-evolution/lucid";

export const setupEmulator = async () => {
  const emulatorAccount = await generateEmulatorAccountFromPrivateKey({lovelace: BigInt(1e14)});
  const emulatorAccount2 = await generateEmulatorAccountFromPrivateKey({lovelace: BigInt(1e14)});
  const emulatorAccount3 = await generateEmulatorAccountFromPrivateKey({lovelace: BigInt(1e14)});
  const emulatorAccounts = [emulatorAccount, emulatorAccount2, emulatorAccount3];

  const provider = new Emulator(emulatorAccounts);

  const lucid = await Lucid(provider, "Custom");
  lucid.selectWallet.fromPrivateKey(emulatorAccount.privateKey);

  return {provider, lucid, emulatorAccounts};
}

export const setupTestnet = async () => {
  try {
    const provider = new Blockfrost(BLOCKFROST_URL, BLOCKFROST_API_KEY);
    const network = "Preview";

    const testnetAccount = {...makeWalletFromPrivateKey(provider, network, PRIVATE_KEY), privateKey: PRIVATE_KEY};
    const testnetAccount2 = {...makeWalletFromPrivateKey(provider, network, PRIVATE_KEY2), privateKey: PRIVATE_KEY2};
    const testnetAccount3 = {...makeWalletFromPrivateKey(provider, network, PRIVATE_KEY3), privateKey: PRIVATE_KEY3};
    const testnetAccounts = [testnetAccount, testnetAccount2, testnetAccount3];

    const lucid = await Lucid(provider, network);
    lucid.selectWallet.fromPrivateKey(PRIVATE_KEY);

    return {provider, lucid, testnetAccounts};
  } catch (error) {
    console.error("Error setting up testnet, have you set up the config.ts file?", error);
    throw error;
  }
}
