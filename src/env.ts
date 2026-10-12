// Build-time values from Vite's `import.meta.env`: the VITE_* variables of `.env.local` (local
// development). In the platform's editor nothing sets them, so the defaults below apply — the
// title and environment come from src/config.ts, not from here.
const env = import.meta.env;

export const IS_DEV = env.DEV;
export const ENV_TITLE_ID: string = env.VITE_IDOS_TITLE_ID ?? "";
export const ENV_BUILD_KEY: string = env.VITE_IDOS_BUILD_KEY ?? "";
export const ENV_WALLETCONNECT_PROJECT_ID: string =
  env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/** Google Identity client id. Empty = the login screen hides the Google button rather than
 *  offering one that cannot work (a Google sign-in needs a real ID token). */
export const ENV_GOOGLE_CLIENT_ID: string =
  env.VITE_IDOS_GOOGLE_CLIENT_ID ?? "";
