import { LazyWalletLogin } from "@idosgames/wallet/react/lazy";
import type { RenderLinkWallet } from "@idosgames/app-shell";
import type { LoginScreenExtras } from "./base/login/LoginScreen";
import { ENV_WALLETCONNECT_PROJECT_ID } from "./env";
import {
  IDOS_WEB3_NETWORK_ID,
  IDOS_WEB3_WALLETCONNECT_PROJECT_ID,
} from "./idos.title";

// Wallet sign-in seam — ON by default: every project offers "Sign in with wallet".
//
// The button uses the SDK's default EVM chain set (no `chains` prop). The challenge network comes
// from the title (IDOS_WEB3_NETWORK_ID, baked by the platform); the "bsc" fallback keeps the button
// alive on titles that did not pick a network at creation. A title whose Blockchain config is empty
// will surface the server's error under the button — fix that by configuring the network (backend
// MCP: get_blockchain / save_blockchain), not by hiding the button. To restrict the chains, import
// them from this same subpath (mainnet, bsc, polygon, base, arbitrum, optimism, sepolia,
// polygonAmoy — plain objects, safe to import) and pass `chains={[…]}`.
//
// For a title created with the web3 toggle the platform regenerates this file with the title's own
// network. Keeping the seam in its own file is what makes that swap (and your own edits) safe.
//
// The import is "@idosgames/wallet/react/lazy", NOT "@idosgames/wallet/react". The wallet stack
// (Reown AppKit + wagmi/viem) is megabytes of code most players never need; the lazy entry keeps it
// out of the first load until the player actually taps sign-in.
//
// walletConnectProjectId adds MOBILE wallets via the WalletConnect QR/deep-link modal; without it
// the button only works with injected wallets (MetaMask & co) and mobile login is unavailable. It
// comes from the title's blockchain config (IDOS_WEB3_WALLETCONNECT_PROJECT_ID, baked by the
// platform); VITE_WALLETCONNECT_PROJECT_ID in .env.local is a local-dev fallback.
//
// No `chains` is passed on purpose: the button falls back to the SDK's default EVM chain set, which
// is the SAME list the in-game wallet panel uses. That shared list is what lets the login and the
// panel share one wallet config, so a wallet connected here stays connected in the game.

export const renderWalletLogin: LoginScreenExtras["renderWalletLogin"] = ({
  client,
  onAuthenticated,
  disabled,
  style,
}) => (
  <LazyWalletLogin
    client={client}
    networkID={IDOS_WEB3_NETWORK_ID || "bsc"}
    onAuthenticated={onAuthenticated}
    disabled={disabled}
    style={style}
    walletConnectProjectId={
      IDOS_WEB3_WALLETCONNECT_PROJECT_ID ||
      ENV_WALLETCONNECT_PROJECT_ID ||
      undefined
    }
  />
);

// "Link wallet" on the play-access screen (./base/login/PlayAccessScreen) — the same button in link mode. When
// the title's login mode requires a token balance, a player who signed in another way attaches a
// wallet to the account by signature, and the server checks the balance against exactly that
// wallet. `networkID` is the network a requirement needs; the title's own network otherwise.
export const renderWalletLink: RenderLinkWallet = ({
  client,
  networkID,
  onLinked,
  disabled,
  style,
}) => (
  <LazyWalletLogin
    mode="link"
    client={client}
    networkID={networkID || IDOS_WEB3_NETWORK_ID || "bsc"}
    onLinked={onLinked}
    disabled={disabled}
    style={style}
    walletConnectProjectId={
      IDOS_WEB3_WALLETCONNECT_PROJECT_ID ||
      ENV_WALLETCONNECT_PROJECT_ID ||
      undefined
    }
  />
);
