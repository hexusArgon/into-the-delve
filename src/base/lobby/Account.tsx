import { useState, type CSSProperties, type ReactNode } from "react";
import type { FeatureRegistry } from "@idosgames/module-sdk";
import { useIDosGamesClient } from "@idosgames/react";
import {
  Button,
  Icon,
  outlined,
  Popup,
  useGameLayout,
  useUiKit,
  v,
  well,
} from "@idosgames/react/ui";
import { t } from "./i18n";

// The player's corner of the lobby header. With the profile module installed (and available) the
// button opens its screen; otherwise a small popup with the player ID (tap to copy) and "Log out".
// The base takes the "account" role, so the host never floats its own copy over the tabs.

export function Account({
  features,
}: {
  features: FeatureRegistry;
}): ReactNode {
  const client = useIDosGamesClient();
  const kit = useUiKit();
  const layout = useGameLayout();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const userID = client.auth.context?.userID ?? null;
  const hasProfile = features.get("profile")?.available === true;

  const copy = (): void => {
    if (!userID) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(userID);
      } catch {
        const area = document.createElement("textarea");
        area.value = userID;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    })();
  };
  const logout = (): void => void client.auth.logout();
  const shortID =
    userID && userID.length > 12
      ? `${userID.slice(0, 5)}…${userID.slice(-5)}`
      : userID;
  const onProfile = (): void => {
    kit.play("click");
    if (hasProfile) features.open("profile");
    else setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className="idos-press"
        aria-label={t("profile")}
        onClick={onProfile}
        style={chip}
        data-tutorial-anchor="lobby:profile"
      >
        <Icon glyph="user" size={layout === "phone" ? 30 : 24} />
        {layout !== "phone" && shortID ? (
          <span
            style={{
              fontFamily: "ui-monospace, Consolas, monospace",
              fontSize: 13,
            }}
          >
            {shortID}
          </span>
        ) : null}
      </button>
      {open ? (
        <Popup title={t("profile")} onClose={() => setOpen(false)} width={380}>
          <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
            <Icon glyph="user" size={64} />
            {userID ? (
              <>
                <div style={{ ...outlined, fontSize: 13, color: v.textDim }}>
                  {t("playerId")}
                </div>
                <div
                  style={{
                    ...outlined,
                    fontFamily: "ui-monospace, Consolas, monospace",
                    fontSize: 14,
                    wordBreak: "break-all",
                    textAlign: "center",
                  }}
                >
                  {userID}
                </div>
              </>
            ) : null}
          </div>
          {userID ? (
            <Button tone="blue" onClick={copy}>
              <Icon glyph={copied ? "check" : "copy"} size={20} />{" "}
              {copied ? t("copied") : t("copyId")}
            </Button>
          ) : null}
          <Button tone="grey" onClick={logout}>
            <Icon glyph="logout" size={20} /> {t("logout")}
          </Button>
        </Popup>
      ) : null}
    </>
  );
}

const chip: CSSProperties = {
  ...outlined,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: 3,
  paddingRight: 10,
  borderRadius: 999,
  ...well,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
