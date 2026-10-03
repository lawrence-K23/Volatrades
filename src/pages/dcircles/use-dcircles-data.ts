/**
 * Tick streams for every volatility market at once.
 *
 * Dcircles shows a card per market, so it needs all of them running together -
 * which the shared single-symbol stream cannot do. Each market gets a history
 * seed and a live subscription on our own socket, and the raw frames are read
 * from one message listener rather than one per market.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';

export type TMarket = {
    symbol: string;
    display_name: string;
    pip_size: number;
};

export type TMarketTicks = {
    quotes: number[];
    digits: number[];
};

/** Volatility indices only, 1s and plain, in a stable order. */
export const pickVolatilityMarkets = (active_symbols: any[]): TMarket[] => {
    const markets = (active_symbols || [])
        .filter(item => /^(R_|1HZ)/.test(item.symbol || ''))
        .map(item => ({
            symbol: item.symbol as string,
            display_name: (item.display_name as string) || (item.symbol as string),
            pip_size: Number(item.pip ? Math.round(-Math.log10(Number(item.pip))) : (item.pip_size ?? 2)),
        }));

    // 1s markets first, then the plain ones, each by their number.
    const rank = (symbol: string) => (symbol.startsWith('1HZ') ? 0 : 1);
    const number = (symbol: string) => Number(symbol.replace(/\D/g, '')) || 0;

    return markets.sort((a, b) => rank(a.symbol) - rank(b.symbol) || number(a.symbol) - number(b.symbol));
};

const lastDigitOf = (quote: number, pip_size: number) => {
    const places = Number.isFinite(pip_size) && pip_size >= 0 ? pip_size : 2;
    const text = Number(quote).toFixed(places);
    const digit = parseInt(text.slice(-1), 10);
    return Number.isFinite(digit) ? digit : 0;
};

const waitForApi = (attempts = 60, interval = 250) =>
    new Promise<void>((resolve, reject) => {
        let tries = 0;
        const check = () => {
            tries += 1;
            if (api_base?.api?.connection?.readyState === 1) return resolve();
            if (tries >= attempts) return reject(new Error('Timed out waiting for the Deriv connection'));
            setTimeout(check, interval);
        };
        check();
    });

export const useDcirclesData = (tick_count: number) => {
    const [markets, setMarkets] = useState<TMarket[]>([]);
    const [ticks, setTicks] = useState<Record<string, TMarketTicks>>({});
    const [error, setError] = useState<string | null>(null);
    const [is_loading, setIsLoading] = useState(true);

    const subscription_ids = useRef<string[]>([]);
    const listener = useRef<((evt: MessageEvent) => void) | null>(null);
    const markets_ref = useRef<TMarket[]>([]);
    const count_ref = useRef(tick_count);
    const is_mounted = useRef(true);

    useEffect(() => {
        count_ref.current = tick_count;
    }, [tick_count]);

    const teardown = useCallback(() => {
        try {
            subscription_ids.current.forEach(id => {
                (api_base.api as any)?.forget?.(id)?.catch?.(() => {});
            });
            subscription_ids.current = [];
            if (listener.current) {
                api_base?.api?.connection?.removeEventListener('message', listener.current);
                listener.current = null;
            }
        } catch {
            /* the streams close with the socket anyway */
        }
    }, []);

    useEffect(() => {
        is_mounted.current = true;

        const start = async () => {
            try {
                await waitForApi();

                const response: any = await (api_base.api as any).send({ active_symbols: 'brief' });
                if (response?.error) throw new Error(response.error.message);

                const list = pickVolatilityMarkets(response.active_symbols);
                if (!is_mounted.current) return;
                markets_ref.current = list;
                setMarkets(list);

                // One listener for every stream: the frame carries its symbol.
                const onMessage = (evt: MessageEvent) => {
                    try {
                        const data = JSON.parse(evt.data as string);
                        if (data?.msg_type !== 'tick' || !data?.tick?.symbol) return;

                        const market = markets_ref.current.find(item => item.symbol === data.tick.symbol);
                        if (!market) return;

                        const quote = Number(data.tick.quote);
                        setTicks(prev => {
                            const current = prev[market.symbol] ?? { quotes: [], digits: [] };
                            const limit = Math.max(10, count_ref.current);
                            return {
                                ...prev,
                                [market.symbol]: {
                                    quotes: [...current.quotes, quote].slice(-limit),
                                    digits: [...current.digits, lastDigitOf(quote, market.pip_size)].slice(-limit),
                                },
                            };
                        });
                    } catch {
                        /* a frame we do not care about */
                    }
                };
                listener.current = onMessage;
                api_base?.api?.connection?.addEventListener('message', onMessage);

                // Seed each market with history, then follow it live. Sequential,
                // so a dozen markets do not all demand history at once.
                for (const market of list) {
                    if (!is_mounted.current) return;
                    try {
                        const history: any = await (api_base.api as any).send({
                            ticks_history: market.symbol,
                            end: 'latest',
                            count: Math.max(10, count_ref.current),
                            style: 'ticks',
                        });

                        const prices: number[] = (history?.history?.prices || []).map(Number);
                        if (prices.length) {
                            setTicks(prev => ({
                                ...prev,
                                [market.symbol]: {
                                    quotes: prices,
                                    digits: prices.map(price => lastDigitOf(price, market.pip_size)),
                                },
                            }));
                        }

                        const stream: any = await (api_base.api as any).send({ ticks: market.symbol, subscribe: 1 });
                        const id = stream?.subscription?.id;
                        if (id) subscription_ids.current.push(id);
                    } catch {
                        /* one market failing should not stop the rest */
                    }
                }

                if (is_mounted.current) setIsLoading(false);
            } catch (caught) {
                if (!is_mounted.current) return;
                setError(caught instanceof Error ? caught.message : 'Could not load the markets');
                setIsLoading(false);
            }
        };

        start();

        return () => {
            is_mounted.current = false;
            teardown();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-seed from history when the tick count changes, so the cards show the
    // run that was asked for rather than filling up slowly from live ticks.
    useEffect(() => {
        if (!markets.length) return;
        let cancelled = false;

        (async () => {
            for (const market of markets) {
                if (cancelled || !is_mounted.current) return;
                try {
                    const history: any = await (api_base.api as any).send({
                        ticks_history: market.symbol,
                        end: 'latest',
                        count: Math.max(10, tick_count),
                        style: 'ticks',
                    });
                    const prices: number[] = (history?.history?.prices || []).map(Number);
                    if (!prices.length || cancelled) continue;
                    setTicks(prev => ({
                        ...prev,
                        [market.symbol]: {
                            quotes: prices,
                            digits: prices.map(price => lastDigitOf(price, market.pip_size)),
                        },
                    }));
                } catch {
                    /* keep whatever the stream has already given us */
                }
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick_count, markets.length]);

    return useMemo(() => ({ markets, ticks, error, is_loading }), [markets, ticks, error, is_loading]);
};

export default useDcirclesData;
