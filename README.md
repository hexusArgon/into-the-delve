# Into the Delve

Into the Delve is a turn-based dungeon. A turn is spent when you step or strike. An enemy's coming attack is marked on the floor before it lands. Health carries from room to room. Items found in the dungeon can be sharpened, and they can be listed on the player auction.

The client is TypeScript and React on Vite, built on the iDos Games SDK.

Published game:

- https://h406pwm7.idos.games/
- https://idosgames.com/app/H406PWM7/

## Run locally

```bash
npm install
npm run dev
```

On your own machine the dungeon opens directly. On the published addresses above, the game asks you to sign in first, then starts the dungeon.

## Solana

The title's token is Into the Delve, on Solana. The mint is `DKUTac2m6WnjWfF54UuqL4Cteavos6sQDmA8WPK9idos`. Deposits and withdrawals are enabled.

Sign-in offers Play as guest and Sign in with wallet. The wallet signs the login challenge on Solana. No token balance is required to enter. Guest sign-in stays available. There is no WalletConnect project id on this title, so the wallet button uses a browser wallet rather than a mobile WalletConnect link.
