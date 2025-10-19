## Version 1.0.1 - [2025-10-19]

### Added

- Catalyst **Closeout report** and video link. See closeout [folder](./closeout/).

## Version 1.0 (Final Milestone) - [2025-09-04]

### Added

- **Final Whitepaper Completion** with added conclusion section covering adoption paths, standardization considerations and final remarks.

### Changed

- Rebranded the whitepaper under new Invariant0 branding guidelines, styling and formatting for consistency.

## Version 0.3 (Milestones 3 and 4) - [2025-08-07]

### Added

- **Complete Proof of Concept for Common Programmable Tokens**: Implemented comprehensive programmable token functionality demonstrating:
  - **Freezable Cardano native programmable tokens**:
    - Token minting capabilities
    - Transfer between wallets (A to B)
    - Administrative freezing of tokens
    - Administrative unfreezing of tokens
  - **Fee-on-transfer tokens**: Tokens that automatically deduct fees during transfers
  - **Blacklist functionality with extendable blacklist**: Ability to maintain and extend blacklisted addresses
  - **Blacklist validation**: Prevention of transfers from blacklisted addresses
- Well-documented proof-of-concept validators (on-chain) and off-chain test implementations covering all specified behavior
- Testnet tests and testing logs from them
- See [./proof-of-concept/](./proof-of-concept/)

### Changed

- Rebranded Vacuumlabs Auditing to [Invariant0](https://invariant0.com/), the Fresh New Face of Vacuumlabs Auditing.

## Version 0.2 (Milestone 2) - [2024-08-27]

### Added

- We added the second version of the whitepaper, including:
  - The integration of programmable tokens with wallets. Recognizing programmable tokens both off-chain and on-chain, an idea on how to construct transactions featuring programmable tokens and other relevant recommendations.
  - The integration of programmable tokens with existing and future dApps. Includes a thorough commentary on the new smart contract considerations and possibly new attack vectors that need to be thought-about.
  - Template-based programmable tokens. An idea and a design that allows reusing programmable checks for multiple projects with the possibility of setting project-based parameters.

## Version 0.1 (Milestone 1) - [2024-06-12]

### Added

- We added the first version of the whitepaper, including:
  - Introduction describing the motivation, current research and our approach.
  - Basic protocol idea section delving into the goals, technical description of the solution, a walk-through with transaction diagrams and a description of basic use cases incl. freezing transfers, enforcing fees on transfer and address blacklisting / whitelisting.
  - Extensions of the protocol section describing more advanced optional extensions that perfect the protocol's shortcomings.
