/**
 * Open positions, as Deriv's trader shows them: the contracts still running,
 * each with what it is worth now, and a way to close it early.
 *
 * The list is seeded from `portfolio` and then kept live from a subscribed
 * `proposal_open_contract`, which is how the platform itself follows them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { localize } from '@deriv-com/translations';
import useConnection, { currentConnection, type TConnection } from './use-connection';

type TPosition = {
    contract_id: string;
    label: string;
    market: string;
    buy_price: number;
    profit: number;
    is_sellable: boolean;
};

const num = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const OpenPositions = ({ currency }: { currency: string }) => {
    const [positions, setPositions] = useState<Record<string, TPosition>>({});
    const [is_collapsed, setIsCollapsed] = useState(false);
    const [selling, setSelling] = useState<string | null>(null);

    const subscription_id = useRef<string | null>(null);
    const listener = useRef<((evt: MessageEvent) => void) | null>(null);
    const listening_on = useRef<TConnection | null>(null);
    // Subscribes again whenever the app moves to a new socket.
    const connection = useConnection();

    useEffect(() => {
        let cancelled = false;

        const onMessage = (evt: MessageEvent) => {
            try {
                const data = JSON.parse(evt.data as string);
                if (data?.msg_type !== 'proposal_open_contract' || data?.error) return;

                const contract = data.proposal_open_contract;
                const id = String(contract?.contract_id ?? '');
                if (!id) return;

                setPositions(previous => {
                    // A contract that has closed is no longer an open position.
                    if (contract.is_sold) {
                        if (!previous[id]) return previous;
                        const next = { ...previous };
                        delete next[id];
                        return next;
                    }

                    return {
                        ...previous,
                        [id]: {
                            contract_id: id,
                            label: contract.display_name || contract.contract_type || localize('Contract'),
                            market: contract.underlying_symbol_name || contract.underlying_symbol || '',
                            buy_price: num(contract.buy_price),
                            profit: num(contract.profit),
                            is_sellable: contract.is_valid_to_sell === 1 || contract.is_valid_to_sell === true,
                        },
                    };
                });
            } catch {
                /* a frame we do not care about */
            }
        };

        listener.current = onMessage;
        listening_on.current = currentConnection();
        listening_on.current?.addEventListener('message', onMessage);

        (async () => {
            try {
                const stream: any = await api_base.api?.send({ proposal_open_contract: 1, subscribe: 1 });
                if (cancelled) return;
                if (stream?.subscription?.id) subscription_id.current = String(stream.subscription.id);
            } catch {
                /* without the stream the panel simply stays empty */
            }
        })();

        return () => {
            cancelled = true;
            // Forgotten only on the socket it was made on; a closed one has
            // already dropped it.
            if (subscription_id.current && listening_on.current === currentConnection()) {
                const id = subscription_id.current;
                Promise.resolve(api_base.api?.send({ forget: id })).catch(() => undefined);
            }
            subscription_id.current = null;
            if (listener.current) {
                listening_on.current?.removeEventListener('message', listener.current);
                listener.current = null;
            }
            listening_on.current = null;
        };
    }, [connection]);

    const sell = useCallback(async (contract_id: string) => {
        setSelling(contract_id);
        try {
            // price 0 sells at the going rate, which is what the platform's own
            // close button does.
            await api_base.api?.send({ sell: contract_id, price: 0 });
        } catch {
            /* the position stays listed; the user can try again */
        } finally {
            setSelling(null);
        }
    }, []);

    const list = Object.values(positions);

    return (
        <section className='mt-positions'>
            <header className='mt-positions__head'>
                <h3 className='mt-positions__title'>{localize('Open positions')}</h3>
                <button
                    type='button'
                    className='mt-positions__collapse'
                    onClick={() => setIsCollapsed(open => !open)}
                    aria-label={is_collapsed ? localize('Expand') : localize('Collapse')}
                >
                    {is_collapsed ? '+' : '—'}
                </button>
            </header>

            {!is_collapsed && (
                <div className='mt-positions__body'>
                    {list.length === 0 ? (
                        <div className='mt-positions__empty'>
                            <span className='mt-positions__empty-icon' aria-hidden='true'>
                                <svg width='46' height='46' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5'>
                                    <rect x='2.5' y='7' width='19' height='12.5' rx='2.5' />
                                    <path d='M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7' />
                                    <path d='M2.5 12h19' />
                                </svg>
                            </span>
                            <p className='mt-positions__empty-text'>{localize('You have no open positions.')}</p>
                        </div>
                    ) : (
                        <ul className='mt-positions__list'>
                            {list.map(position => (
                                <li key={position.contract_id} className='mt-positions__item'>
                                    <div className='mt-positions__item-head'>
                                        <span className='mt-positions__item-label'>{position.label}</span>
                                        <span
                                            className={`mt-positions__item-profit ${
                                                position.profit >= 0
                                                    ? 'mt-positions__item-profit--up'
                                                    : 'mt-positions__item-profit--down'
                                            }`}
                                        >
                                            {position.profit >= 0 ? '+' : ''}
                                            {position.profit.toFixed(2)} {currency}
                                        </span>
                                    </div>
                                    <div className='mt-positions__item-meta'>
                                        <span>{position.market}</span>
                                        <span>
                                            {localize('Stake')} {position.buy_price.toFixed(2)}
                                        </span>
                                    </div>
                                    <button
                                        type='button'
                                        className='mt-positions__sell'
                                        onClick={() => sell(position.contract_id)}
                                        disabled={!position.is_sellable || selling === position.contract_id}
                                    >
                                        {selling === position.contract_id ? localize('Closing…') : localize('Close')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
};

export default OpenPositions;
