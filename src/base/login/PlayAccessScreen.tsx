import type { ReactNode } from "react";
import {
  DefaultPlayAccessScreen,
  type PlayAccessScreenProps,
} from "@idosgames/app-shell";
import { renderWalletLink } from "../../walletLogin";

// The play-access screen. The host shows it INSTEAD of the game while the title's login mode
// (platform setting: Blockchain -> login mode) requires a token balance the player has not confirmed
// yet — no linked wallet, balance too low, or the pass expired. The server re-checks the balance on
// every login and session refresh; this screen is the manual path in between.
//
// The ready-made screen lists the requirements, the player's linked wallets, "Link wallet" (from
// ./walletLogin) and "Check balance". Restyle freely: replace the body with your own UI and keep
// calling client.blockchain.getPlayAccess() / confirmPlayAccess() and props.onGranted().
export function PlayAccessScreen(props: PlayAccessScreenProps): ReactNode {
  return (
    <DefaultPlayAccessScreen {...props} renderLinkWallet={renderWalletLink} />
  );
}
