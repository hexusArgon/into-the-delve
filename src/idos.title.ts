// The project's IDENTITY file — the ONE centralized place the Title id lives.
//
// On platform-created projects the platform GENERATES this file when it creates the project; there
// the AI editor is denied write access to this path on purpose — do not edit it by hand. On a
// manually scaffolded project (get_host_scaffold / copied template) there is no generator: YOU fill
// IDOS_TITLE_ID here yourself. Either way, do not import anything into this file, and do not bind
// the title anywhere else (.env.local is a local-dev fallback for the raw template only).
//
// It is the highest-priority source of the Title id (see config.ts for the full chain). It is baked
// into the bundle rather than read from the URL because a build has to keep working where there is
// no URL to read — packaged as a mobile app, embedded in an iframe, or opened from a shared link
// that dropped its query string.
//
// It holds the CANONICAL (production) title. The DEV title is derived from it, never stored here —
// one project has one identity, and DEV/PROD is an environment on top of that identity.

/** Canonical (production) Title id. Empty only in the raw template, before the platform seeds it. */
export const IDOS_TITLE_ID = "";

/** Build key for this title, if the title enforces one. */
export const IDOS_BUILD_KEY = "";

/** Environment this artifact defaults to. Web builds may override it (see config.ts); a packaged
 *  mobile build cannot, so a DEV app is produced by generating this file with "dev". */
export const IDOS_DEFAULT_ENV: "prod" | "dev" = "prod";

/**
 * Whether this title was created as web3. Set by the platform from the same toggle the publisher
 * used at title creation.
 *
 * It no longer gates the login screen — wallet sign-in is always offered (see walletLogin.tsx).
 * Kept as baked metadata for code that wants to know the title's web3 origin BEFORE there is a
 * session (`client.title.getTitlePublicConfiguration()` requires one).
 */
export const IDOS_WEB3 = false;

/**
 * NetworkID the wallet login challenge is issued for (e.g. "bsc", "base", "solana"). Empty on
 * web2 titles. Baked for the same reason as everything else here: the login screen needs it before
 * there is a session, and the title's blockchain config is only readable once logged in.
 */
export const IDOS_WEB3_NETWORK_ID = "";

/**
 * WalletConnect Cloud / Reown project id (dashboard.reown.com). Enables MOBILE wallet login via
 * WalletConnect (QR on desktop, deep-link on phones); without it only browser-extension wallets
 * are offered and mobile login is unavailable. Set per-title in the blockchain config
 * (Blockchain.WalletLogin.WalletConnectProjectId) — the platform bakes it here. Baked, not read at
 * runtime, for the same reason as IDOS_WEB3_NETWORK_ID: the login screen runs before there is a
 * session, and the title's blockchain config is only readable once logged in.
 */
export const IDOS_WEB3_WALLETCONNECT_PROJECT_ID = "";
