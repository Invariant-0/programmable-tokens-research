# Testnet Logs - Live Programmable Token Demonstrations

This directory contains complete testnet run logs demonstrating all three types of programmable tokens on Cardano Preview Testnet. These logs provide real-world examples of the token functionalities without requiring you to run lengthy testnet tests yourself (around 30 minutes per test).

📖 **[← Back to Main README](../README.md)** for project overview, setup instructions, and architecture details.

## 📂 Directory Structure

```
testnet-logs/
├── README.md           # This file - testnet logs documentation
├── blacklist.log       # Blacklist programmable tokens demo
│                       #   • Dynamic address blacklisting/whitelisting
│                       #   • Bidirectional transfer blocking
│                       #   • Admin blacklist management
├── fee-on-transfer.log # Fee-on-transfer programmable tokens demo
│                       #   • Automatic fee collection on transfers
│                       #   • Treasury accumulation
│                       #   • Admin-only fee withdrawal
├── freezable.log       # Freezable programmable tokens demo
│                       #   • Admin freeze/unfreeze controls
│                       #   • Blocked transfers during freeze periods
│                       #   • Global token state management
└── emulator.log        # Local emulator test suite results
                        #   • Complete test coverage validation
```

## 🔗 Quick Explorer Links

All transactions can be verified on [Cardano Preview Explorer](https://preview.cardanoscan.io/).

## 📁 Available Logs

### 1. `freezable.log` - Freezable Programmable Tokens
**Demonstrates**: Admin freeze/unfreeze controls, blocked transfers during freeze periods

**Key Transactions**:
- **Step 1 - Token Creation & Bootstrap**: [b8182118016541a1e2a79292c096f4e682ecfb2a4741e43d646f5a345f6a0bdf](https://preview.cardanoscan.io/transaction/b8182118016541a1e2a79292c096f4e682ecfb2a4741e43d646f5a345f6a0bdf) & [8bb119cdc73c0111b50ea5f777e5ae840cd51794b4dbc92e00700deff59c0696](https://preview.cardanoscan.io/transaction/8bb119cdc73c0111b50ea5f777e5ae840cd51794b4dbc92e00700deff59c0696)
- **Step 2 - Normal Transfer (Admin → Wallet B)**: [0f6299560c31a15474ef0a17766d9d636e5702d2ca826b06612d68b6c3fc1a6c](https://preview.cardanoscan.io/transaction/0f6299560c31a15474ef0a17766d9d636e5702d2ca826b06612d68b6c3fc1a6c)
- **Step 3 - Freeze Action by Admin**: [e15f0d59f1cfdc91c82865a4915707f7e21f846cd00c2a8352a420bbff6b61f5](https://preview.cardanoscan.io/transaction/e15f0d59f1cfdc91c82865a4915707f7e21f846cd00c2a8352a420bbff6b61f5)
- **Step 4 - Transfer Attempt While Frozen (blocked)**: No transaction (validation failure)
- **Step 5 - Unfreeze Action by Admin**: [ace75d624ae621a6db4c3d2a972d21b27ae5792b519d40cbf1e24f73cda6210b](https://preview.cardanoscan.io/transaction/ace75d624ae621a6db4c3d2a972d21b27ae5792b519d40cbf1e24f73cda6210b)
- **Step 6 - Post-Unfreeze Transfer (Wallet B → Wallet C)**: [e05ce9bc02d1ff27812200373c841b212313b98cd2702d9e837b3ebfd0722473](https://preview.cardanoscan.io/transaction/e05ce9bc02d1ff27812200373c841b212313b98cd2702d9e837b3ebfd0722473)

**Note**: The first 3 transactions (cefa3dd9..., bf2c1ec8..., ff7f9fab...) were UTxO splitting operations for test setup, not freezable functionality.

**🔍 What to Check**:
- **Freeze Reference UTxO**: Look for UTxOs with inline datum showing `is_frozen: true/false`
- **Token Transfers**: Verify tokens move between addresses only when unfrozen
- **Admin Signatures**: Check that freeze/unfreeze operations require admin signature

**📍 Key Addresses**:
- **Admin Address**: `addr_test1vznszvym4gy2ch8h5uk9hkt8ytkfly4zlk84qjsulpfjryg87qlg6`
- **Wallet B**: `addr_test1vqvhrjwv85hxqc5u48jnuem598jkheejp3amf90xh2pupeq9mezp6`
- **Wallet C**: `addr_test1vq33p8hqrru88wu65hu2fvdmsv6t64knz9yrtrzf68cuenc80kq5k`
- **Freeze Reference Script Address**: [addr_test1wrse6lx2dncyn2ypkcal5t59npmavkfcamsjhzuyx752p3gqlr6mw](https://preview.cardanoscan.io/address/addr_test1wrse6lx2dncyn2ypkcal5t59npmavkfcamsjhzuyx752p3gqlr6mw)

### 2. `fee-on-transfer.log` - Fee-on-Transfer Programmable Tokens
**Demonstrates**: Automatic fee collection, treasury accumulation, admin-only withdrawal

**Key Transactions**:
- **Step 1 - Token Creation + Initial Fee**: [2ea2fb217a1b3a9e89204957b0893b692e8d01be541f78889bc5921cb595b1d1](https://preview.cardanoscan.io/transaction/2ea2fb217a1b3a9e89204957b0893b692e8d01be541f78889bc5921cb595b1d1)
- **Step 2 - First Transfer + Fee**: [f80f3a5f84d5d2ce0715f7ba9db4e9c238f2fc6887bf155fc5c33788d56f3b58](https://preview.cardanoscan.io/transaction/f80f3a5f84d5d2ce0715f7ba9db4e9c238f2fc6887bf155fc5c33788d56f3b58)
- **Step 3 - Fee Collection Verification**: No transaction (just checking accumulated fees)
- **Step 4 - Second Transfer + Fee**: [405173f5962f6407438a2a102156e9d18306128972123870c4ee8a44eab2a354](https://preview.cardanoscan.io/transaction/405173f5962f6407438a2a102156e9d18306128972123870c4ee8a44eab2a354)
- **Step 5 - Transfer Without Fee (blocked)**: No transaction (validation failure)
- **Step 6 - Admin Fee Withdrawal**: [963aa4b77f46d66b7f0ef3e2405350fefd116af301adc6ad21601ef0d8598d55](https://preview.cardanoscan.io/transaction/963aa4b77f46d66b7f0ef3e2405350fefd116af301adc6ad21601ef0d8598d55)

**🔍 What to Check**:
- **Fee Collection**: Each transfer transaction shows ADA payment to fee treasury address
- **Fee Accumulation**: Treasury address accumulates fees from multiple transfers
- **Withdrawal Security**: Only admin can withdraw from treasury (signature verification)

**📍 Key Addresses**:
- **Fee Treasury Address**: [addr_test1wr9hp6ytkxjcnlgsg0c34j7ssvg9zgf38l6vw0vu2a2zv9cxacpe7](https://preview.cardanoscan.io/address/addr_test1wr9hp6ytkxjcnlgsg0c34j7ssvg9zgf38l6vw0vu2a2zv9cxacpe7)
- **Fee Amount**: 2 ADA per transfer (as configured in tests)

### 3. `blacklist.log` - Blacklist Programmable Tokens
**Demonstrates**: Dynamic address blacklisting, bidirectional transfer blocking, admin blacklist management

**Key Transactions**:
- **Step 1 - Token Creation & Bootstrap**: [09c6aa25b7a3f61d4031dc188cbc2430d901453ee5eef3c3cdf59eeaf8592d32](https://preview.cardanoscan.io/transaction/09c6aa25b7a3f61d4031dc188cbc2430d901453ee5eef3c3cdf59eeaf8592d32) & [dce6b8db9b38165e270202ac82a09ef9182d812d88c26b2429e5d9205727f7d9](https://preview.cardanoscan.io/transaction/dce6b8db9b38165e270202ac82a09ef9182d812d88c26b2429e5d9205727f7d9)
- **Step 2 - Normal Transfer to Non-Blacklisted**: [973b58df7a88ad131990a1db71c977415d8b0183583c8c67c72705f96691c902](https://preview.cardanoscan.io/transaction/973b58df7a88ad131990a1db71c977415d8b0183583c8c67c72705f96691c902)
- **Step 3 - Blacklist Action by Admin**: [eac5381a4bf0c7bfc198484ab4f3798c95d0ea9d70dfcc2a4bd1d7a7b12fc87e](https://preview.cardanoscan.io/transaction/eac5381a4bf0c7bfc198484ab4f3798c95d0ea9d70dfcc2a4bd1d7a7b12fc87e)
- **Step 4 - Transfer to Blacklisted Address (blocked)**: No transaction (validation failure)
- **Step 5 - Whitelist Action by Admin**: [c9cd4dccefee30cf8adc5a41a895018da1f45054ab820eff5fdf68253fc27096](https://preview.cardanoscan.io/transaction/c9cd4dccefee30cf8adc5a41a895018da1f45054ab820eff5fdf68253fc27096)
- **Step 6 - Post-Whitelist Transfer Success**: [2456f991d8290c9e9e0c7d2a8b0da8dc5b7072da75048918da62fa287ea1dad8](https://preview.cardanoscan.io/transaction/2456f991d8290c9e9e0c7d2a8b0da8dc5b7072da75048918da62fa287ea1dad8)

**🔍 What to Check**:
- **Blacklist Reference UTxO**: Look for UTxOs with inline datum containing array of blacklisted public key hashes
- **Transfer Validation**: Verify transfers fail when involving blacklisted addresses
- **Dynamic Updates**: See blacklist datum change as addresses are added/removed

**📍 Key Addresses**:
- **Blacklist Reference Address**: [addr_test1wzm4674lkkjgvn5mk7zkv6dtslmrrw32z3823xj0nwm57acv94sf8](https://preview.cardanoscan.io/address/addr_test1wzm4674lkkjgvn5mk7zkv6dtslmrrw32z3823xj0nwm57acv94sf8)
- **Blacklist Datum at the Time the Address was Blacklisted**: [View in Datum Inspector](https://preview.cardanoscan.io/datumInspector?datum=d8799f9f581c23109ee018f873bb9aa5f8a4b1bb8334bd56d31148358c49d1f1cccfffff)

### 4. `emulator.log` - Emulator Tests
**Demonstrates**: Complete test suite running on local emulator for development validation

## 🚀 Running Your Own Testnet Tests

The above logs are provided for convenience. You can always generate your own logs by running the scripts and waiting some time:
1. Configure `scripts/config.ts` with your testnet credentials
2. Change `.skip` to `.only` in the desired test file
3. Run `yarn test`
4. Monitor transaction confirmations (can take 20+ minutes)

---

**Note**: All transactions use Cardano Preview Testnet. These tokens have no real value and are for demonstration purposes only.
