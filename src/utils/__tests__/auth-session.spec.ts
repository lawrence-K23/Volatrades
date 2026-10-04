import {
    clearStoredSession,
    needsTokenRefresh,
    resolveActiveLoginid,
    setLoginError,
    startFreshBrowserSession,
    takeLoginError,
} from '@/utils/auth-session';

const OPEN_TABS_KEY = 'te-open-tabs';
const SESSION_ALIVE_KEY = 'te-browser-session';

/** A signed-in session as the app stores it. */
const storeSession = (expires_in_seconds = 3600, refresh_token = 'refresh-me') => {
    localStorage.setItem(
        'auth_info',
        JSON.stringify({
            access_token: 'token-123',
            token_type: 'bearer',
            expires_in: expires_in_seconds,
            expires_at: Math.floor(Date.now() / 1000) + expires_in_seconds,
            scope: 'trade',
            refresh_token,
        })
    );
    localStorage.setItem('active_loginid', 'CR123456');
    localStorage.setItem('account_type', 'real');
};

const isSignedIn = () => Boolean(localStorage.getItem('auth_info')) && Boolean(localStorage.getItem('active_loginid'));

describe('auth-session', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        sessionStorage.clear();
        window.history.replaceState({}, '', '/');
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('startFreshBrowserSession', () => {
        it('drops the stored session when the browser has been closed since the last visit', () => {
            storeSession();

            startFreshBrowserSession();

            expect(isSignedIn()).toBe(false);
        });

        it('keeps the session on a reload of a tab that is already in this browser session', () => {
            storeSession();
            sessionStorage.setItem(SESSION_ALIVE_KEY, '1');

            startFreshBrowserSession();

            expect(isSignedIn()).toBe(true);
        });

        it('keeps the session on the return leg of a login, which still needs it', () => {
            storeSession();
            window.history.replaceState({}, '', '/callback?code=abc123&state=xyz');

            startFreshBrowserSession();

            expect(isSignedIn()).toBe(true);
        });

        it('keeps the session for a second tab opened beside one that is already open', () => {
            storeSession();
            localStorage.setItem(OPEN_TABS_KEY, JSON.stringify({ 'other-tab': Date.now() }));

            startFreshBrowserSession();

            expect(isSignedIn()).toBe(true);
        });

        it('drops the session when the only other tab on record is long gone', () => {
            storeSession();
            localStorage.setItem(OPEN_TABS_KEY, JSON.stringify({ 'other-tab': Date.now() - 10 * 60 * 1000 }));

            startFreshBrowserSession();

            expect(isSignedIn()).toBe(false);
        });

        it('puts this tab on the register, so the next tab can see it', () => {
            startFreshBrowserSession();

            const tabs = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) ?? '{}');
            expect(Object.keys(tabs)).toHaveLength(1);
        });
    });

    describe('clearStoredSession', () => {
        it('forgets the session in both storages', () => {
            storeSession();
            sessionStorage.setItem('deriv_accounts', JSON.stringify([{ account_id: 'CR123456' }]));

            clearStoredSession();

            expect(localStorage.getItem('auth_info')).toBeNull();
            expect(localStorage.getItem('active_loginid')).toBeNull();
            expect(sessionStorage.getItem('deriv_accounts')).toBeNull();
        });
    });

    describe('resolveActiveLoginid', () => {
        it('returns the stored loginid', () => {
            storeSession();
            expect(resolveActiveLoginid()).toBe('CR123456');
        });

        it('repairs a missing loginid from the stored account list', () => {
            sessionStorage.setItem('deriv_accounts', JSON.stringify([{ account_id: 'CR999999' }]));

            expect(resolveActiveLoginid()).toBe('CR999999');
            expect(localStorage.getItem('active_loginid')).toBe('CR999999');
        });

        it('returns null when there is nothing to go on', () => {
            expect(resolveActiveLoginid()).toBeNull();
        });
    });

    describe('needsTokenRefresh', () => {
        it('is false for a token with hours left on it', () => {
            storeSession(3600);
            expect(needsTokenRefresh()).toBe(false);
        });

        it('is true once the token is inside the renewal window', () => {
            storeSession(60);
            expect(needsTokenRefresh()).toBe(true);
        });

        it('is true for a token that has already run out', () => {
            storeSession(-60);
            expect(needsTokenRefresh()).toBe(true);
        });

        it('is false without a refresh token to renew with', () => {
            storeSession(60, '');
            expect(needsTokenRefresh()).toBe(false);
        });

        it('is false with no session at all', () => {
            expect(needsTokenRefresh()).toBe(false);
        });
    });

    describe('login error', () => {
        it('is handed over once and then forgotten', () => {
            setLoginError('That login did not go through.');

            expect(takeLoginError()).toBe('That login did not go through.');
            expect(takeLoginError()).toBeNull();
        });
    });
});
