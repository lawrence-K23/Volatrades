/**
 * Session handling for the Deriv login.
 *
 * Three jobs, all of them about when a login counts as still valid:
 *
 * 1. A login lasts for the browser session, not forever. Closing the site and
 *    coming back asks for a login again, the way a bank or a broker does. The
 *    stored session itself has to stay in localStorage, since a lot of code
 *    reads it there, so two markers decide whether it still counts: a
 *    sessionStorage mark, which the browser drops when the tab closes, and a
 *    register of the tabs currently open, so that opening a second tab beside a
 *    signed-in one shares the session instead of ending it.
 *
 * 2. An access token that has run out is renewed with its refresh token rather
 *    than treated as a logged-out user. Nothing called refreshAccessToken
 *    before this, so every session died at the token's expiry and dropped the
 *    user on the landing page mid-session.
 *
 * 3. A session whose active account was never recorded is repaired from the
 *    stored account list instead of being thrown away.
 */
import { getStoredAuthInfo, refreshAccessToken, type AuthInfo } from '@/external/deriv-core';

/** Marks a live browser session. sessionStorage dies with the tab. */
const SESSION_ALIVE_KEY = 'te-browser-session';

/**
 * The tabs of this site that are currently open, each with the time it last
 * said so. A tab removes itself as it closes; the age limit is only there for
 * a tab that never got the chance - a crash, a killed browser. It is well over
 * a minute because a hidden tab's timers are throttled to roughly once a
 * minute, and a tab wrongly thought dead would cost the user their session.
 */
const OPEN_TABS_KEY = 'te-open-tabs';
const TAB_PING_MS = 5000;
const TAB_STALE_MS = 120000;

const tab_id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A login failure worth showing on the landing page. */
const LOGIN_ERROR_KEY = 'te-login-error';

/** Everything that, together, makes up a signed-in session. */
const SESSION_KEYS = [
    'auth_info',
    'deriv_accounts',
    'active_loginid',
    'account_type',
    'authToken',
    'accountsList',
    'clientAccounts',
    'client_account_details',
    'client.country',
    'callback_token',
    'session_token',
];

/** Renew once the token is within this of expiring, rather than after. */
const RENEW_WINDOW_MS = 5 * 60 * 1000;

const safeRemove = (store: Storage, key: string) => {
    try {
        store.removeItem(key);
    } catch {
        /* private mode */
    }
};

/** Forget the signed-in session. Leaves preferences and bot work alone. */
export const clearStoredSession = (): void => {
    SESSION_KEYS.forEach(key => {
        safeRemove(localStorage, key);
        safeRemove(sessionStorage, key);
    });
};

const readOpenTabs = (): Record<string, number> => {
    try {
        const raw = localStorage.getItem(OPEN_TABS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object') return {};

        const now = Date.now();
        const live: Record<string, number> = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([id, at]) => {
            const seen = Number(at);
            if (Number.isFinite(seen) && now - seen < TAB_STALE_MS) live[id] = seen;
        });
        return live;
    } catch {
        return {};
    }
};

const writeOpenTabs = (tabs: Record<string, number>) => {
    try {
        localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs));
    } catch {
        /* ignore */
    }
};

/** Is another tab of this site still open? */
const isAnotherTabOpen = (): boolean => Object.keys(readOpenTabs()).some(id => id !== tab_id);

const registerTab = () => {
    const tabs = readOpenTabs();
    tabs[tab_id] = Date.now();
    writeOpenTabs(tabs);
};

const unregisterTab = () => {
    const tabs = readOpenTabs();
    delete tabs[tab_id];
    writeOpenTabs(tabs);
};

/**
 * Called once, before anything reads the session.
 *
 * A tab that starts with no live-session mark of its own, with no other tab of
 * the site open, means the browser was closed since the last visit: any session
 * left in storage is dropped and the user logs in again. Two cases are left
 * alone - a load carrying ?code, which is the return leg of a login and needs
 * the PKCE pair the exchange is about to use, and a second tab opened beside
 * one that is already signed in, which shares that session as any site does.
 */
export const startFreshBrowserSession = (): void => {
    try {
        const marked = sessionStorage.getItem(SESSION_ALIVE_KEY) === '1';
        const is_oauth_return = new URLSearchParams(window.location.search).has('code');

        // If the mark cannot be stored we have no way to tell a new browser
        // session from a reload, and guessing wrong would sign people out
        // mid-session. Leave the stored session alone in that case.
        sessionStorage.setItem(SESSION_ALIVE_KEY, '1');

        if (!marked && !is_oauth_return && !isAnotherTabOpen()) {
            clearStoredSession();
        }

        // Join the register of open tabs, keep our entry fresh, and leave it as
        // the tab goes. A reload or the trip to Deriv and back also fires
        // pagehide, but the returning tab keeps its own mark above, so only a
        // genuinely new tab ever asks this question.
        registerTab();
        setInterval(registerTab, TAB_PING_MS);
        document.addEventListener('visibilitychange', registerTab);
        window.addEventListener('pagehide', unregisterTab);
    } catch {
        /* without sessionStorage we cannot tell sessions apart; leave it be */
    }
};

const expiresAtMs = (auth: AuthInfo | null): number | null =>
    auth?.expires_at ? auth.expires_at * 1000 : null;

/** True when there is a session whose token is spent, or nearly, and renewable. */
export const needsTokenRefresh = (): boolean => {
    const auth = getStoredAuthInfo();
    if (!auth?.refresh_token) return false;

    const expiry = expiresAtMs(auth);
    if (!expiry) return false;
    return Date.now() > expiry - RENEW_WINDOW_MS;
};

let in_flight: Promise<boolean> | null = null;

/**
 * Renew the access token if it is spent or close to it.
 *
 * Resolves true when the session is usable afterwards. A refusal from Deriv
 * (the refresh token itself has expired or been revoked) clears the session,
 * which is a real logout; a network failure leaves it alone to try again.
 */
export const ensureFreshAccessToken = async (): Promise<boolean> => {
    const auth = getStoredAuthInfo();
    if (!auth) return false;
    if (!needsTokenRefresh()) return true;
    if (!auth.refresh_token) return false;

    if (in_flight) return in_flight;

    in_flight = (async () => {
        try {
            await refreshAccessToken(auth.refresh_token as string, process.env.NEXT_PUBLIC_DERIV_APP_ID || '');
            return true;
        } catch (error) {
            // refreshAccessToken already clears the session on a rejected token.
            // eslint-disable-next-line no-console
            console.error('Could not renew the Deriv session:', error);
            return Boolean(getStoredAuthInfo());
        } finally {
            in_flight = null;
        }
    })();

    return in_flight;
};

type TStoredAccount = { account_id?: string; loginid?: string };

/**
 * The loginid of the signed-in account, repaired from the stored account list
 * when the callback never got as far as writing it.
 */
export const resolveActiveLoginid = (): string | null => {
    try {
        const stored = localStorage.getItem('active_loginid');
        if (stored) return stored;

        // The accounts service keeps its list in sessionStorage; deriv-core's
        // helper writes the same key in localStorage. Either will do.
        const raw = sessionStorage.getItem('deriv_accounts') || localStorage.getItem('deriv_accounts');
        if (!raw) return null;

        const accounts: TStoredAccount[] = JSON.parse(raw);
        const loginid = accounts?.[0]?.account_id || accounts?.[0]?.loginid;
        if (!loginid) return null;

        localStorage.setItem('active_loginid', loginid);
        return loginid;
    } catch {
        return null;
    }
};

/** Leave a message for the landing page after a login that could not complete. */
export const setLoginError = (message: string): void => {
    try {
        sessionStorage.setItem(LOGIN_ERROR_KEY, message);
    } catch {
        /* the user simply sees no message */
    }
};

/** Read and clear that message, so it shows once. */
export const takeLoginError = (): string | null => {
    try {
        const message = sessionStorage.getItem(LOGIN_ERROR_KEY);
        if (message) sessionStorage.removeItem(LOGIN_ERROR_KEY);
        return message;
    } catch {
        return null;
    }
};
