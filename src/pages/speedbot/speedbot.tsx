/**
 * Speedbot.
 *
 * One trade per tick on a digit even/odd contract, with the stake sizing and
 * the stopping rules a tick trader works with: alternate the side, martingale
 * after a loss, recover a deficit, stop at a take profit or a stop loss.
 *
 * Ticks come from the app's shared stream (useTickData), the same one the
 * Analysis Tool and Bulk Trader read, so the page is live the moment it opens
 * and every tick it shows is a tick the bot acted on. Contracts are bought on
 * the authorised socket and reported into the bot's own stores, so they appear
 * in the Summary / Transactions / Journal drawer beside the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api_base, MessageTypes } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { useTickData } from '@/hooks/useTickData';
import { localize } from '@deriv-com/translations';
import { DEFAULT_PAYOUT_RATE, pickSide, pickStake, type TContractType } from './strategy';
import './speedbot.scss';

type TSpeed = 'fast' | 'normal';

const MAX_TICKS_DURATION = 10;
/** In NORMAL mode, how long to wait on a contract before moving on regardless. */
const SETTLE_PATIENCE_MS = 60000;

const toNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const Switch = ({
    label,
    checked,
    onChange,
    className = '',
}: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
    className?: string;
}) => (
    <button
        type='button'
        role='switch'
        aria-checked={checked}
        aria-label={label}
        className={`speedbot__switch ${checked ? 'speedbot__switch--on' : ''} ${className}`}
        onClick={() => onChange(!checked)}
    >
        <span className='speedbot__switch-knob' />
    </button>
);

const Speedbot = () => {
    // The stores the bot itself writes to, so these trades show up in the
    // run panel's Summary, Transactions and Journal tabs.
    const { transactions, journal } = useStore() ?? {};
    const { availableSymbols, selectedSymbol, setSelectedSymbol, latestTick } = useTickData();

    const [contractType, setContractType] = useState<TContractType>('DIGITEVEN');
    const [speed, setSpeed] = useState<TSpeed>('fast');
    const [ticksDuration, setTicksDuration] = useState('1');
    const [stake, setStake] = useState('0.5');
    const [takeProfit, setTakeProfit] = useState('10');
    const [stopLoss, setStopLoss] = useState('50');
    const [alternateSides, setAlternateSides] = useState(false);
    const [alternateOnLoss, setAlternateOnLoss] = useState(false);
    const [martingaleOn, setMartingaleOn] = useState(true);
    const [multiplier, setMultiplier] = useState('1.15');
    const [recoveryMode, setRecoveryMode] = useState(false);

    const [isRunning, setIsRunning] = useState(false);
    const [ticksProcessed, setTicksProcessed] = useState(0);
    const [profitLoss, setProfitLoss] = useState(0);
    const [status, setStatus] = useState<string | null>(null);
    const [statusIsError, setStatusIsError] = useState(false);

    // Everything the tick handler needs, read at the moment a tick lands rather
    // than captured when the handler was made.
    const live = {
        contractType,
        speed,
        ticksDuration,
        stake,
        takeProfit,
        stopLoss,
        alternateSides,
        alternateOnLoss,
        martingaleOn,
        multiplier,
        recoveryMode,
        symbol: selectedSymbol,
    };
    const settings = useRef(live);
    settings.current = live;

    const running_ref = useRef(false);
    const in_flight = useRef(0);
    const last_type = useRef<TContractType>('DIGITEVEN');
    const last_stake = useRef(0);
    const last_result = useRef<'win' | 'loss' | null>(null);
    const last_buy_at = useRef(0);
    const payout_rate = useRef(DEFAULT_PAYOUT_RATE);
    const session_pl = useRef(0);
    const our_contracts = useRef<Set<number>>(new Set());
    const last_tick_epoch = useRef<number | null>(null);
    const is_mounted = useRef(true);

    useEffect(() => {
        is_mounted.current = true;
        return () => {
            is_mounted.current = false;
            running_ref.current = false;
        };
    }, []);

    const apiSend = useCallback(async (request: Record<string, unknown>, timeoutMs = 15000) => {
        if (!api_base.api) throw new Error('API not connected');
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeoutMs));
        return (await Promise.race([(api_base.api as any).send(request), timeout])) as any;
    }, []);

    const stop = useCallback(
        (reason?: string, is_error = false) => {
            running_ref.current = false;
            if (!is_mounted.current) return;
            setIsRunning(false);
            if (reason) {
                setStatus(reason);
                setStatusIsError(is_error);
            }
        },
        []
    );

    /**
     * Settlements: the running total, the take profit and stop loss, and the
     * win or loss the next stake is sized from.
     */
    useEffect(() => {
        if (!api_base.api) return undefined;

        const subscription = api_base.api.onMessage().subscribe(({ data }: { data: any }) => {
            if (!data || data.error || data.msg_type !== 'proposal_open_contract') return;
            const contract = data.proposal_open_contract;
            const id = Number(contract?.contract_id);
            if (!id || !our_contracts.current.has(id)) return;

            transactions?.onBotContractEvent(contract);
            if (!contract.is_sold) return;

            const profit = Number(contract.profit ?? 0);
            const buy_price = Number(contract.buy_price ?? 0);
            const payout = Number(contract.payout ?? 0);
            if (buy_price > 0 && payout > 0) payout_rate.current = payout / buy_price - 1;

            session_pl.current += profit;
            last_result.current = profit >= 0 ? 'win' : 'loss';
            in_flight.current = Math.max(0, in_flight.current - 1);
            our_contracts.current.delete(id);
            if (data.subscription?.id) api_base.api?.send({ forget: data.subscription.id });

            if (is_mounted.current) setProfitLoss(session_pl.current);

            journal?.pushMessage(
                `${profit >= 0 ? localize('Won') : localize('Lost')} ${profit.toFixed(2)} ${
                    contract.currency ?? ''
                } on ${contract.display_name ?? contract.underlying_symbol ?? ''} ${contract.contract_type ?? ''}`,
                profit >= 0 ? MessageTypes.SUCCESS : MessageTypes.ERROR,
                'journal__text'
            );

            if (!running_ref.current) return;

            const take_profit = toNumber(settings.current.takeProfit, 0);
            const stop_loss = toNumber(settings.current.stopLoss, 0);
            if (take_profit > 0 && session_pl.current >= take_profit) {
                stop(localize('Take profit reached at {{amount}}', { amount: session_pl.current.toFixed(2) }));
                journal?.pushMessage(localize('Speedbot stopped: take profit reached'), MessageTypes.SUCCESS, 'journal__text');
            } else if (stop_loss > 0 && session_pl.current <= -stop_loss) {
                stop(localize('Stop loss reached at {{amount}}', { amount: session_pl.current.toFixed(2) }), true);
                journal?.pushMessage(localize('Speedbot stopped: stop loss reached'), MessageTypes.ERROR, 'journal__text');
            }
        });

        return () => subscription.unsubscribe();
    }, [journal, stop, transactions]);

    /** The stake for the next trade, under whichever sizing rules are on. */
    const nextStake = useCallback(
        () =>
            pickStake({
                base: toNumber(settings.current.stake, 0.5),
                martingale_on: settings.current.martingaleOn,
                multiplier: toNumber(settings.current.multiplier, 1),
                recovery_on: settings.current.recoveryMode,
                last_result: last_result.current,
                last_stake: last_stake.current,
                session_pl: session_pl.current,
                payout_rate: payout_rate.current,
            }),
        []
    );

    /** The side of the next trade, under whichever alternation is on. */
    const nextType = useCallback(
        (): TContractType =>
            pickSide({
                selected: settings.current.contractType,
                last_type: last_type.current,
                last_result: last_result.current,
                alternate_sides: settings.current.alternateSides,
                alternate_on_loss: settings.current.alternateOnLoss,
            }),
        []
    );

    /** Buy one contract and follow it to settlement. */
    const placeTrade = useCallback(async () => {
        const currency = (api_base.account_info as any)?.currency || 'USD';
        const amount = nextStake();
        const contract_type = nextType();
        const duration = Math.min(Math.max(Math.trunc(toNumber(settings.current.ticksDuration, 1)), 1), MAX_TICKS_DURATION);

        last_type.current = contract_type;
        last_stake.current = amount;
        last_buy_at.current = Date.now();
        in_flight.current += 1;

        try {
            const bought = await apiSend({
                buy: 1,
                price: amount,
                parameters: {
                    amount,
                    basis: 'stake',
                    contract_type,
                    currency,
                    duration,
                    duration_unit: 't',
                    // The Options API calls this underlying_symbol, not symbol.
                    underlying_symbol: settings.current.symbol,
                },
            });

            if (bought?.error) throw new Error(bought.error.message || 'Buy error');

            const contract_id = Number(bought?.buy?.contract_id);
            if (!contract_id) throw new Error('Missing contract id');

            our_contracts.current.add(contract_id);

            journal?.pushMessage(
                `${localize('Bought')} ${contract_type} ${localize('for')} ${Number(
                    bought.buy.buy_price ?? amount
                ).toFixed(2)} ${currency}`,
                MessageTypes.NOTIFY,
                'journal__text'
            );

            void apiSend({ proposal_open_contract: 1, contract_id, subscribe: 1 }, 20000).catch(() => {
                /* the contract still settles; only live updates are missed */
            });
        } catch (error) {
            in_flight.current = Math.max(0, in_flight.current - 1);
            const message = error instanceof Error ? error.message : localize('Trade failed');
            if (is_mounted.current) {
                setStatus(`${localize('Trade failed')}: ${message}`);
                setStatusIsError(true);
            }
            journal?.pushMessage(`${localize('Trade failed')}: ${message}`, MessageTypes.ERROR, 'journal__text');
        }
    }, [apiSend, journal, nextStake, nextType]);

    /**
     * One tick, one decision. On FAST a trade goes out on every tick whether or
     * not the last one has settled; on NORMAL the next trade waits for it.
     */
    useEffect(() => {
        if (!latestTick) return;
        if (latestTick.epoch === last_tick_epoch.current) return;
        last_tick_epoch.current = latestTick.epoch;

        setTicksProcessed(count => count + 1);

        if (!running_ref.current) return;

        // NORMAL waits for the open contract to settle. If a settlement never
        // arrives - a dropped stream rather than a dropped contract - waiting
        // forever would silently stall the bot, so after a minute it moves on.
        if (settings.current.speed === 'normal' && in_flight.current > 0) {
            const waited = Date.now() - last_buy_at.current;
            if (waited < SETTLE_PATIENCE_MS) return;
            in_flight.current = 0;
        }

        void placeTrade();
    }, [latestTick, placeTrade]);

    const start = useCallback(() => {
        if (!api_base.api) {
            setStatus(localize('Not connected to Deriv yet. Try again in a moment.'));
            setStatusIsError(true);
            return;
        }

        in_flight.current = 0;
        last_result.current = null;
        last_stake.current = 0;
        last_type.current = contractType;
        session_pl.current = 0;
        running_ref.current = true;

        setProfitLoss(0);
        setTicksProcessed(0);
        setStatus(null);
        setStatusIsError(false);
        setIsRunning(true);

        journal?.pushMessage(localize('Speedbot started'), MessageTypes.NOTIFY, 'journal__text');
    }, [contractType, journal]);

    const marketOptions = useMemo(
        () =>
            availableSymbols.map(item => (
                <option key={item.symbol} value={item.symbol}>
                    {item.display_name || item.symbol}
                </option>
            )),
        [availableSymbols]
    );

    return (
        <div className='speedbot' data-testid='dt_speedbot'>
            <div className='speedbot__inner'>
                <h2 className='speedbot__title'>{localize('EXECUTE TRADE ON EVERY TICK')}</h2>

                <div className='speedbot__runrow'>
                    <button
                        type='button'
                        className={`speedbot__start ${isRunning ? 'speedbot__start--stop' : ''}`}
                        onClick={() => (isRunning ? stop(localize('Stopped')) : start())}
                    >
                        {isRunning ? localize('STOP') : localize('START')}
                    </button>

                    <div className='speedbot__speed'>
                        <span className='speedbot__speed-label'>{localize('Execution Speed')}</span>
                        <div className='speedbot__speed-options'>
                            <button
                                type='button'
                                className={`speedbot__speed-option ${
                                    speed === 'fast' ? 'speedbot__speed-option--active' : ''
                                }`}
                                onClick={() => setSpeed('fast')}
                            >
                                ⚡ {localize('FAST')}
                            </button>
                            <button
                                type='button'
                                className={`speedbot__speed-option ${
                                    speed === 'normal' ? 'speedbot__speed-option--active' : ''
                                }`}
                                onClick={() => setSpeed('normal')}
                            >
                                ▶▶ {localize('NORMAL')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className='speedbot__market'>
                    <select
                        className='speedbot__select'
                        value={selectedSymbol}
                        onChange={event => setSelectedSymbol(event.target.value)}
                        aria-label={localize('Market')}
                    >
                        {marketOptions}
                    </select>
                    <span className='speedbot__price'>{latestTick?.quoteStr ?? '—'}</span>
                </div>

                <select
                    className='speedbot__select speedbot__select--block'
                    value={contractType}
                    onChange={event => setContractType(event.target.value as TContractType)}
                    aria-label={localize('Trade type')}
                >
                    <option value='DIGITEVEN'>{localize('Even')}</option>
                    <option value='DIGITODD'>{localize('Odd')}</option>
                </select>

                <div className='speedbot__fields'>
                    <label className='speedbot__field'>
                        <span className='speedbot__field-label'>{localize('Ticks')}</span>
                        <input
                            type='number'
                            min={1}
                            max={MAX_TICKS_DURATION}
                            value={ticksDuration}
                            onChange={event => setTicksDuration(event.target.value)}
                        />
                    </label>
                    <label className='speedbot__field'>
                        <span className='speedbot__field-label'>{localize('Stake')}</span>
                        <input
                            type='number'
                            min={0.35}
                            step={0.01}
                            value={stake}
                            onChange={event => setStake(event.target.value)}
                        />
                    </label>
                    <label className='speedbot__field'>
                        <span className='speedbot__field-label'>{localize('Take Profit')}</span>
                        <input
                            type='number'
                            min={0}
                            step={0.01}
                            value={takeProfit}
                            onChange={event => setTakeProfit(event.target.value)}
                        />
                    </label>
                    <label className='speedbot__field'>
                        <span className='speedbot__field-label'>{localize('Stop Loss')}</span>
                        <input
                            type='number'
                            min={0}
                            step={0.01}
                            value={stopLoss}
                            onChange={event => setStopLoss(event.target.value)}
                        />
                    </label>
                </div>

                <div className='speedbot__switch-pair'>
                    <div className='speedbot__card-row'>
                        <span className='speedbot__card-label'>{localize('Alternate Even and Odd')}</span>
                        <Switch
                            label={localize('Alternate Even and Odd')}
                            checked={alternateSides}
                            onChange={setAlternateSides}
                        />
                    </div>
                    <div className='speedbot__card-row'>
                        <span className='speedbot__card-label'>{localize('Alternate on Loss')}</span>
                        <Switch
                            label={localize('Alternate on Loss')}
                            checked={alternateOnLoss}
                            onChange={setAlternateOnLoss}
                        />
                    </div>
                </div>

                <div className='speedbot__line'>
                    <span className='speedbot__line-label'>{localize('Enable Martingale')}</span>
                    <Switch label={localize('Enable Martingale')} checked={martingaleOn} onChange={setMartingaleOn} />
                </div>

                <div className='speedbot__line'>
                    <span className='speedbot__line-label speedbot__line-label--accent'>
                        {localize('Martingale Multiplier')}
                    </span>
                    <input
                        className='speedbot__number'
                        type='number'
                        min={1}
                        step={0.01}
                        value={multiplier}
                        onChange={event => setMultiplier(event.target.value)}
                        aria-label={localize('Martingale Multiplier')}
                    />
                </div>

                <div className='speedbot__line'>
                    <span className='speedbot__line-label'>{localize('Recovery Mode')}</span>
                    <Switch label={localize('Recovery Mode')} checked={recoveryMode} onChange={setRecoveryMode} />
                </div>

                <div className='speedbot__stats'>
                    <span>
                        {localize('Ticks Processed')}: {ticksProcessed}
                    </span>
                    <span>
                        {localize('Last Digit')}: {latestTick ? latestTick.digit : '—'}
                    </span>
                    <span>
                        {localize('Speed P/L')}: {profitLoss.toFixed(2)}
                    </span>
                </div>

                {status && (
                    <div className={`speedbot__status ${statusIsError ? 'speedbot__status--error' : ''}`}>{status}</div>
                )}
            </div>
        </div>
    );
};

export default Speedbot;
