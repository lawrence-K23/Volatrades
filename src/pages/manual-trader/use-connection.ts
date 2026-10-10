/**
 * Which connection to Deriv the app is on right now, as a number that goes up
 * every time it changes.
 *
 * api_base replaces its socket outright - after a drop, after a failed
 * authorisation, and when the tab comes back into view - and a subscription
 * lives and dies with the socket it was made on. A screen that subscribed once
 * and listened on that socket kept showing the last price it got, forever:
 * the accumulator range stopped moving and the buttons stopped re-pricing.
 * Anything that subscribes puts this number in its effect's dependencies, so
 * it subscribes again on the new socket.
 */
import { useEffect, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { connectionStatus$ } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';

const CHECK_EVERY_MS = 2000;

export type TConnection = NonNullable<typeof api_base.api>['connection'];

export const currentConnection = (): TConnection | null => api_base.api?.connection ?? null;

const useConnection = () => {
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        let known = currentConnection();

        const check = () => {
            const now = currentConnection();
            // Only a socket that is open can carry a subscription; one still
            // connecting is caught on the next check.
            if (now && now !== known && now.readyState === 1) {
                known = now;
                setGeneration(value => value + 1);
            }
        };

        const status = connectionStatus$.subscribe(value => {
            if (value === 'opened') check();
        });
        const timer = window.setInterval(check, CHECK_EVERY_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') check();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            status.unsubscribe();
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    return generation;
};

export default useConnection;
