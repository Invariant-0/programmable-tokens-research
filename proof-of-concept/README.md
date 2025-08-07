# Programmable Tokens

This repository implements programmable tokens on Cardano, featuring three distinct types of token functionalities. Each token type demonstrates different aspects of programmable behavior while sharing common template infrastructure.

## Overview

Programmable tokens extend basic Cardano native tokens with additional validation logic that enforces specific rules during transfers. This implementation follows the architectural patterns described in the programmable tokens whitepaper.

**⚠️ DISCLAIMER**: This proof-of-concept implementation is for research and demonstration purposes only. These validators have not been audited and are not production-ready. Do not use in production environments without proper security auditing and testing.

## Token Types

### 1. Freezable Tokens
**Location**: `validators/programmable/freeze_reference.ak`, `validators/programmable/freezable_check.ak`

Freezable tokens can be temporarily disabled by an administrator, preventing all valid transfers during the frozen period.

**Features**:
- Admin-controlled freeze/unfreeze functionality
- Reference UTxO stores current freeze state
- All transfers blocked when tokens are frozen
- Immediate effect across all token holders

**Use Cases**:
- Emergency stops during security incidents
- Regulatory compliance requirements
- Maintenance periods for token ecosystems

### 2. Fee-on-Transfer Tokens
**Location**: `validators/programmable/fee_treasury.ak`, `validators/programmable/fee_check.ak`

Fee-on-transfer tokens require a fixed ADA fee payment on every valid transfer, collected to a dedicated treasury script address.

**Features**:
- Constant ADA fee required for each transfer
- Dedicated fee treasury with admin-only withdrawal
- Configurable fee amounts per token type
- Double satisfaction vulnerability protection

**Use Cases**:
- Transaction-based revenue models
- Deflationary token mechanics (if the fee was taken in the token itself)
- Platform sustainability funding

### 3. Blacklist Tokens
**Location**: `validators/programmable/blacklist_reference.ak`, `validators/programmable/blacklist_check.ak`

Blacklist tokens maintain a dynamic list of addresses that are prohibited from sending or receiving tokens.

**Features**:
- Admin-managed blacklist of prohibited addresses
- Bidirectional enforcement (both sending and receiving)
- Dynamic add/remove capabilities
- Independent blacklists per token type

**Use Cases**:
- Regulatory compliance (AML/KYC)
- Fraud prevention and security
- Selective access control
- Legal requirement enforcement

## Shared Infrastructure

### Template System
**Location**: `validators/template/proof.ak`

All programmable tokens share common template infrastructure as specified in the whitepaper:

- **Proof Validator**: Unspendable validator, constant for all tokens
- **Proof Validation Tokens (PVT)**: Token minted to mark valid proofs, constant for all tokens
- **Programmable Check Tokens (PCT)**: Enforce specific programmable logic
- **Reference UTxOs**: Store mutable state for token types that require it

### Bootstrap System
**Location**: `scripts/bootstrap.ts`

Provides factory functions for creating each type of programmable token:

```typescript
// Freezable tokens
const { bootstrapFreezableRef, bootstrapProgrammableToken } = 
  bootstrapFreezableProgrammableToken(lucid, assetName, adminPkh);

// Fee-on-transfer tokens
const { bootstrapFeeOnTransferToken } = 
  bootstrapFeeOnTransferProgrammableToken(lucid, assetName, adminPkh, feeAmount);

// Blacklist tokens
const { bootstrapBlacklistRef, bootstrapProgrammableToken } = 
  bootstrapBlacklistProgrammableToken(lucid, assetName, adminPkh);
```

## Testing

### Test Structure

All token types include comprehensive test suites:

- **`freezable.test.ts`**: Freezable token functionality
- **`fee-on-transfer.test.ts`**: Fee-on-transfer token functionality  
- **`blacklist.test.ts`**: Blacklist token functionality

### Test Categories

Each test suite includes comprehensive coverage with categories such as:

- **Bootstrap Tests**: Token creation and initialization
- **Core Functionality**: Primary token behaviors and transfer operations
- **Admin Operations**: Administrative control features (freeze/unfreeze, blacklist management, fee withdrawal)
- **Access Control**: Security tests and edge cases
- **Multi-Token Tests**: Independent operation verification
- **Testnet Showcase**: End-to-end demonstrations (skipped by default)

### Running Tests

```bash
# Run all tests (emulator only, unless testnet is explicitly enabled)
yarn test

# Run specific token type tests
yarn test freezable.test.ts
yarn test fee-on-transfer.test.ts
yarn test blacklist.test.ts
```

### Testnet Testing

Testnet showcase tests are **skipped by default** but can be easily enabled for live network testing. Skipped by default purely for the long time it takes to make and confirm all those testnet transactions. You are recommended to run it, though!

#### Prerequisites

1. **Configure Network**: Update `scripts/config.ts` with your testnet credentials:
   ```typescript
   export const BLOCKFROST_API_KEY = "your_testnet_api_key";
   export const BLOCKFROST_URL = "https://cardano-preview.blockfrost.io/api/v0";
   export const PRIVATE_KEY = "your_testnet_private_key";
   export const PRIVATE_KEY2 = "another_testnet_private_key";
   export const PRIVATE_KEY3 = "yet_another_testnet_private_key";
   ```

2. **Enable Tests**: Change `.skip` to `.only` in test files:
   ```typescript
   // Before
   describe.skip("Testnet Freezable Showcase", async () => {
   
   // After  
   describe.only("Testnet Freezable Showcase", async () => {
   ```

#### Testnet Features

- **Live Network Validation**: Real Cardano testnet transactions
- **Explorer Integration**: Transaction links for easy verification
- **Step-by-step Logging**: Detailed console output for each operation
- **Multiple Account Testing**: Multiple addresses are used to emulate multi-user interactions

### Sample Run Logs

Complete testnet run examples with transaction hashes and explorer links are available in the **[`testnet-logs/`](testnet-logs/)** directory --- for seamless verification without running the testnet tests yourself.

📋 **[→ View Detailed Testnet Logs](testnet-logs/README.md)** with transaction links, addresses, and step-by-step demonstrations.

## Architecture

### Validator Organization

```
validators/
├── template/          # Shared template system
│   └── proof.ak       # Proof validator and PVT validation logic
├── programmable/      # Token-specific validators
│   ├── freeze_reference.ak      # Freezable state management
│   ├── freezable_check.ak       # Freezable transfer logic
│   ├── fee_treasury.ak          # Fee collection treasury
│   ├── fee_check.ak             # Fee validation logic
│   ├── blacklist_reference.ak   # Blacklist state management
│   └── blacklist_check.ak       # Blacklist transfer logic
└── free_mint.ak       # Unrelated free-to-mint test token validation
```


## Development

### Project Structure

```
programmable/
├── validators/        # Aiken validator source code
├── scripts/          # TypeScript utilities and bootstrap
├── test-utils.ts     # Shared testing utilities
├── *.test.ts         # Comprehensive test suites specific for the kind of programmable token tested
├── plutus.json       # Compiled validator artifacts
└── aiken.toml        # Aiken project configuration
```

### Building

```bash
# Install dependencies
yarn

# Compile Aiken validators (optional, make sure aiken is installed)
aiken build

# Run vitest tests
yarn test
```

### Adding New Token Types (optional)

1. Create validators in `validators/programmable/`
2. Add bootstrap functions to `scripts/bootstrap.ts`
3. Create comprehensive test suite following existing patterns
4. Update this README with new functionality

## Examples

See the test files for complete examples of:

- Token creation and minting
- Transfer operations with validation
- Admin operations (freeze, fee withdrawal, blacklist management)
- Error handling and security testing
- Multi-token scenarios

Each test suite includes both positive and negative test cases, demonstrating correct usage and security boundaries.
