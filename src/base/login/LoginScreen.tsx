import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AuthType,
  beginSsoRedirect,
  type AuthOptionsResponse,
} from "@idosgames/core";
import type { LoginScreenProps } from "@idosgames/app-shell";
import { ENV_GOOGLE_CLIENT_ID } from "../../env";
import {
  buttonStyle,
  outlined,
  panel,
  screenBackground,
  useUiKit,
  v,
} from "@idosgames/react/ui";
import { logoDataUrl } from "./logo";
import { loginIcons, withIcon } from "./loginIcons";

// The Login scene. The host runtime owns WHEN this is shown (the auth gate in
// @idosgames/app-shell); this file owns what it LOOKS like and which providers it offers.
// Edit freely — branding, layout, copy, buttons. Colours, fonts and corner radii are NOT set here: they
// come from the theme in src/ui.config.ts (the same tokens the lobby and every system use), so a new
// look is one edit there and sign-in follows it.
//
// Providers on `client.auth`: loginWithDeviceID (guest), loginWithEmail + registerWithEmail,
// loginWithGoogle, loginWithApple, loginWithTelegram, loginWithWallet, loginWithSsoCode, plus
// forgotPassword/resetPassword.
//
// A provider is only rendered when it can actually complete, so players never meet a dead button:
//   guest / email - always available, no external setup (guest only on an open title).
//   Google        - the title's own Google sign-in (platform setting) or VITE_IDOS_GOOGLE_CLIENT_ID;
//                   the Google Identity script is loaded on demand.
//   Apple         - when the title set up Sign in with Apple for the web (a Services ID).
//   Telegram      - only inside a Telegram Mini App (it signs in with the app's initData).
//   wallet        - always offered; ./walletLogin owns the wagmi config and the challenge network.
//   iDos Games    - only where the platform accepts a return_to (see isSsoAvailable below).
//
// The title's login mode decides the rest (platform setting: Blockchain -> login mode):
//   Open                - every method;
//   AnyWithLinkedWallet - every method except guest (a guest cannot link a wallet);
//   WalletOnly          - the wallet and iDos Games only: an iDos Games account plays with a wallet
//                         linked to it (one wallet - one account), everything else is refused.

// Куда платформа соглашается вернуть одноразовый код. Список повторяет allowlist на бэкенде
// (SsoService.AllowedOrigins) НАМЕРЕННО: здесь он решает только, показывать ли кнопку, а
// настоящий барьер стоит на сервере. Показать кнопку там, где сервер откажет, — значит
// пообещать игроку вход, который не состоится.
const SSO_ORIGINS = [
  "https://cloud.idosgames.com",
  "https://idosgames.com",
  "https://www.idosgames.com",
];

// Свои адреса игры: {titleid}.idos.games и {titleid}-dev.idos.games (её DEV-копия). Сервер примет
// каждый ТОЛЬКО для этого же тайтла.
const GAME_HOST = /^https:\/\/[a-z0-9]{8}(-dev)?\.idos\.games$/;

function isSsoAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const { origin } = window.location;
  if (SSO_ORIGINS.includes(origin) || GAME_HOST.test(origin)) return true;

  // Свой домен издателя (play.brand.com) id тайтла не несёт, и по origin не понять, сработает ли
  // вход. Страницу, которую отдаёт платформа, её сервер помечает этой меткой — а на свой домен он
  // отдаёт игру, только когда домен подключён к ЭТОМУ тайтлу. В превью и на чужом хостинге метки нет.
  return (
    typeof document !== "undefined" &&
    document.querySelector('meta[name="idos-game-host"]') !== null
  );
}

export interface LoginScreenExtras {
  /**
   * Wallet sign-in. Supplied by ./walletLogin (wired in main.tsx), which renders the ready-made
   * `WalletLogin` from `@idosgames/wallet/react`: connect → sign the challenge → session, then
   * `onAuthenticated()`. The screen passes its own `style` so the button matches the theme.
   *
   * A remembered wallet session comes back on the next launch by its refresh token (no new
   * signature); the server re-checks the token balance on it when the title's login mode needs one.
   */
  renderWalletLogin?: (props: {
    client: LoginScreenProps["client"];
    onAuthenticated: () => void;
    disabled: boolean;
    style?: CSSProperties;
  }) => ReactNode;
}

/** Пауза повторной отправки, когда сервер её не назвал. Совпадает со значением платформы. */
const DEFAULT_RESEND_COOLDOWN = 60;

/**
 * Служебный код отказа → фраза, которую можно показать игроку.
 *
 * ⚠ Без этого экран входа показывал коды КАК ЕСТЬ: игрок видел «EMAIL_SENDER_NOT_CONFIGURED» или
 * «VERIFICATION_CODE_ATTEMPTS_EXCEEDED» вместо объяснения. Это шаблон, с которого начинается
 * каждая игра издателя, поэтому такое уезжает сразу всем.
 *
 * Незнакомый код возвращается как есть — намеренно: издателю на стенде он полезнее, чем общая
 * фраза «что-то пошло не так», а список ниже растёт по мере появления новых.
 */
function humanizeAuthError(code: string | undefined): string {
  switch (code) {
    case "EMAIL_SENDER_NOT_CONFIGURED":
      return "Sign-in by e-mail is unavailable in this game right now. Try another way to sign in.";
    case "INVALID_VERIFICATION_CODE":
      return "That code is not right. Check the e-mail and try again.";
    case "VERIFICATION_CODE_ATTEMPTS_EXCEEDED":
      return "Too many wrong attempts. Ask for a new code.";
    case "INCORRECT_EMAIL_OR_PASSWORD":
      return "Wrong e-mail or password.";
    case "INCORRECT_EMAIL":
      return "That does not look like an e-mail address.";
    case "PASSWORD_LENGTH_INVALID":
      return "The password must be 8 to 100 characters long.";
    case "TOO_MANY_FAILED_ATTEMPTS":
      return "Too many attempts. Please try again a little later.";
    case "RATE_LIMIT_EXCEEDED":
      return "Too many requests. Please try again in a moment.";
    case "PLAY_ACCESS_WALLET_LOGIN_ONLY":
      return "This game can only be entered with a crypto wallet or your iDos Games account.";
    case "PLAY_ACCESS_WALLET_USED_BY_ANOTHER_ACCOUNT":
      return "This wallet already plays with another account.";
    case "WALLET_UNLINK_COOLDOWN":
      return "This wallet was unlinked from another account less than 7 days ago. Try again after the 7 days.";
    case "APPLE_EMAIL_MISSING":
      return "Apple did not share an e-mail address. Try again and allow it, or use another way to sign in.";
    case "PLAY_ACCESS_GUEST_DISABLED":
      return "Guest play is off in this game. Sign in to link a crypto wallet.";
    case "PLAY_ACCESS_CHECK_FAILED":
      return "Could not check your token balance right now. Please try again in a moment.";
    default:
      return code ?? "Something went wrong. Please try again.";
  }
}

type Mode = "menu" | "email" | "verify" | "forgot" | "reset";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
const APPLE_SCRIPT =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

/** Loads a provider's script once; resolves when it has run. */
function loadScript(src: string): Promise<void> {
  if (typeof document === "undefined")
    return Promise.reject(new Error("no document"));
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${src}"]`,
  );
  if (existing?.dataset.loaded === "1") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = existing ?? document.createElement("script");
    el.addEventListener("load", () => {
      el.dataset.loaded = "1";
      resolve();
    });
    el.addEventListener("error", () =>
      reject(new Error(`could not load ${src}`)),
    );
    if (!existing) {
      el.src = src;
      el.async = true;
      document.head.appendChild(el);
    }
  });
}

/** A random nonce for the provider's request: the server checks the token carries it, then burns it. */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Inside a Telegram Mini App the app hands over signed initData - the one thing Telegram login needs. */
function hasTelegramInitData(): boolean {
  const tg = (globalThis as { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram;
  return Boolean(tg?.WebApp?.initData);
}

/** Minimal Sign in with Apple JS surface - declared here so the template needs no Apple typings. */
type AppleIdentity = {
  auth: {
    init(config: {
      clientId: string;
      scope: string;
      redirectURI: string;
      usePopup: boolean;
      nonce?: string;
    }): void;
    signIn(): Promise<{
      authorization: { id_token: string };
      user?: { name?: { firstName?: string; lastName?: string } };
    }>;
  };
};

/** Minimal Google Identity surface — declared here so the template needs no @types/google.accounts. */
type GoogleIdentity = {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
      }): void;
      prompt(): void;
    };
  };
};

export function LoginScreen({
  client,
  onAuthenticated,
  renderWalletLogin,
}: LoginScreenProps & LoginScreenExtras): ReactNode {
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(DEFAULT_RESEND_COOLDOWN);

  const [remember, setRemember] = useState(true);
  // Images cannot read CSS variables — the logo and the icons are painted with the resolved theme.
  const theme = useUiKit().config.theme;
  const logo = useMemo(() => logoDataUrl(theme.text), [theme.text]);
  const icons = useMemo(
    () =>
      loginIcons({
        ink: theme.text,
        dim: theme.textDim,
        onPrimary: theme.onGreen,
      }),
    [theme.text, theme.textDim, theme.onGreen],
  );

  const [notice, setNotice] = useState<string | null>(null);

  // The title's sign-in settings, read before login: the login mode (so the screen never offers a
  // method the server refuses anyway) and which providers the title set up (Google, Apple). Until
  // they arrive the open-title set is shown - the server check is the real barrier, this only
  // keeps dead buttons off the screen.
  const [options, setOptions] = useState<AuthOptionsResponse | null>(null);
  useEffect(() => {
    let active = true;
    void client.auth.getAuthOptions().then((result) => {
      if (active && result.ok) setOptions(result.data);
    });
    return () => {
      active = false;
    };
  }, [client]);
  const loginMode = options?.PlayAccessMode ?? "Open";
  const walletOnly = loginMode === "WalletOnly";
  const guestAllowed = loginMode === "Open";
  const googleClientID =
    ENV_GOOGLE_CLIENT_ID ||
    (options?.Google?.Enabled ? (options.Google.WebClientID ?? "") : "");
  const appleServiceID = options?.Apple?.Enabled
    ? (options.Apple.ServiceID ?? "")
    : "";
  const telegram = hasTelegramInitData();
  const sso = isSsoAvailable();

  /**
   * «Continue with iDos Games»: сначала уже имеющаяся сессия, и только без неё — за новым кодом на
   * сайт (решение владельца 02.10.2026). Новый вход — это новая сессия в движке, а лимит устройств
   * тайтла по умолчанию одно: лишний вход вытесняет живую сессию этого же игрока (другую вкладку,
   * телефон) и стоит ухода со страницы. Живой refresh-токен продлевается одним запросом.
   *
   * Без живого токена `autoLogin()` для входа через iDos Games просто отказывает — в гостя он не
   * уводит (`replay` такой вход не повторяет), поэтому дальше идёт обычный уход на /sso.
   */
  const continueWithIdosGames = async (): Promise<void> => {
    if (client.auth.lastAuthType === AuthType.iDosGames) {
      setBusy(true);
      setError(null);
      const resumed = await client.auth.autoLogin();
      if (resumed.ok) {
        onAuthenticated();
        return;
      }
      setBusy(false);
    }
    beginSsoRedirect({ titleID: client.titleID });
  };

  /** Every provider goes through here, so one place owns the busy flag and the error surface. */
  const run = async (
    login: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    // "Remember me" is read when the login completes, so set it before starting one. Off = this
    // session works normally but is not written to storage, so the next launch lands here again.
    client.auth.setRememberSession(remember);
    const result = await login();
    if (result.ok) {
      onAuthenticated();
      return;
    }
    setError(
      humanizeAuthError(result.error) ?? "Sign-in failed. Please try again.",
    );
    setBusy(false);
  };

  /**
   * Регистрация — единственный провайдер, который НЕ обязательно заканчивается входом.
   *
   * Когда тайтл требует подтверждения адреса (а это значение платформы), сервер только отправляет
   * код, и аккаунта ещё нет. Поэтому она идёт мимо `run`: тот на успехе сразу зовёт
   * `onAuthenticated()`, а здесь на успехе надо показать экран ввода кода.
   */
  const register = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    client.auth.setRememberSession(remember);

    const result = await client.auth.registerWithEmail(email, password);

    if (!result.ok) {
      setError(
        humanizeAuthError(result.error) ?? "Sign-up failed. Please try again.",
      );
      setBusy(false);
      return;
    }

    // Аккаунта ещё нет — он появится на подтверждении. Уйти в игру здесь значило бы показать
    // пустую сессию.
    setCode("");

    // Паузу задаёт СЕРВЕР (её настраивает издатель), поэтому запоминаем её и дальше берём
    // отсюда. Раньше первый отсчёт шёл от ответа, а каждый следующий — от захардкоженных 60
    // секунд: у тайтла с другой настройкой кнопка либо открывалась раньше, чем сервер согласен
    // слать (нажатие впустую, ответ всё равно успешный), либо держалась закрытой дольше нужного.
    const cooldown = result.data.resendCooldownSeconds ?? 0;
    setResendCooldown(cooldown > 0 ? cooldown : DEFAULT_RESEND_COOLDOWN);

    setResendIn(cooldown);
    setMode("verify");
    setBusy(false);
  };

  const resendCode = async (): Promise<void> => {
    setBusy(true);
    setError(null);

    const result = await client.auth.resendVerificationCode(email);

    // Ответ почти всегда успешный — начата регистрация или нет, выдержана пауза или нет. Иначе
    // эта кнопка отвечала бы на вопрос «заведён ли такой адрес». Поэтому и таймер заводим всегда.
    //
    // ⚠ Но ОДИН отказ отсюда приходит и его нельзя глотать: «слать нечем» (у тайтла и у
    // платформы нет отправителя). Он про конфигурацию сервера, а не про адрес, поэтому и
    // безопасен, и обязателен — иначе игрок жмёт кнопку до посинения, ожидая письма, которого
    // никто не отправлял.
    if (!result.ok) setError(humanizeAuthError(result.error));

    setResendIn(resendCooldown);
    setBusy(false);
  };

  // Обратный отсчёт до следующей отправки. Без него игрок жмёт «ещё раз» вслепую, а сервер молча
  // отказывает — и выглядит это как сломанная кнопка.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const signInWithGoogle = async (): Promise<void> => {
    try {
      await loadScript(GOOGLE_SCRIPT);
    } catch {
      // Handled below: no global means the script is unavailable.
    }
    const google = (globalThis as { google?: GoogleIdentity }).google;
    if (!google) {
      setError(
        "Google sign-in is unavailable: the Google Identity script did not load.",
      );
      return;
    }
    setError(null);
    google.accounts.id.initialize({
      client_id: googleClientID,
      callback: (response) => {
        if (!response.credential) {
          setError("Google sign-in was cancelled.");
          return;
        }
        void run(() => client.auth.loginWithGoogle(response.credential ?? ""));
      },
    });
    google.accounts.id.prompt();
  };

  const signInWithApple = async (): Promise<void> => {
    setError(null);
    try {
      await loadScript(APPLE_SCRIPT);
    } catch {
      setError("Apple sign-in is unavailable: the Apple script did not load.");
      return;
    }
    const apple = (globalThis as { AppleID?: AppleIdentity }).AppleID;
    if (!apple) {
      setError("Apple sign-in is unavailable: the Apple script did not load.");
      return;
    }
    const nonce = randomNonce();
    apple.auth.init({
      clientId: appleServiceID,
      scope: "name email",
      // Must be a return URL registered for this Services ID; with a popup Apple only checks it.
      redirectURI: `${window.location.origin}/`,
      usePopup: true,
      nonce,
    });
    try {
      const response = await apple.auth.signIn();
      const name = [
        response.user?.name?.firstName,
        response.user?.name?.lastName,
      ]
        .filter(Boolean)
        .join(" ");
      await run(() =>
        client.auth.loginWithApple(response.authorization.id_token, {
          nonce,
          name,
        }),
      );
    } catch {
      // The player closed Apple's window - nothing to report.
    }
  };

  /** "Forgot password": the server e-mails a code; the next step sets the new password with it. */
  const sendResetCode = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await client.auth.forgotPassword(email);
    setBusy(false);
    // Like the resend: the answer does not say whether the address has an account - except "there
    // is nothing to send with", which is about the server and must be shown.
    if (!result.ok && result.error === "EMAIL_SENDER_NOT_CONFIGURED") {
      setError(humanizeAuthError(result.error));
      return;
    }
    setCode("");
    setPassword("");
    setMode("reset");
  };

  const resetPassword = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await client.auth.resetPassword(
      email,
      code.trim(),
      password,
    );
    setBusy(false);
    if (!result.ok) {
      setError(humanizeAuthError(result.error));
      return;
    }
    setPassword("");
    setNotice("Password changed. Sign in with the new one.");
    setMode("email");
  };

  return (
    <div style={styles.root}>
      {/* Placeholder color is a pseudo-element, unreachable from inline styles — this one rule is
          the whole reason for the style tag. */}
      <style>{`.idos-input::placeholder { color: ${v.textDim}; opacity: 1; }`}</style>
      <div style={styles.card}>
        <img src={logo} alt="iDos Games" style={styles.logo} />
        <h1 style={styles.title}>Sign in</h1>

        {mode === "menu" && (
          <div style={styles.stack}>
            {renderWalletLogin?.({
              client,
              onAuthenticated,
              disabled: busy,
              style: {
                ...styles.button,
                ...styles.primary,
                ...withIcon(icons.wallet, PRIMARY_FILL),
              },
            })}

            {/* Вход платформенным аккаунтом: уходим на idosgames.com/sso и возвращаемся сюда
                с одноразовым кодом, который AuthGate обменяет сам. Кнопка нужна только тем,
                кто открыл игру НАПРЯМУЮ: пришедший с сайта уже вернулся с кодом и этот экран
                не увидит вовсе.

                Скрыта там, где SSO заведомо откажет — бэкенд принимает return_to только со
                своих origin'ов, и в превью/на localhost показывать кнопку значило бы обещать
                игроку то, что не сработает. */}
            {sso && (
              <button
                type="button"
                style={{ ...styles.button, ...withIcon(icons.idos) }}
                onClick={() => void continueWithIdosGames()}
                disabled={busy}
              >
                Continue with iDos Games
              </button>
            )}

            {walletOnly && sso && (
              <p style={styles.hint}>
                Signing in with iDos Games? Link your wallet after that - the
                game is played with a wallet.
              </p>
            )}

            {!walletOnly && googleClientID && (
              <button
                type="button"
                style={{ ...styles.button, ...withIcon(icons.google) }}
                onClick={() => void signInWithGoogle()}
                disabled={busy}
              >
                Continue with Google
              </button>
            )}

            {!walletOnly && appleServiceID && (
              <button
                type="button"
                style={{ ...styles.button, ...withIcon(icons.apple) }}
                onClick={() => void signInWithApple()}
                disabled={busy}
              >
                Continue with Apple
              </button>
            )}

            {!walletOnly && telegram && (
              <button
                type="button"
                style={{ ...styles.button, ...withIcon(icons.telegram) }}
                onClick={() => void run(() => client.auth.loginWithTelegram())}
                disabled={busy}
              >
                Continue with Telegram
              </button>
            )}

            {!walletOnly && (
              <button
                type="button"
                style={{ ...styles.button, ...withIcon(icons.email) }}
                onClick={() => setMode("email")}
                disabled={busy}
              >
                Continue with email
              </button>
            )}

            {guestAllowed && (
              <button
                type="button"
                style={styles.ghost}
                onClick={() => void run(() => client.auth.loginWithDeviceID())}
                disabled={busy}
              >
                <span style={styles.inlineIcon}>
                  <img src={icons.guest} alt="" width={18} height={18} />
                  {busy ? "Signing in…" : "Play as guest"}
                </span>
              </button>
            )}
          </div>
        )}

        {mode === "email" && (
          <div style={styles.stack}>
            <input
              className="idos-input"
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <input
              className="idos-input"
              style={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              style={{ ...styles.button, ...styles.primary }}
              onClick={() =>
                registering
                  ? void register()
                  : void run(() => client.auth.loginWithEmail(email, password))
              }
              disabled={busy || !email || !password}
            >
              {busy
                ? "Please wait…"
                : registering
                  ? "Create account"
                  : "Sign in"}
            </button>
            <button
              type="button"
              style={styles.ghost}
              onClick={() => setRegistering((v) => !v)}
              disabled={busy}
            >
              {registering ? "I already have an account" : "Create an account"}
            </button>
            {!registering && (
              <button
                type="button"
                style={styles.ghost}
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setNotice(null);
                }}
                disabled={busy}
              >
                Forgot password?
              </button>
            )}
            <button
              type="button"
              style={styles.ghost}
              onClick={() => {
                setMode("menu");
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        )}

        {mode === "verify" && (
          <div style={styles.stack}>
            <p style={styles.hint}>
              We sent a code to <strong>{email}</strong>. Enter it to finish
              creating your account.
            </p>
            <input
              className="idos-input"
              style={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Confirmation code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button
              type="button"
              style={{ ...styles.button, ...styles.primary }}
              onClick={() =>
                void run(() =>
                  client.auth.confirmEmailRegistration(email, code),
                )
              }
              disabled={busy || !code}
            >
              {busy ? "Please wait…" : "Confirm"}
            </button>
            <button
              type="button"
              style={styles.ghost}
              onClick={() => void resendCode()}
              disabled={busy || resendIn > 0}
            >
              {resendIn > 0
                ? `Send again in ${resendIn}s`
                : "Send the code again"}
            </button>
            <button
              type="button"
              style={styles.ghost}
              onClick={() => {
                setMode("email");
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div style={styles.stack}>
            <p style={styles.hint}>
              Enter your e-mail - we will send a code to set a new password.
            </p>
            <input
              className="idos-input"
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button
              type="button"
              style={{ ...styles.button, ...styles.primary }}
              onClick={() => void sendResetCode()}
              disabled={busy || !email}
            >
              {busy ? "Please wait..." : "Send the code"}
            </button>
            <button
              type="button"
              style={styles.ghost}
              onClick={() => {
                setMode("email");
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        )}

        {mode === "reset" && (
          <div style={styles.stack}>
            <p style={styles.hint}>
              If <strong>{email}</strong> has an account, a code is on its way.
              Enter it and choose a new password.
            </p>
            <input
              className="idos-input"
              style={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from the e-mail"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <input
              className="idos-input"
              style={styles.input}
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              style={{ ...styles.button, ...styles.primary }}
              onClick={() => void resetPassword()}
              disabled={busy || !code || !password}
            >
              {busy ? "Please wait..." : "Set the new password"}
            </button>
            <button
              type="button"
              style={styles.ghost}
              onClick={() => {
                setMode("forgot");
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        )}

        {notice && !error && <p style={styles.hint}>{notice}</p>}

        {/* Applies to every provider above: remembered sessions come back by their refresh token. */}
        <label style={{ ...styles.remember, opacity: busy ? 0.6 : 1 }}>
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            onChange={(e) => setRemember(e.target.checked)}
            style={styles.switchInput}
          />
          <span
            style={{
              ...styles.switchTrack,
              background: remember ? v.green : v.wellSoft,
            }}
          >
            <span
              style={{
                ...styles.switchKnob,
                left: remember ? "21px" : "3px",
              }}
            />
          </span>
          Remember me
        </label>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

// The look is the theme's (src/ui.config.ts, through the UI kit's CSS variables): the screen's
// gradient, a panel for the card, the kit's green button for the primary action, recessed fields.
// Change the theme, not these values.

/** The primary button's fill, drawn under the icon layer (see withIcon). */
const PRIMARY_FILL = `linear-gradient(180deg, ${v.green} 0%, ${v.greenDeep} 100%)`;

const styles: Record<string, CSSProperties> = {
  root: {
    position: "absolute",
    inset: 0,
    display: "grid",
    // Centred by the card's auto margins, not placeItems: a card taller than the screen (a phone in
    // landscape) then starts at the top and scrolls, instead of overflowing above it out of reach.
    padding: "16px",
    boxSizing: "border-box",
    overflowY: "auto",
    background: screenBackground,
    color: v.text,
    fontFamily: v.font,
    fontSize: "15px",
  },
  card: {
    ...panel,
    margin: "auto",
    width: "min(360px, 90vw)",
    boxSizing: "border-box",
    padding: "24px 20px 18px",
    display: "grid",
    gap: "16px",
  },
  logo: {
    width: "160px",
    justifySelf: "center",
    userSelect: "none",
    pointerEvents: "none",
  },
  remember: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    justifySelf: "center",
    cursor: "pointer",
    color: v.textDim,
    fontWeight: 700,
  },
  // The switch: a hidden real checkbox (keyboard/a11y) with a drawn track + knob on top.
  switchInput: { position: "absolute", opacity: 0, width: 0, height: 0 },
  switchTrack: {
    position: "relative",
    width: "42px",
    height: "24px",
    borderRadius: "12px",
    boxShadow: `inset 0 0 0 1px ${v.line}`,
    transition: "background 0.15s",
    flexShrink: 0,
  },
  switchKnob: {
    position: "absolute",
    top: "3px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
    transition: "left 0.15s",
  },
  title: {
    ...outlined,
    margin: 0,
    fontSize: "24px",
    fontFamily: v.font,
    textAlign: "center",
  },
  stack: { display: "grid", gap: "10px" },
  button: {
    padding: "11px 16px",
    minHeight: "46px",
    borderRadius: v.buttonRadius,
    border: `1px solid ${v.line}`,
    // backgroundColor, not the `background` shorthand: the shorthand would wipe the icon
    // (backgroundImage from ./loginIcons) - here and on the wallet button, whose own default style
    // uses the shorthand.
    backgroundColor: v.wellSoft,
    color: v.text,
    font: "inherit",
    fontWeight: 700,
    cursor: "pointer",
  },
  // The kit's green button — its text colour and outline follow the theme — with the fill as an image
  // layer, so an icon can sit on top of it.
  primary: {
    ...buttonStyle("green"),
    background: undefined,
    backgroundImage: PRIMARY_FILL,
    border: "none",
    width: "100%",
    font: "inherit",
    fontWeight: 800,
  },
  ghost: {
    padding: "8px",
    border: "none",
    background: "none",
    color: v.textDim,
    font: "inherit",
    fontWeight: 700,
    cursor: "pointer",
  },
  inlineIcon: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  input: {
    padding: "12px 14px",
    borderRadius: v.buttonRadius,
    border: `1px solid ${v.line}`,
    background: v.well,
    boxShadow: v.wellShadow,
    color: v.text,
    font: "inherit",
    outline: "none",
  },
  error: { margin: 0, color: v.red, fontWeight: 700, textAlign: "center" },
  hint: {
    margin: 0,
    color: v.textDim,
    textAlign: "center",
    fontSize: "14px",
    lineHeight: 1.45,
  },
};
