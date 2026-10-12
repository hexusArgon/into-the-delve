import type { CSSProperties } from "react";
import { markDataUrl } from "./logo";

// Icons of the sign-in buttons (./LoginScreen), inlined as SVG data-URIs like the logo: no asset
// pipeline and no image files in the project.
//
// The provider marks (Google, Telegram) keep the providers' own colours - they tell the player which
// account the button uses, and Google asks for exactly that mark. Everything else (wallet, iDos,
// Apple, e-mail, guest) is ONE colour taken from the theme (src/ui.config.ts): an image cannot read a
// CSS variable, so the screen builds these with the resolved colours.

const svg = (body: string, viewBox = "0 0 24 24"): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`,
  )}`;

const line = (paths: string, color: string): string =>
  svg(
    `<g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`,
  );

/** `ink` — text on the secondary buttons, `onPrimary` — text on the primary (wallet) button. */
export const loginIcons = ({
  ink,
  dim,
  onPrimary,
}: {
  ink: string;
  dim: string;
  onPrimary: string;
}) => ({
  wallet: line(
    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    onPrimary,
  ),
  idos: markDataUrl(ink),
  // The multicolor G on a white disc: on the translucent button it would lose its colors.
  google: svg(
    '<circle cx="24" cy="24" r="24" fill="#fff"/><g transform="translate(9 9) scale(.625)"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></g>',
    "0 0 48 48",
  ),
  apple: svg(
    `<path fill="${ink}" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>`,
  ),
  // Telegram's own mark: the blue disc with the white plane (the path is the disc with the plane cut
  // out, so the plane shows the white circle under it).
  telegram: svg(
    '<circle cx="12" cy="12" r="11" fill="#fff"/><path fill="#27a7e7" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>',
  ),
  email: line(
    '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    ink,
  ),
  guest: line(
    '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    dim,
  ),
});

/**
 * An icon at the left edge of a full-width button, with the label kept centered: the same padding
 * on both sides. A background, not a child element, so it also fits the wallet button, whose
 * content the wallet package draws and only takes a `style` from here.
 */
export function withIcon(icon: string, under?: string): CSSProperties {
  // `under` — the button's own fill (a gradient), kept as a second image layer below the icon.
  return {
    backgroundImage: under ? `url("${icon}"), ${under}` : `url("${icon}")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: under ? "14px center, 0 0" : "14px center",
    backgroundSize: under ? "20px 20px, 100% 100%" : "20px 20px",
    paddingLeft: "44px",
    paddingRight: "44px",
  };
}
