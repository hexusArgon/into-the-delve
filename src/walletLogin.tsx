import { useState, type CSSProperties, type ReactNode } from "react";
import type { IDosGamesClient } from "@idosgames/core";
import type { RenderLinkWallet } from "@idosgames/app-shell";
import type { LoginScreenExtras } from "./base/login/LoginScreen";
import { IDOS_WEB3_NETWORK_ID } from "./idos.title";

// Into the Delve signs in on Solana. This title has no WalletConnect project id, so the button
// talks to the injected browser wallet (Phantom and the same window.solana slot) and never opens
// a mobile WalletConnect link.

const SOLANA_NETWORK_ID = IDOS_WEB3_NETWORK_ID || "solana";

type SolanaPublicKey = { toString(): string };

type SolanaProvider = {
  publicKey: SolanaPublicKey | null;
  connect(): Promise<{ publicKey: SolanaPublicKey }>;
  signMessage(
    message: Uint8Array,
    display?: "utf8",
  ): Promise<{ signature: Uint8Array } | Uint8Array>;
};

function browserSolana(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    phantom?: { solana?: SolanaProvider };
    solana?: SolanaProvider;
  };
  return host.phantom?.solana ?? host.solana ?? null;
}

function signatureHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

async function signChallenge(provider: SolanaProvider, message: string): Promise<string> {
  const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  const bytes = signed instanceof Uint8Array ? signed : signed.signature;
  return signatureHex(bytes);
}

function walletError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/reject|denied|cancel/i.test(message)) return "Request declined in the wallet.";
  if (message === "INVALID_WALLET_SIGNATURE") return "The signature does not match the wallet. Please try again.";
  if (message === "WALLET_CHALLENGE_EXPIRED") return "The request expired. Please try again.";
  if (message === "PLAY_ACCESS_WALLET_USED_BY_ANOTHER_ACCOUNT") return "This wallet already plays with another account.";
  return message || "Wallet sign-in failed. Please try again.";
}

function SolanaWalletButton({
  client,
  networkID,
  disabled,
  style,
  label,
  onDone,
}: {
  client: IDosGamesClient;
  networkID: string;
  disabled?: boolean;
  style?: CSSProperties;
  label: string;
  onDone: (provider: SolanaProvider, address: string) => Promise<void>;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        style={style}
        onClick={() => {
          setError(null);
          const provider = browserSolana();
          if (!provider) {
            setError("No Solana wallet found in this browser. Install Phantom, then try again.");
            return;
          }
          setBusy(true);
          void (async () => {
            try {
              const connected = provider.publicKey
                ? { publicKey: provider.publicKey }
                : await provider.connect();
              await onDone(provider, connected.publicKey.toString());
            } catch (caught) {
              setError(walletError(caught));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "Check your wallet…" : label}
      </button>
      {error ? (
        <span role="alert" style={{ display: "block", marginTop: 6, color: "#ff9b9b", fontSize: 13, textAlign: "center" }}>
          {error}
        </span>
      ) : null}
    </>
  );
}

export const renderWalletLogin: LoginScreenExtras["renderWalletLogin"] = ({
  client,
  onAuthenticated,
  disabled,
  style,
}) => (
  <SolanaWalletButton
    client={client}
    networkID={SOLANA_NETWORK_ID}
    disabled={disabled}
    style={style}
    label="Sign in with wallet"
    onDone={async (provider, address) => {
      const challenge = await client.auth.requestWalletChallenge(address, SOLANA_NETWORK_ID);
      if (!challenge.ok) throw new Error(challenge.error);
      const signature = await signChallenge(provider, challenge.data.Message);
      const session = await client.auth.loginWithWallet(address, SOLANA_NETWORK_ID, signature);
      if (!session.ok) throw new Error(session.error);
      onAuthenticated();
    }}
  />
);

export const renderWalletLink: RenderLinkWallet = ({
  client,
  networkID,
  onLinked,
  disabled,
  style,
}) => (
  <SolanaWalletButton
    client={client}
    networkID={networkID || SOLANA_NETWORK_ID}
    disabled={disabled}
    style={style}
    label="Link wallet"
    onDone={async (provider, address) => {
      const chain = networkID || SOLANA_NETWORK_ID;
      const issued = await client.auth.linkWallet(address, chain);
      if (!issued.ok) throw new Error(issued.error);
      const message = issued.data.Challenge;
      if (!message) throw new Error("No challenge was issued.");
      const signature = await signChallenge(provider, message);
      const linked = await client.auth.linkWallet(address, chain, signature);
      if (!linked.ok) throw new Error(linked.error);
      onLinked(linked.data.PlayAccess ?? null);
    }}
  />
);
