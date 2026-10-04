import type { AuthInfo, DerivAccount, StoredCSRFToken, StoredCodeVerifier } from '../types';

const CSRF_TOKEN_KEY = 'oauth_csrf_token';
const CODE_VERIFIER_KEY = 'oauth_code_verifier';
const AUTH_INFO_KEY = 'auth_info';
const DERIV_ACCOUNTS_KEY = 'deriv_accounts';
const ACTIVE_LOGINID_KEY = 'active_loginid';
const ACCOUNT_TYPE_KEY = 'account_type';

// A login can legitimately take a while: a forgotten password, an email code,
// a signup detour. Ten minutes expired the PKCE pair mid-login and the return
// trip then failed with "code verifier expired", dropping the user back on the
// landing page.
const TOKEN_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * The PKCE pair is written to BOTH session and local storage.
 *
 * sessionStorage belongs to one tab. The OAuth round trip usually returns to
 * the same tab, but not always - a phone browser can hand the login page to a
 * new tab, and a user can open the login in one themselves. The return trip
 * then found no state to match, which read as a CSRF failure and sent a
 * perfectly good login back to the landing page. The localStorage copy is the
 * fallback; both are single-use and both are cleared the moment the code is
 * exchanged.
 */
const writeBoth = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode, quota - the local copy below may still land */
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* nothing more we can do */
  }
};

const readEither = (key: string): string | null => {
  try {
    const from_session = sessionStorage.getItem(key);
    if (from_session) return from_session;
  } catch {
    /* fall through to local */
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const removeBoth = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

/** Read one of the short-lived PKCE values, honouring its own age limit. */
const readPkce = (key: string, clear: () => void): string | null => {
  const raw = readEither(key);
  if (!raw) return null;

  try {
    const stored: StoredCSRFToken | StoredCodeVerifier = JSON.parse(raw);
    if (Date.now() - stored.createdAt > TOKEN_MAX_AGE_MS) {
      clear();
      return null;
    }
    return stored.value;
  } catch {
    clear();
    return null;
  }
};

// --- CSRF Token ---

export function storeCSRFToken(token: string): void {
  const stored: StoredCSRFToken = { value: token, createdAt: Date.now() };
  writeBoth(CSRF_TOKEN_KEY, JSON.stringify(stored));
}

export function getCSRFToken(): string | null {
  return readPkce(CSRF_TOKEN_KEY, clearCSRFToken);
}

export function clearCSRFToken(): void {
  removeBoth(CSRF_TOKEN_KEY);
}

// --- PKCE Code Verifier ---

export function storeCodeVerifier(verifier: string): void {
  const stored: StoredCodeVerifier = { value: verifier, createdAt: Date.now() };
  writeBoth(CODE_VERIFIER_KEY, JSON.stringify(stored));
}

export function getCodeVerifier(): string | null {
  return readPkce(CODE_VERIFIER_KEY, clearCodeVerifier);
}

export function clearCodeVerifier(): void {
  removeBoth(CODE_VERIFIER_KEY);
}

// --- Auth Info ---

export function storeAuthInfo(authInfo: AuthInfo): void {
  localStorage.setItem(AUTH_INFO_KEY, JSON.stringify(authInfo));
}

export function getAuthInfo(): AuthInfo | null {
  const authInfo = getStoredAuthInfo();
  if (!authInfo) return null;

  if (authInfo.expires_at && Date.now() > authInfo.expires_at * 1000) {
    return null; // Token expired
  }
  return authInfo;
}

/**
 * The stored session as written, expiry and all.
 *
 * getAuthInfo() hides an expired token, which is right for "are we logged in?"
 * but wrong for "can we renew?" - the refresh token lives in the same record.
 * Without this, an expired access token looked like no session at all and the
 * user was sent back to the landing page with a usable refresh token sitting
 * unread in storage.
 */
export function getStoredAuthInfo(): AuthInfo | null {
  try {
    const raw = localStorage.getItem(AUTH_INFO_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthInfo;
  } catch {
    return null;
  }
}

export function clearAuthInfo(): void {
  localStorage.removeItem(AUTH_INFO_KEY);
}

// --- Deriv Accounts ---

export function storeDerivAccounts(accounts: DerivAccount[]): void {
  localStorage.setItem(DERIV_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getDerivAccounts(): DerivAccount[] | null {
  const raw = localStorage.getItem(DERIV_ACCOUNTS_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function clearDerivAccounts(): void {
  localStorage.removeItem(DERIV_ACCOUNTS_KEY);
}

// --- Active Login ID (localStorage) ---

export function setActiveLoginId(loginId: string): void {
  localStorage.setItem(ACTIVE_LOGINID_KEY, loginId);
}

export function getActiveLoginId(): string | null {
  return localStorage.getItem(ACTIVE_LOGINID_KEY);
}

// --- Account Type (localStorage) ---

export function setAccountType(type: 'demo' | 'real'): void {
  localStorage.setItem(ACCOUNT_TYPE_KEY, type);
}

export function getAccountType(): string | null {
  return localStorage.getItem(ACCOUNT_TYPE_KEY);
}

// --- Clear All Auth Data ---

export function clearAllAuthData(): void {
  clearCSRFToken();
  clearCodeVerifier();
  clearAuthInfo();
  clearDerivAccounts();
  localStorage.removeItem(ACTIVE_LOGINID_KEY);
  localStorage.removeItem(ACCOUNT_TYPE_KEY);
}
