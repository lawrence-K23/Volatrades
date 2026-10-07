/**
 * Manual Trader, laid out as Deriv's own trader is.
 *
 * Three columns: open positions on the left, the platform chart in the middle
 * with the market chip over it, and the trade panel on the right - trade type
 * at the top, its own inputs under it, and the two priced buttons at the
 * bottom. Prices are subscribed `proposal` quotes, so the payout and the
 * percentage on each button move with the market, and a purchase is placed
 * against the quoted proposal id, which is what the platform itself does.
 *
 * Automation is deliberately not here: Auto Trader and Speedbot are the
 * screens for that. This one buys one contract when a button is pressed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base, MessageTypes } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import ChartWrapper from '@/pages/chart/chart-wrapper';
import { getContractTypes } from '@/utils/analysis/deriv-market-data';
import { getVolatilitySymbols } from '@/utils/analysis/market-scanner';
import { localize } from '@deriv-com/translations';
import OpenPositions from './open-positions';
import { byId, type TTradeTypeId } from './trade-types';
import TradeTypesMenu from './trade-types-menu';
import useProposal, { type TProposalInputs } from './use-proposal';
import './manual-trader.scss';

type TSymbol = { symbol: string; display_name: string };

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const GROWTH_RATES = [0.01, 0.02, 0.03, 0.04, 0.05];
const MULTIPLIERS = [100, 200, 300, 400, 500];
const MAX_TICKS = 10;
const DIGIT_TYPES: TTradeTypeId[] = ['matches_differs', 'even_odd', 'over_under'];

const money = (value: number | null, currency: string) =>
    value === null ? '--' : `${value.toFixed(2)} ${currency}`;

const percent = (value: number | null) => (value === null ? '--' : `${value.toFixed(2)}%`);

const ManualTrader = observer(() => {
    const store = useStore();
    const { client, chart_store, journal } = store;
    const currency = client?.currency || 'USD';

    const tick_sub_id = useRef<string | null>(null);
    const tick_listener = useRef<((evt: MessageEvent) => void) | null>(null);
    const is_mounted = useRef(true);

    const [symbols, setSymbols] = useState<TSymbol[]>([]);
    const [symbol, setSymbol] = useState('');
    const [quote, setQuote] = useState<{ value: number; first: number } | null>(null);

    const [trade_type_id, setTradeTypeId] = useState<TTradeTypeId>('even_odd');
    const [available, setAvailable] = useState<string[] | null>(null);
    const [types_open, setTypesOpen] = useState(false);
    const [market_open, setMarketOpen] = useState(false);
    const [market_search, setMarketSearch] = useState('');

    const [duration, setDuration] = useState(1);
    const [digit, setDigit] = useState(2);
    const [stake, setStake] = useState('100');
    const [basis, setBasis] = useState<'stake' | 'payout'>('stake');
    const [growth_rate, setGrowthRate] = useState(0.03);
    const [multiplier, setMultiplier] = useState(400);
    const [barrier_offset, setBarrierOffset] = useState('+0.10');
    const [take_profit, setTakeProfit] = useState<string>('');
    const [use_take_profit, setUseTakeProfit] = useState(false);
    const [stop_loss, setStopLoss] = useState<string>('');
    const [use_stop_loss, setUseStopLoss] = useState(false);
    const [deal_cancellation, setDealCancellation] = useState(false);

    const [status, setStatus] = useState<string | null>(null);
    const [is_error, setIsError] = useState(false);
    const [buying, setBuying] = useState<number | null>(null);

    const trade_type = byId(trade_type_id);
    const shows_digit_stats = DIGIT_TYPES.includes(trade_type_id);

    const say = useCallback((message: string | null, error = false) => {
        if (!is_mounted.current) return;
        setStatus(message);
        setIsError(error);
    }, []);

    const send = useCallback(async (request: Record<string, unknown>) => {
        if (!api_base?.api) throw new Error(localize('Not connected to Deriv yet. Please try again.'));
        const response: any = await api_base.api.send(request);
        if (response?.error) throw new Error(response.error.message || response.error.code);
        return response;
    }, []);

    /* ------------------------------------------------------------ ticks */

    const stopTicks = useCallback(() => {
        try {
            if (tick_sub_id.current) {
                api_base?.api?.send({ forget: tick_sub_id.current });
                tick_sub_id.current = null;
            }
            if (tick_listener.current) {
                api_base?.api?.connection?.removeEventListener('message', tick_listener.current);
                tick_listener.current = null;
            }
        } catch {
            /* the stream closes with the socket anyway */
        }
    }, []);

    const startTicks = useCallback(
        async (next_symbol: string) => {
            stopTicks();
            setQuote(null);

            if (!next_symbol) return;

            try {
                const history = await send({
                    ticks_history: next_symbol,
                    end: 'latest',
                    count: 60,
                    style: 'ticks',
                });
                const prices: number[] = (history?.history?.prices || []).map(Number);
                if (prices.length && is_mounted.current) {
                    setQuote({ value: prices[prices.length - 1], first: prices[0] });
                }

                const stream = await send({ ticks: next_symbol, subscribe: 1 });
                if (stream?.subscription?.id) tick_sub_id.current = String(stream.subscription.id);

                const onMessage = (evt: MessageEvent) => {
                    try {
                        const data = JSON.parse(evt.data as string);
                        if (data?.msg_type !== 'tick' || data?.tick?.symbol !== next_symbol) return;
                        const value = Number(data.tick.quote);
                        setQuote(previous => ({ value, first: previous?.first ?? value }));
                    } catch {
                        /* a frame we do not care about */
                    }
                };
                tick_listener.current = onMessage;
                api_base?.api?.connection?.addEventListener('message', onMessage);
            } catch (error) {
                say(error instanceof Error ? error.message : localize('Could not follow that market'), true);
            }
        },
        [say, send, stopTicks]
    );

    /* ---------------------------------------------------------- markets */

    useEffect(() => {
        is_mounted.current = true;

        (async () => {
            try {
                // The analysis loader reads both the old and the new field
                // names, asks Deriv itself when api_base has nothing, and
                // caches the answer - so the list is here on arrival.
                const list: TSymbol[] = (await getVolatilitySymbols()).map(item => ({
                    symbol: item.symbol,
                    display_name: item.display_name,
                }));

                if (!is_mounted.current) return;
                if (!list.length) throw new Error(localize('Deriv returned no volatility markets.'));

                setSymbols(list);
                const first = list.find(item => item.symbol === chart_store?.symbol)?.symbol || list[0].symbol;
                setSymbol(first);
                void startTicks(first);
            } catch (error) {
                say(error instanceof Error ? error.message : localize('Could not load markets'), true);
            }
        })();

        return () => {
            is_mounted.current = false;
            stopTicks();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Which trade types Deriv actually offers on this market, so the menu shows
    // what can be traded rather than a fixed list.
    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;

        (async () => {
            try {
                // getContractTypes answers with a Set.
                const contracts = await getContractTypes(symbol);
                if (cancelled || !is_mounted.current) return;
                setAvailable(contracts?.size ? Array.from(contracts) : null);
            } catch {
                if (!cancelled) setAvailable(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [symbol]);

    // The chart and the panel follow one market, whichever is used to change it.
    useEffect(() => {
        if (!symbol || chart_store?.symbol === symbol) return;
        chart_store?.onSymbolChange?.(symbol);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol]);

    useEffect(() => {
        const from_chart = chart_store?.symbol;
        if (!from_chart || from_chart === symbol) return;
        if (!symbols.some(item => item.symbol === from_chart)) return;
        setSymbol(from_chart);
        void startTicks(from_chart);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chart_store?.symbol, symbols]);

    /* --------------------------------------------------------- proposals */

    const inputs: TProposalInputs = useMemo(
        () => ({
            symbol,
            currency,
            basis,
            stake: Number(stake) || 0,
            duration,
            digit,
            growth_rate,
            multiplier,
            barrier_offset,
            take_profit: use_take_profit ? Number(take_profit) || null : null,
            stop_loss: use_stop_loss ? Number(stop_loss) || null : null,
            deal_cancellation,
        }),
        [
            barrier_offset,
            basis,
            currency,
            deal_cancellation,
            digit,
            duration,
            growth_rate,
            multiplier,
            stake,
            stop_loss,
            symbol,
            take_profit,
            use_stop_loss,
            use_take_profit,
        ]
    );

    const { prices } = useProposal(trade_type, inputs, Boolean(symbol));

    /* ---------------------------------------------------------- buying */

    const buy = useCallback(
        async (index: number) => {
            const side = trade_type.sides[index];
            const price = prices[index];
            if (!side) return;

            if (!trade_type.tradable) {
                say(localize('That trade type is not available in this panel yet.'), true);
                return;
            }
            if (!price?.id) {
                say(localize('Waiting for a price on that side.'), true);
                return;
            }

            setBuying(index);
            say(localize('Buying…'));

            try {
                // Bought against the quote on screen, as the platform does.
                const bought = await send({ buy: price.id, price: price.ask_price ?? Number(stake) });
                const contract_id = bought?.buy?.contract_id;
                say(
                    localize('Bought {{label}} for {{amount}}', {
                        label: side.label,
                        amount: money(Number(bought?.buy?.buy_price ?? 0), currency),
                    })
                );
                journal?.pushMessage(
                    `${localize('Bought')} ${side.contract_type} ${localize('for')} ${Number(
                        bought?.buy?.buy_price ?? 0
                    ).toFixed(2)} ${currency}`,
                    MessageTypes.NOTIFY,
                    'journal__text'
                );
                if (contract_id) {
                    // Following it is what puts it in Open positions and in the
                    // run panel's transactions.
                    void send({ proposal_open_contract: 1, contract_id, subscribe: 1 }).catch(() => {
                        /* it still settles; only live updates are missed */
                    });
                }
            } catch (error) {
                say(error instanceof Error ? error.message : localize('Could not buy'), true);
            } finally {
                if (is_mounted.current) setBuying(null);
            }
        },
        [currency, journal, prices, say, send, stake, trade_type]
    );

    /* ----------------------------------------------------------- render */

    const market_name = symbols.find(item => item.symbol === symbol)?.display_name || symbol;
    const change = quote ? quote.value - quote.first : 0;
    const change_pct = quote && quote.first ? (change / quote.first) * 100 : 0;
    const filtered_markets = symbols.filter(item =>
        item.display_name.toLowerCase().includes(market_search.trim().toLowerCase())
    );

    const field = (name: string) => trade_type.fields.includes(name as never);

    return (
        <div className='manual-trader'>
            <div className='mt-grid'>
                <aside className='mt-grid__left'>
                    <OpenPositions currency={currency} />
                </aside>

                <main className='mt-grid__chart'>
                    <div className='mt-market'>
                        <button
                            type='button'
                            className='mt-market__chip'
                            onClick={() => setMarketOpen(open => !open)}
                        >
                            <span className='mt-market__badge'>{market_name.replace(/\D/g, '').slice(0, 3)}</span>
                            <span className='mt-market__text'>
                                <span className='mt-market__name'>{market_name}</span>
                                <span
                                    className={`mt-market__quote ${
                                        change >= 0 ? 'mt-market__quote--up' : 'mt-market__quote--down'
                                    }`}
                                >
                                    {quote ? quote.value.toFixed(2) : '--'} {change >= 0 ? '+' : ''}
                                    {change.toFixed(2)} ({change_pct.toFixed(2)}%){' '}
                                    {change >= 0 ? '▲' : '▼'}
                                </span>
                            </span>
                            <span className='mt-market__chevron' aria-hidden='true'>
                                ⌄
                            </span>
                        </button>

                        {market_open && (
                            <div className='mt-market__menu'>
                                <input
                                    type='search'
                                    className='mt-market__search'
                                    placeholder={localize('Search markets')}
                                    value={market_search}
                                    onChange={event => setMarketSearch(event.target.value)}
                                />
                                <div className='mt-market__list'>
                                    {filtered_markets.map(item => (
                                        <button
                                            key={item.symbol}
                                            type='button'
                                            className={`mt-market__option ${
                                                item.symbol === symbol ? 'mt-market__option--active' : ''
                                            }`}
                                            onClick={() => {
                                                setSymbol(item.symbol);
                                                void startTicks(item.symbol);
                                                setMarketOpen(false);
                                            }}
                                        >
                                            {item.display_name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <ChartWrapper prefix='manual-trader' show_digits_stats={shows_digit_stats} />
                </main>

                <aside className='mt-grid__panel'>
                    <a
                        className='mt-panel__learn'
                        href='https://deriv.com/trade-types/options/'
                        target='_blank'
                        rel='noopener noreferrer'
                    >
                        {localize('Learn about this trade type')}
                    </a>

                    <button type='button' className='mt-panel__type' onClick={() => setTypesOpen(open => !open)}>
                        <span className='mt-panel__type-back' aria-hidden='true'>
                            ‹
                        </span>
                        <span className='mt-types__marks' aria-hidden='true'>
                            <span className='mt-types__mark mt-types__mark--up' />
                            {trade_type.sides[1] && <span className='mt-types__mark mt-types__mark--down' />}
                        </span>
                        <span className='mt-panel__type-label'>{localize(trade_type.label)}</span>
                    </button>

                    {types_open && (
                        <TradeTypesMenu
                            selected={trade_type_id}
                            available={available}
                            onSelect={setTradeTypeId}
                            onClose={() => setTypesOpen(false)}
                        />
                    )}

                    {field('growth_rate') && (
                        <div className='mt-panel__block'>
                            <div className='mt-panel__label'>{localize('Growth rate')}</div>
                            <div className='mt-panel__pills'>
                                {GROWTH_RATES.map(rate => (
                                    <button
                                        key={rate}
                                        type='button'
                                        className={`mt-panel__pill ${
                                            rate === growth_rate ? 'mt-panel__pill--active' : ''
                                        }`}
                                        onClick={() => setGrowthRate(rate)}
                                    >
                                        {Math.round(rate * 100)}%
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {field('multiplier') && (
                        <div className='mt-panel__block'>
                            <div className='mt-panel__label'>{localize('Multiplier')}</div>
                            <div className='mt-panel__pills'>
                                {MULTIPLIERS.map(value => (
                                    <button
                                        key={value}
                                        type='button'
                                        className={`mt-panel__pill ${
                                            value === multiplier ? 'mt-panel__pill--active' : ''
                                        }`}
                                        onClick={() => setMultiplier(value)}
                                    >
                                        x{value}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {field('duration') && (
                        <div className='mt-panel__block'>
                            <div className='mt-panel__boxed'>{localize('Ticks')}</div>
                            <input
                                className='mt-panel__slider'
                                type='range'
                                min={1}
                                max={MAX_TICKS}
                                value={duration}
                                onChange={event => setDuration(Number(event.target.value))}
                                aria-label={localize('Ticks')}
                            />
                            <div className='mt-panel__slider-value'>
                                {duration} {duration === 1 ? localize('Tick') : localize('Ticks')}
                            </div>
                        </div>
                    )}

                    {field('digit_prediction') && (
                        <div className='mt-panel__block'>
                            <div className='mt-panel__label mt-panel__label--center'>
                                {localize('Last Digit Prediction')}
                            </div>
                            <div className='mt-panel__digits'>
                                {DIGITS.map(value => (
                                    <button
                                        key={value}
                                        type='button'
                                        className={`mt-panel__digit ${
                                            value === digit ? 'mt-panel__digit--active' : ''
                                        }`}
                                        onClick={() => setDigit(value)}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {field('barrier_offset') && (
                        <div className='mt-panel__block'>
                            <div className='mt-panel__label'>{localize('Barrier')}</div>
                            <input
                                className='mt-panel__input'
                                value={barrier_offset}
                                onChange={event => setBarrierOffset(event.target.value)}
                                aria-label={localize('Barrier')}
                            />
                        </div>
                    )}

                    <div className='mt-panel__block'>
                        {field('basis_toggle') ? (
                            <div className='mt-panel__toggle'>
                                <button
                                    type='button'
                                    className={`mt-panel__toggle-side ${
                                        basis === 'stake' ? 'mt-panel__toggle-side--active' : ''
                                    }`}
                                    onClick={() => setBasis('stake')}
                                >
                                    {localize('Stake')}
                                </button>
                                <button
                                    type='button'
                                    className={`mt-panel__toggle-side ${
                                        basis === 'payout' ? 'mt-panel__toggle-side--active' : ''
                                    }`}
                                    onClick={() => setBasis('payout')}
                                >
                                    {localize('Payout')}
                                </button>
                            </div>
                        ) : (
                            <div className='mt-panel__label'>{localize('Stake')}</div>
                        )}

                        <div className='mt-panel__stepper'>
                            <button
                                type='button'
                                className='mt-panel__step'
                                onClick={() => setStake(String(Math.max(0.35, (Number(stake) || 0) - 1)))}
                                aria-label={localize('Less')}
                            >
                                −
                            </button>
                            <input
                                className='mt-panel__stake'
                                type='number'
                                min={0.35}
                                step={1}
                                value={stake}
                                onChange={event => setStake(event.target.value)}
                                aria-label={localize('Stake')}
                            />
                            <button
                                type='button'
                                className='mt-panel__step'
                                onClick={() => setStake(String((Number(stake) || 0) + 1))}
                                aria-label={localize('More')}
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {field('take_profit') && (
                        <label className='mt-panel__check'>
                            <input
                                type='checkbox'
                                checked={use_take_profit}
                                onChange={event => setUseTakeProfit(event.target.checked)}
                            />
                            <span>{localize('Take profit')}</span>
                            {use_take_profit && (
                                <input
                                    className='mt-panel__input mt-panel__input--small'
                                    type='number'
                                    min={0}
                                    value={take_profit}
                                    onChange={event => setTakeProfit(event.target.value)}
                                    aria-label={localize('Take profit')}
                                />
                            )}
                        </label>
                    )}

                    {field('stop_loss') && (
                        <label className='mt-panel__check'>
                            <input
                                type='checkbox'
                                checked={use_stop_loss}
                                onChange={event => setUseStopLoss(event.target.checked)}
                            />
                            <span>{localize('Stop loss')}</span>
                            {use_stop_loss && (
                                <input
                                    className='mt-panel__input mt-panel__input--small'
                                    type='number'
                                    min={0}
                                    value={stop_loss}
                                    onChange={event => setStopLoss(event.target.value)}
                                    aria-label={localize('Stop loss')}
                                />
                            )}
                        </label>
                    )}

                    {field('deal_cancellation') && (
                        <label className='mt-panel__check'>
                            <input
                                type='checkbox'
                                checked={deal_cancellation}
                                onChange={event => setDealCancellation(event.target.checked)}
                            />
                            <span>{localize('Deal cancellation')}</span>
                        </label>
                    )}

                    {/* What the quote says about this contract, as Deriv lists it. */}
                    {trade_type_id === 'multipliers' && (
                        <div className='mt-panel__facts'>
                            <span>
                                {localize('Commission')}
                                <b>{money(prices[0]?.commission ?? null, currency)}</b>
                            </span>
                            <span>
                                {localize('Stop out')}
                                <b>{money(prices[0]?.stop_out ?? null, currency)}</b>
                            </span>
                        </div>
                    )}

                    {trade_type_id === 'accumulator' && (
                        <div className='mt-panel__facts mt-panel__facts--rows'>
                            <span>
                                {localize('Max. payout')}
                                <b>{money(prices[0]?.max_payout ?? null, currency)}</b>
                            </span>
                            <span>
                                {localize('Max. ticks')}
                                <b>
                                    {prices[0]?.max_ticks === null || prices[0]?.max_ticks === undefined
                                        ? '--'
                                        : `${prices[0].max_ticks} ${localize('ticks')}`}
                                </b>
                            </span>
                        </div>
                    )}

                    <div className='mt-panel__ctas'>
                        {trade_type.sides.map((side, index) => {
                            if (!side) return null;
                            const price = prices[index];
                            const is_single = !trade_type.sides[1];
                            const shows_amount = trade_type_id === 'multipliers';

                            return (
                                <div key={side.contract_type} className='mt-panel__cta-wrap'>
                                    {!is_single && !shows_amount && (
                                        <div className='mt-panel__payout'>
                                            {localize('Payout')} {money(price?.payout ?? null, currency)}
                                        </div>
                                    )}
                                    <button
                                        type='button'
                                        className={`mt-panel__cta ${
                                            index === 0 ? 'mt-panel__cta--up' : 'mt-panel__cta--down'
                                        }`}
                                        onClick={() => buy(index)}
                                        disabled={buying !== null || !trade_type.tradable}
                                    >
                                        <span className='mt-panel__cta-label'>{localize(side.label)}</span>
                                        <span className='mt-panel__cta-value'>
                                            {is_single
                                                ? ''
                                                : shows_amount
                                                  ? money(Number(stake) || 0, currency)
                                                  : percent(price?.percentage ?? null)}
                                        </span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {!trade_type.tradable && (
                        <p className='mt-panel__note'>
                            {localize('This trade type is shown for reference; it cannot be bought here yet.')}
                        </p>
                    )}

                    {(status || prices[0]?.error) && (
                        <p className={`mt-panel__status ${is_error ? 'mt-panel__status--error' : ''}`}>
                            {status || prices[0]?.error}
                        </p>
                    )}
                </aside>
            </div>
        </div>
    );
});

export default ManualTrader;
