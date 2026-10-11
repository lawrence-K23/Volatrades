/**
 * Manual Trader: Deriv's DTrader, run inside VolaTrades.
 *
 * DTrader is a complete app of its own (see /dtrader in this repo). The build
 * puts it at /dtrader/ on this same origin, and this tab shows it in a frame.
 * Same origin matters: the frame reads the session VolaTrades keeps in
 * localStorage, so the user is already signed in there, on the account picked
 * in the header.
 *
 * VolaTrades stays the owner of that session. DTrader never logs in, renews a
 * token, switches account or logs out by itself - it posts a message here and
 * this page does it the way the rest of the site does:
 *
 *   session-expired  renew the token if possible, else start the Deriv login
 *   refresh-token    renew the token, then answer so the frame can retry
 *   switch-account   select that account, as the header's switcher does
 *   logout           log out, as the header's button does
 *
 * When the selected account changes (here or in the header), the frame sees
 * the change to localStorage and reloads itself onto the new account.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { getAuthInfo } from '@/external/deriv-core';
import { useLogout } from '@/hooks/useLogout';
import { useStore } from '@/hooks/useStore';
import { ensureFreshAccessToken } from '@/utils/auth-session';
import { localize } from '@deriv-com/translations';
import './manual-trader.scss';

/** Tag on every message the embedded DTrader sends. Must match dtrader's embed.ts. */
const EMBED_SOURCE = 'volatrades-dtrader';
/** Where the build serves DTrader. Must match the base in scripts/build-dtrader.js. */
const DTRADER_URL = '/dtrader/';
/** How long to wait for DTrader to load before offering a retry. */
const LOAD_TIMEOUT_MS = 45000;

type TEmbedMessage = {
    source: typeof EMBED_SOURCE;
    type: 'session-expired' | 'refresh-token' | 'switch-account' | 'logout';
    id?: string;
    loginid?: string;
};

const isEmbedMessage = (data: unknown): data is TEmbedMessage =>
    !!data && typeof data === 'object' && (data as { source?: unknown }).source === EMBED_SOURCE;

const ManualTrader = observer(() => {
    const store = useStore();
    const { client, run_panel } = store ?? {};
    const handleLogout = useLogout();

    const frame_ref = useRef<HTMLIFrameElement>(null);
    const [frame_key, setFrameKey] = useState(0);
    const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

    const reloadFrame = useCallback(() => {
        setStatus('loading');
        setFrameKey(key => key + 1);
    }, []);

    const startLogin = useCallback(async () => {
        try {
            const url = await generateOAuthURL();
            if (url) window.location.replace(url);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[Manual Trader] Could not start login:', error);
        }
    }, []);

    const replyToFrame = useCallback((payload: Record<string, unknown>) => {
        frame_ref.current?.contentWindow?.postMessage(
            { source: EMBED_SOURCE, ...payload },
            window.location.origin
        );
    }, []);

    useEffect(() => {
        const onMessage = async (event: MessageEvent) => {
            // Only the frame this page made, on this origin.
            if (event.origin !== window.location.origin) return;
            if (!frame_ref.current || event.source !== frame_ref.current.contentWindow) return;
            if (!isEmbedMessage(event.data)) return;

            const message = event.data;
            switch (message.type) {
                case 'refresh-token': {
                    await ensureFreshAccessToken().catch(() => false);
                    replyToFrame({ type: 'refresh-token-result', id: message.id });
                    break;
                }
                case 'session-expired': {
                    const usable = await ensureFreshAccessToken().catch(() => false);
                    if (usable && getAuthInfo()) reloadFrame();
                    else startLogin();
                    break;
                }
                case 'switch-account': {
                    const loginid = message.loginid;
                    // The header refuses to switch while a bot is running; so do we.
                    const is_bot_running = run_panel?.is_running || api_base.is_running;
                    if (!loginid || is_bot_running) {
                        reloadFrame(); // put the frame back on the account still selected
                        break;
                    }
                    if (localStorage.getItem('active_loginid') === loginid) break;
                    localStorage.setItem('active_loginid', loginid);
                    client?.checkAndRegenerateWebSocket();
                    // The frame reloads itself on the storage change.
                    break;
                }
                case 'logout': {
                    handleLogout();
                    break;
                }
                default:
                    break;
            }
        };

        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [client, run_panel, handleLogout, reloadFrame, replyToFrame, startLogin]);

    // A frame that never finishes loading gets a retry button instead of a
    // blank tab forever.
    useEffect(() => {
        if (status !== 'loading') return undefined;
        const timer = window.setTimeout(() => setStatus('failed'), LOAD_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [status, frame_key]);

    const onFrameLoad = useCallback(() => {
        // In development without a DTrader build, the dev server answers
        // /dtrader/ with VolaTrades' own page. Catch that rather than show the
        // site inside itself.
        try {
            const doc = frame_ref.current?.contentDocument;
            if (doc && !doc.getElementById('derivatives_trader')) {
                setStatus('failed');
                return;
            }
        } catch {
            /* not readable: leave it to show what it has */
        }
        setStatus('ready');
    }, []);

    return (
        <div className='manual-trader'>
            {status === 'loading' && (
                <div className='manual-trader__overlay' role='status'>
                    <span className='manual-trader__spinner' aria-hidden='true' />
                    <span>{localize('Loading trader...')}</span>
                </div>
            )}
            {status === 'failed' && (
                <div className='manual-trader__overlay' role='alert'>
                    <p>{localize('The trader could not be loaded.')}</p>
                    <button type='button' className='manual-trader__retry' onClick={reloadFrame}>
                        {localize('Try again')}
                    </button>
                </div>
            )}
            <iframe
                key={frame_key}
                ref={frame_ref}
                className='manual-trader__frame'
                src={DTRADER_URL}
                title={localize('Manual Trader')}
                onLoad={onFrameLoad}
                allow='clipboard-write; fullscreen'
            />
        </div>
    );
});

export default ManualTrader;
