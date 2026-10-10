/**
 * Live prices for the trade panel, the way Deriv's own trader gets them: a
 * subscribed `proposal` per side, re-quoted as the market moves.
 *
 * The percentages on the buttons are payout over stake, less the stake - with
 * a stake of 100 and a payout of 181.82 that is the 81.82% Deriv shows. The
 * payout and ask price come back as strings on this API, so everything is read
 * through Number().
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import type { TTradeType } from './trade-types';
import useConnection, { currentConnection, type TConnection } from './use-connection';

// Every market quoted here ticks at least every two seconds, so a stream that
// has said nothing for this long has stopped, whatever the socket says.
const STALE_AFTER_MS = 10000;

export type TProposalPrice = {
    /** Proposal id, which is what a buy is placed against. */
    id: string | null;
    payout: number | null;
    ask_price: number | null;
    /** payout / stake - 1, as a percentage. */
    percentage: number | null;
    /** Multipliers: the commission Deriv charges on the stake. */
    commission: number | null;
    /** Multipliers: the price at which the contract closes itself. */
    stop_out: number | null;
    /** Accumulators: the most the contract can pay. */
    max_payout: number | null;
    /** Accumulators: how many ticks it can run for. */
    max_ticks: number | null;
    /** Accumulators: half-width of the barrier band around the spot. */
    barrier_spot_distance: number | null;
    /** Accumulators: the band itself, recalculated on every tick. */
    high_barrier: number | null;
    low_barrier: number | null;
    /** Accumulators: the tick the band was measured from, where Deriv starts drawing it. */
    spot_time: number | null;
    /** Accumulators: how long the spot stayed inside the band, run by run. */
    ticks_stayed_in: number[];
    error: string | null;
};

const EMPTY: TProposalPrice = {
    id: null,
    payout: null,
    ask_price: null,
    percentage: null,
    commission: null,
    stop_out: null,
    max_payout: null,
    max_ticks: null,
    barrier_spot_distance: null,
    high_barrier: null,
    low_barrier: null,
    spot_time: null,
    ticks_stayed_in: [],
    error: null,
};

export type TProposalInputs = {
    symbol: string;
    currency: string;
    /** The amount is read as a stake or as a payout, as the switch is set. */
    basis: 'stake' | 'payout';
    stake: number;
    /** Ticks, for the types that take a duration. */
    duration: number;
    /** 0-9, for matches/differs and over/under. */
    digit: number;
    /** Accumulators, e.g. 0.03 for 3%. */
    growth_rate: number;
    /** Multipliers, e.g. 400. */
    multiplier: number;
    /** Higher/Lower and Touch, e.g. '+0.484'. */
    barrier_offset: string;
    take_profit: number | null;
    stop_loss: number | null;
    deal_cancellation: boolean;
};

/**
 * Deriv's own words for why it refused something.
 *
 * The socket rejects with the response object - `{ error: { code, message } }`
 * - not with an Error, so `instanceof Error` never matched and every refusal
 * read as a bare fallback. This looks in each place the message can be.
 */
export const readApiError = (problem: unknown, fallback: string): string => {
    const value = problem as any;
    return (
        value?.error?.message ||
        value?.error?.message_to_client ||
        value?.message ||
        (typeof value?.error === 'string' ? value.error : '') ||
        value?.error?.code ||
        fallback
    );
};

const num = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/** Reads a value from the first of several plausible paths. */
const pick = (source: any, paths: string[][]): number | null => {
    for (const path of paths) {
        let cursor: any = source;
        for (const key of path) cursor = cursor?.[key];
        const value = num(cursor);
        if (value !== null) return value;
    }
    return null;
};

/** The proposal request for one side of a trade type. */
export const buildProposalRequest = (
    trade_type: TTradeType,
    contract_type: string,
    inputs: TProposalInputs
): Record<string, unknown> => {
    const request: Record<string, unknown> = {
        proposal: 1,
        subscribe: 1,
        amount: inputs.stake,
        // Accumulators and multipliers are staked; only the options types can
        // be quoted the other way round, from a payout.
        basis: trade_type.fields.includes('basis_toggle') ? inputs.basis : 'stake',
        contract_type,
        currency: inputs.currency,
        // Renamed from `symbol` on this version of the API.
        underlying_symbol: inputs.symbol,
    };

    if (trade_type.fields.includes('duration')) {
        request.duration = inputs.duration;
        request.duration_unit = 't';
    }

    if (trade_type.id === 'matches_differs' || trade_type.id === 'over_under') {
        request.barrier = String(inputs.digit);
    }

    if (trade_type.fields.includes('barrier_offset') && inputs.barrier_offset) {
        request.barrier = inputs.barrier_offset;
    }

    if (trade_type.fields.includes('growth_rate')) {
        request.growth_rate = inputs.growth_rate;
    }

    if (trade_type.fields.includes('multiplier')) {
        request.multiplier = inputs.multiplier;
    }

    const limit_order: Record<string, number> = {};
    if (trade_type.fields.includes('take_profit') && inputs.take_profit) {
        limit_order.take_profit = inputs.take_profit;
    }
    if (trade_type.fields.includes('stop_loss') && inputs.stop_loss) {
        limit_order.stop_loss = inputs.stop_loss;
    }
    if (Object.keys(limit_order).length) request.limit_order = limit_order;

    if (trade_type.fields.includes('deal_cancellation') && inputs.deal_cancellation) {
        request.cancellation = '60m';
    }

    return request;
};

export const readProposal = (proposal: any, stake: number): TProposalPrice => {
    const payout = num(proposal?.payout);
    const ask_price = num(proposal?.ask_price);
    // What the contract returns over what it costs. Quoting from a payout
    // instead of a stake makes the cost the ask price rather than the amount
    // typed in, so the price paid is always the denominator.
    const paid = ask_price ?? (stake > 0 ? stake : null);

    return {
        id: proposal?.id ? String(proposal.id) : null,
        payout,
        ask_price,
        percentage: payout !== null && paid ? (payout / paid - 1) * 100 : null,
        // Paths as @deriv/api-types documents the proposal response.
        commission: pick(proposal, [['commission']]),
        stop_out: pick(proposal, [
            ['limit_order', 'stop_out', 'display_order_amount'],
            ['limit_order', 'stop_out', 'order_amount'],
        ]),
        max_payout: pick(proposal, [['contract_details', 'maximum_payout']]),
        max_ticks: pick(proposal, [['contract_details', 'maximum_ticks']]),
        barrier_spot_distance: pick(proposal, [
            ['contract_details', 'barrier_spot_distance'],
            ['barrier_spot_distance'],
        ]),
        high_barrier: pick(proposal, [['contract_details', 'high_barrier']]),
        low_barrier: pick(proposal, [['contract_details', 'low_barrier']]),
        spot_time: pick(proposal, [['spot_time'], ['contract_details', 'last_tick_epoch']]),
        ticks_stayed_in: Array.isArray(proposal?.contract_details?.ticks_stayed_in)
            ? proposal.contract_details.ticks_stayed_in.map(Number)
            : [],
        error: null,
    };
};

/**
 * Subscribe a proposal for each side of the chosen trade type.
 *
 * Returns one price per side, in the trade type's own order, so the buttons
 * can be labelled and the buy placed against the quoted id.
 */
export const useProposal = (trade_type: TTradeType, inputs: TProposalInputs, enabled: boolean) => {
    const [prices, setPrices] = useState<TProposalPrice[]>([EMPTY, EMPTY]);
    const [is_loading, setIsLoading] = useState(false);

    const subscriptions = useRef<string[]>([]);
    const listener = useRef<((evt: MessageEvent) => void) | null>(null);
    const by_subscription = useRef<Record<string, number>>({});
    const stake_ref = useRef(inputs.stake);
    stake_ref.current = inputs.stake;
    // The socket the listener is on, which is not necessarily the app's
    // current one once it has reconnected.
    const listening_on = useRef<TConnection | null>(null);
    const last_frame = useRef(0);

    const connection = useConnection();
    const [retry, setRetry] = useState(0);

    const teardown = useCallback(() => {
        // Forgotten only on the socket they were made on; a new socket never
        // had them, and a closed one has already dropped them.
        if (listening_on.current && listening_on.current === currentConnection()) {
            subscriptions.current.forEach(id => {
                Promise.resolve(api_base.api?.send({ forget: id })).catch(() => undefined);
            });
        }
        subscriptions.current = [];
        by_subscription.current = {};
        if (listener.current) {
            listening_on.current?.removeEventListener('message', listener.current);
            listener.current = null;
        }
        listening_on.current = null;
    }, []);

    // Re-subscribes a stream that has gone quiet.
    useEffect(() => {
        if (!enabled) return undefined;
        const check = () => {
            if (subscriptions.current.length && Date.now() - last_frame.current > STALE_AFTER_MS) {
                setRetry(value => value + 1);
            }
        };
        const timer = window.setInterval(check, STALE_AFTER_MS / 2);
        const onVisible = () => {
            if (document.visibilityState === 'visible') check();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [enabled]);

    // One key for everything a quote depends on, so the proposals are replaced
    // when - and only when - something about the trade actually changed.
    const key = JSON.stringify([
        trade_type.id,
        inputs.symbol,
        inputs.currency,
        inputs.stake,
        inputs.duration,
        inputs.digit,
        inputs.growth_rate,
        inputs.multiplier,
        inputs.barrier_offset,
        inputs.take_profit,
        inputs.stop_loss,
        inputs.deal_cancellation,
        enabled,
        connection,
        retry,
    ]);

    useEffect(() => {
        let cancelled = false;
        teardown();

        if (!enabled || !inputs.symbol || !trade_type.tradable || !(inputs.stake > 0)) {
            setPrices([EMPTY, EMPTY]);
            return () => {
                cancelled = true;
            };
        }

        setIsLoading(true);

        // Updates arrive as their own frames, tagged with the subscription id
        // the first response reported.
        const onMessage = (evt: MessageEvent) => {
            try {
                const data = JSON.parse(evt.data as string);
                if (data?.msg_type !== 'proposal') return;
                const id = data?.subscription?.id;
                const index = id ? by_subscription.current[id] : undefined;
                if (index === undefined) return;
                last_frame.current = Date.now();

                setPrices(previous => {
                    const next = [...previous];
                    next[index] = data.error
                        ? { ...EMPTY, error: readApiError(data, 'No price') }
                        : readProposal(data.proposal, stake_ref.current);
                    return next;
                });
            } catch {
                /* a frame we do not care about */
            }
        };

        listener.current = onMessage;
        listening_on.current = currentConnection();
        listening_on.current?.addEventListener('message', onMessage);
        last_frame.current = Date.now();

        const sides = trade_type.sides.filter(Boolean) as { label: string; contract_type: string }[];

        void Promise.all(
            sides.map(async (side, index) => {
                try {
                    const response: any = await api_base.api?.send(
                        buildProposalRequest(trade_type, side.contract_type, inputs)
                    );
                    if (cancelled) return;

                    if (response?.error) {
                        setPrices(previous => {
                            const next = [...previous];
                            next[index] = { ...EMPTY, error: readApiError(response, 'No price') };
                            return next;
                        });
                        return;
                    }

                    const subscription_id = response?.subscription?.id;
                    if (subscription_id) {
                        subscriptions.current.push(String(subscription_id));
                        by_subscription.current[String(subscription_id)] = index;
                    }
                    last_frame.current = Date.now();

                    setPrices(previous => {
                        const next = [...previous];
                        next[index] = readProposal(response?.proposal, stake_ref.current);
                        return next;
                    });
                } catch (error) {
                    if (cancelled) return;
                    setPrices(previous => {
                        const next = [...previous];
                        next[index] = { ...EMPTY, error: readApiError(error, 'No price') };
                        return next;
                    });
                }
            })
        ).finally(() => {
            if (!cancelled) setIsLoading(false);
        });

        return () => {
            cancelled = true;
            teardown();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { prices, is_loading };
};

export default useProposal;
