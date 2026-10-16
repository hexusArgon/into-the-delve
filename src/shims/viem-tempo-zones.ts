/** Build shim. This viem build has no `viem/tempo/zones` export. Tempo is not used for Solana sign-in. */
export const Abis = {};

export function zone(): never {
  throw new Error("Tempo zones are not part of this game.");
}
