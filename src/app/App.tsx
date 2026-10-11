import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';
import { cleanupUrl, getAuthInfo, handleOAuthCallback } from '@/external/deriv-core';
import ChunkLoader from '@/components/loader/chunk-loader';
import { getOAuthRedirectUri } from '@/components/shared/utils/config/config';
import LocalStorageSyncWrapper from '@/components/localStorage-sync-wrapper';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { useAccountSwitching } from '@/hooks/useAccountSwitching';
import { useLanguageFromURL } from '@/hooks/useLanguageFromURL';
import { StoreProvider } from '@/hooks/useStore';
import { TickDataProvider } from '@/hooks/useTickData';
import { setLoginError } from '@/utils/auth-session';
import { isPreviewMode, PREVIEW_BASE_PATH } from '@/utils/is-preview-mode';
import { localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import i18nInstance from './i18n';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));

/**
 * Component wrapper to handle language URL parameter
 * Uses the useLanguageFromURL hook to process language switching
 */
const LanguageHandler = ({ children }: { children: React.ReactNode }) => {
    useLanguageFromURL();
    return <>{children}</>;
};

// The static preview build is served under /bot/preview (see rsbuild.config.ts
// assetPrefix), so React Router must resolve routes under that prefix. Standalone
// partner deploys are served at the root, so no basename there.
const routerBasename = isPreviewMode() ? PREVIEW_BASE_PATH : undefined;

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            element={
                <Suspense
                    fallback={<ChunkLoader message={localize('Please wait while we connect to the server...')} />}
                >
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <LanguageHandler>
                            <StoreProvider>
                                <LocalStorageSyncWrapper>
                                    <RoutePromptDialog />
                                    <CoreStoreProvider>
                                        <TickDataProvider>
                                            <Layout />
                                        </TickDataProvider>
                                    </CoreStoreProvider>
                                </LocalStorageSyncWrapper>
                            </StoreProvider>
                        </LanguageHandler>
                    </TranslationProvider>
                </Suspense>
            }
        >
            {/* All child routes will be passed as children to Layout */}
            <Route index element={<AppRoot />} />
            {/* Deriv returns here after login; App swaps to / once the code is exchanged */}
            <Route path='callback' element={<ChunkLoader message={localize('Signing you in...')} />} />
            {/* App Builder embeds the template at /preview — render the same app shell */}
            <Route path='preview' element={<AppRoot />} />
        </Route>
    ),
    { basename: routerBasename }
);

/**
 * Main App component
 *
 * Responsibilities:
 * 1. OAuth callback handling (via vendored deriv-core handleOAuthCallback)
 * 2. Account switching from URL (via useAccountSwitching hook)
 * 3. Router provider setup
 */
function App() {
    // Handle account switching via URL parameter
    useAccountSwitching();

    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (!code) return;

        // An authorisation code is single use. Running the exchange twice over
        // the same code - a reload of /callback, a back button onto it, a second
        // mount - makes Deriv reject the second attempt, and that failure used
        // to read as a failed login. Remember the one we have handled.
        const CONSUMED_KEY = 'te-oauth-code-used';
        let already_used = false;
        try {
            already_used = sessionStorage.getItem(CONSUMED_KEY) === code;
            sessionStorage.setItem(CONSUMED_KEY, code);
        } catch {
            /* carry on without the guard */
        }

        /**
         * Deriv occasionally refuses the first account request right after a
         * login. A couple of retries costs a second and saves the whole login.
         */
        const fetchAccountsWithRetry = async (accessToken: string) => {
            const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
            let last_error: unknown = null;

            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const accounts = await DerivWSAccountsService.fetchAccountsList(accessToken);
                    if (accounts && accounts.length > 0) return accounts;
                    last_error = new Error('No accounts returned after authentication');
                } catch (error) {
                    last_error = error;
                }
                await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
            }

            throw last_error ?? new Error('Could not read your accounts');
        };

        const handleCallback = async () => {
            let signed_in = false;

            try {
                if (already_used) {
                    // The first run through this code either signed the user in
                    // or did not; either way the code is spent, so all that is
                    // left is to land them somewhere truthful.
                    signed_in = Boolean(getAuthInfo()?.access_token);
                    if (!signed_in) setLoginError('That login did not go through. Please try again.');
                    return;
                }

                const authInfo = await handleOAuthCallback(window.location.href, {
                    clientId: process.env.NEXT_PUBLIC_DERIV_APP_ID || '',
                    // Same value the login URL sent, or Deriv rejects the exchange.
                    redirectUri: getOAuthRedirectUri(),
                    scopes: 'trade',
                });

                // The token is stored by now, so the user is logged in whatever
                // happens next - the account list is detail the app can refetch.
                signed_in = Boolean(authInfo?.access_token);

                const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
                const accounts = await fetchAccountsWithRetry(authInfo.access_token);

                DerivWSAccountsService.storeAccounts(accounts);
                const firstAccount = accounts[0];
                localStorage.setItem('active_loginid', firstAccount.account_id);
                const isDemo = firstAccount.account_id.startsWith('VRT') || firstAccount.account_id.startsWith('VRTC');
                localStorage.setItem('account_type', isDemo ? 'demo' : 'real');

                const { api_base } = await import('@/external/bot-skeleton');
                await api_base.init(true);
            } catch (error) {
                console.error('OAuth callback error:', error);
                // Only a login that left us with no token is a failed login. If
                // the token landed and something later gave way, say nothing and
                // let the app carry on - it connects on its own.
                if (!signed_in && !getAuthInfo()?.access_token) {
                    setLoginError('That login did not go through. Please try again.');
                }
            } finally {
                cleanupUrl(window.location.origin);
                // cleanupUrl only rewrites the address, so a login that returned
                // to /callback would sit on a dead route. Land on the app root.
                if (window.location.pathname !== '/') {
                    window.location.replace(`${window.location.origin}/`);
                }
            }
        };

        handleCallback();
    }, []);

    return <RouterProvider router={router} />;
}

export default App;
