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

/**
 * Volatility indices only, 1s and plain, in a stable order.
 *
 * The Options API names these fields differently from the old one -
 * underlying_symbol rather than symbol, underlying_symbol_name rather than
 * display_name, and pip_size as a count of decimal places rather than a pip
 * value. Reading only `symbol` matched nothing, which is why the board came up
 * empty with no markets and no error to show for it.
 */
export const pickVolatilityMarkets = (active_symbols: any[], pip_sizes: Record<string, number> = {}): TMarket[] => {
    const markets = (active_symbols || [])
        .map(item => {
            const symbol: string = item.underlying_symbol || item.symbol || '';
            const display_name: string =
                item.display_name || item.underlying_symbol_name || item.underlying_symbol || symbol;
            const raw_pip = item.pip_size ?? item.pip;
            const pip_size =
                raw_pip !== undefined && Number.isFinite(Number(raw_pip))
                    ? Number(raw_pip)
                    : Number.isFinite(pip_sizes[symbol])
                      ? pip_sizes[symbol]
                      : 2;
            return { symbol, display_name, pip_size };
        })
        .filter(market => /^(R_|1HZ)/.test(market.symbol) && !!market.display_name);

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

/**
 * Last known markets and ticks, kept for the life of the page.
 *
 * Leaving the tab drops the subscriptions - a dozen streams should not run
 * behind a screen nobody is looking at - but the numbers are kept, so coming
 * back shows the board filled in while it reconnects, rather than an empty
 * grid and a loading line.
 */
const cache: { markets: TMarket[]; ticks: Record<string, TMarketTicks> } = { markets: [], ticks: {} };

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
    // Start from whatever the last visit left behind, so the board is populated
    // on arrival instead of empty.
    const [markets, setMarkets] = useState<TMarket[]>(cache.markets);
    const [ticks, setTicks] = useState<Record<string, TMarketTicks>>(cache.ticks);
    const [error, setError] = useState<string | null>(null);
    const [is_loading, setIsLoading] = useState(!cache.markets.length);

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
            // The same request the bot's own teardown sends: forget by the id
            // the stream reported.
            subscription_ids.current.forEach(id => {
                api_base.api?.send({ forget: id });
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

                // api_base already holds the symbol list; ask it to fetch only
                // when it has none, the way the shared tick hook does.
                if (!api_base.has_active_symbols || !Array.isArray(api_base.active_symbols) || !api_base.active_symbols.length) {
                    try {
                        await (api_base as any).getActiveSymbols();
                    } catch {
                        /* fall through to whatever is cached */
                    }
                }

                const pip_sizes: Record<string, number> =
                    api_base.pip_sizes && typeof api_base.pip_sizes === 'object'
                        ? (api_base.pip_sizes as Record<string, number>)
                        : {};

                const list = pickVolatilityMarkets(api_base.active_symbols || [], pip_sizes);
                if (!is_mounted.current) return;
                if (!list.length) throw new Error('No volatility markets came back from Deriv');
                markets_ref.current = list;
                cache.markets = list;
                setMarkets(list);
                // The cards can be drawn now; their numbers arrive per market.
                if (is_mounted.current) setIsLoading(false);

                // One listener for every stream: the frame carries its symbol.
                const onMessage = (evt: MessageEvent) => {
                    try {
                        const data = JSON.parse(evt.data as string);
                        if (data?.msg_type !== 'tick' || !data?.tick?.symbol) return;

                        const market = markets_ref.current.find(item => item.symbol === data.tick.symbol);
                        if (!market) return;

                        // Each tick states its own precision; prefer it.
                        const pip_size = Number.isFinite(Number(data.tick.pip_size))
                            ? Number(data.tick.pip_size)
                            : market.pip_size;
                        const quote = Number(data.tick.quote);
                        setTicks(prev => {
                            const current = prev[market.symbol] ?? { quotes: [], digits: [] };
                            const limit = Math.max(10, count_ref.current);
                            const next = {
                                ...prev,
                                [market.symbol]: {
                                    quotes: [...current.quotes, quote].slice(-limit),
                                    digits: [...current.digits, lastDigitOf(quote, pip_size)].slice(-limit),
                                },
                            };
                            cache.ticks = next;
                            return next;
                        });
                    } catch {
                        /* a frame we do not care about */
                    }
                };
                listener.current = onMessage;
                api_base?.api?.connection?.addEventListener('message', onMessage);

                // Seed and subscribe a few markets at a time. One after another
                // meant the last card waited on the twelve before it, which is
                // what put a loading line in front of the whole board; all at
                // once would ask Deriv for a dozen histories in one breath.
                const CONCURRENCY = 5;
                let cursor = 0;

                const seedOne = async (market: TMarket) => {
                    try {
                        const history: any = await (api_base.api as any).send({
                            ticks_history: market.symbol,
                            end: 'latest',
                            count: Math.max(10, count_ref.current),
                            style: 'ticks',
                        });

                        const prices: number[] = (history?.history?.prices || []).map(Number);
                        // The history response states the precision for this market.
                        const history_pip = Number.isFinite(Number(history?.pip_size))
                            ? Number(history.pip_size)
                            : market.pip_size;
                        if (prices.length && is_mounted.current) {
                            // Each market appears as soon as its own history
                            // lands, rather than waiting for the whole board.
                            setTicks(prev => {
                                const next = {
                                    ...prev,
                                    [market.symbol]: {
                                        quotes: prices,
                                        digits: prices.map(price => lastDigitOf(price, history_pip)),
                                    },
                                };
                                cache.ticks = next;
                                return next;
                            });
                        }

                        const stream: any = await (api_base.api as any).send({ ticks: market.symbol, subscribe: 1 });
                        const id = stream?.subscription?.id;
                        if (id) subscription_ids.current.push(id);
                    } catch {
                        /* one market failing should not stop the rest */
                    }
                };

                const worker = async () => {
                    for (;;) {
                        if (!is_mounted.current) return;
                        const index = cursor++;
                        if (index >= list.length) return;
                        await seedOne(list[index]);
                    }
                };

                await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

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
                    // The history response states the precision for this market.
                    const history_pip = Number.isFinite(Number(history?.pip_size))
                        ? Number(history.pip_size)
                        : market.pip_size;
                    if (!prices.length || cancelled) continue;
                    setTicks(prev => ({
                        ...prev,
                        [market.symbol]: {
                            quotes: prices,
                            digits: prices.map(price => lastDigitOf(price, history_pip)),
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


