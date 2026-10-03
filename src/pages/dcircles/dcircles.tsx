/**
 * Dcircles.
 *
 * One card per volatility market - the 1s indices and the plain ones - each
 * showing how often every last digit has come up over the chosen run of ticks,
 * the digits that have just landed, and the three splits a digit trader reads
 * before entering: even against odd, rise against fall, and over against under.
 *
 * Every market streams at once (see use-dcircles-data), so the page is a glance
 * across the whole board rather than one market at a time.
 */
import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { localize } from '@deriv-com/translations';
import useDcirclesData, { type TMarket, type TMarketTicks } from './use-dcircles-data';
import './dcircles.scss';

const DEFAULT_TICKS = 120;
const OVER_UNDER_BARRIER = 4; // Over 4 / Under 5, as digit traders quote it.

type TStats = {
    percentages: number[];
    counts: number[];
    colours: string[];
    last_digit: number | null;
    quote: number | null;
    even: number;
    odd: number;
    rise: number;
    fall: number;
    over: number;
    under: number;
    recent: number[];
    total: number;
};

const EMPTY_STATS: TStats = {
    percentages: Array(10).fill(0),
    counts: Array(10).fill(0),
    colours: Array(10).fill('plain'),
    last_digit: null,
    quote: null,
    even: 0,
    odd: 0,
    rise: 0,
    fall: 0,
    over: 0,
    under: 0,
    recent: [],
    total: 0,
};

/** Everything a card shows, worked out from one market's ticks. */
const summarise = (data: TMarketTicks | undefined): TStats => {
    const digits = data?.digits ?? [];
    const quotes = data?.quotes ?? [];
    if (!digits.length) return EMPTY_STATS;

    const counts = Array(10).fill(0);
    digits.forEach(digit => {
        if (digit >= 0 && digit <= 9) counts[digit] += 1;
    });

    const total = digits.length;
    const percentages = counts.map(count => (count / total) * 100);

    // Highest share green, lowest red, the next two blue and orange, as the
    // reference board colours them.
    const ranked = counts
        .map((count, digit) => ({ digit, count }))
        .sort((a, b) => b.count - a.count || a.digit - b.digit);
    const colours = Array(10).fill('plain');
    ranked.forEach((entry, index) => {
        if (index === 0) colours[entry.digit] = 'green';
        else if (index === 1) colours[entry.digit] = 'blue';
        else if (index === 2) colours[entry.digit] = 'orange';
        else if (index === ranked.length - 1) colours[entry.digit] = 'red';
    });

    const even = digits.filter(digit => digit % 2 === 0).length;
    const over = digits.filter(digit => digit > OVER_UNDER_BARRIER).length;

    // Rise and fall compare each tick with the one before it.
    let rises = 0;
    let falls = 0;
    for (let i = 1; i < quotes.length; i++) {
        if (quotes[i] > quotes[i - 1]) rises += 1;
        else if (quotes[i] < quotes[i - 1]) falls += 1;
    }
    const moves = rises + falls || 1;

    return {
        percentages,
        counts,
        colours,
        last_digit: digits[digits.length - 1] ?? null,
        quote: quotes[quotes.length - 1] ?? null,
        even: (even / total) * 100,
        odd: ((total - even) / total) * 100,
        rise: (rises / moves) * 100,
        fall: (falls / moves) * 100,
        over: (over / total) * 100,
        under: ((total - over) / total) * 100,
        recent: digits.slice(-10),
        total,
    };
};

const MarketCard = ({ market, data, ticks }: { market: TMarket; data?: TMarketTicks; ticks: number }) => {
    const stats = useMemo(() => summarise(data), [data]);

    return (
        <article className='dcircles__card'>
            <header className='dcircles__card-head'>
                <div>
                    <h3 className='dcircles__market'>{market.display_name}</h3>
                    <span className='dcircles__quote'>
                        {stats.quote === null ? '—' : stats.quote.toFixed(market.pip_size)}
                    </span>
                </div>
                <span className='dcircles__badge'>
                    {localize('Last')} {Math.min(stats.total, ticks) || ticks}
                </span>
            </header>

            <div className='dcircles__ring'>
                {stats.percentages.map((percentage, digit) => (
                    <div
                        key={digit}
                        className={`dcircles__circle dcircles__circle--${stats.colours[digit]}${
                            digit === stats.last_digit ? ' dcircles__circle--hit' : ''
                        }`}
                        title={`${stats.counts[digit]} ${localize('of')} ${stats.total}`}
                    >
                        <span className='dcircles__digit'>{digit}</span>
                        <span className='dcircles__percent'>{percentage.toFixed(1)}%</span>
                    </div>
                ))}
            </div>

            <div className='dcircles__recent'>
                {stats.recent.length === 0 && <span className='dcircles__recent-empty'>—</span>}
                {stats.recent.map((digit, index) => (
                    <span
                        key={`${index}-${digit}`}
                        className={`dcircles__recent-item dcircles__recent-item--${
                            digit % 2 === 0 ? 'even' : 'odd'
                        }`}
                    >
                        {digit}
                    </span>
                ))}
            </div>

            <div className='dcircles__splits'>
                <Split
                    left_label={localize('Even')}
                    right_label={localize('Odd')}
                    left={stats.even}
                    right={stats.odd}
                />
                <Split
                    left_label={localize('Rise')}
                    right_label={localize('Fall')}
                    left={stats.rise}
                    right={stats.fall}
                />
                <Split
                    left_label={`${localize('Over')} ${OVER_UNDER_BARRIER}`}
                    right_label={`${localize('Under')} ${OVER_UNDER_BARRIER + 1}`}
                    left={stats.over}
                    right={stats.under}
                />
            </div>
        </article>
    );
};

/** One split bar: the left share green, the right red, sized by percentage. */
const Split = ({
    left_label,
    right_label,
    left,
    right,
}: {
    left_label: string;
    right_label: string;
    left: number;
    right: number;
}) => (
    <div className='dcircles__split'>
        <div className='dcircles__split-side dcircles__split-side--left' style={{ flexGrow: Math.max(left, 1) }}>
            {left_label}: {left.toFixed(1)}%
        </div>
        <div className='dcircles__split-side dcircles__split-side--right' style={{ flexGrow: Math.max(right, 1) }}>
            {right_label}: {right.toFixed(1)}%
        </div>
    </div>
);

const Dcircles = observer(() => {
    const [ticks, setTicks] = useState(DEFAULT_TICKS);
    const { markets, ticks: market_ticks, error, is_loading } = useDcirclesData(ticks);

    return (
        <div className='dcircles' data-testid='dt_dcircles'>
            {/* The same light-blue bar the Analysis Tool heads its Circles with. */}
            <div className='dcircles__mode'>{localize('Dcircles')}</div>

            <div className='dcircles__toolbar'>
                <h2 className='dcircles__title'>
                    {localize('Dcircles')}{' '}
                    <span className='dcircles__title-note'>
                        ({localize('last')} {ticks} {localize('ticks')})
                    </span>
                </h2>

                <label className='dcircles__ticks' htmlFor='dcircles-ticks'>
                    {localize('Ticks')}
                    <input
                        id='dcircles-ticks'
                        type='number'
                        min={10}
                        max={1000}
                        step={10}
                        value={ticks}
                        onChange={event => {
                            const next = Number(event.target.value);
                            if (Number.isFinite(next)) setTicks(Math.max(10, Math.min(1000, Math.trunc(next))));
                        }}
                    />
                </label>
            </div>

            {error && <div className='dcircles__notice dcircles__notice--error'>{error}</div>}
            {!error && is_loading && <div className='dcircles__notice'>{localize('Loading markets…')}</div>}

            <div className='dcircles__grid'>
                {markets.map(market => (
                    <MarketCard key={market.symbol} market={market} data={market_ticks[market.symbol]} ticks={ticks} />
                ))}
            </div>
        </div>
    );
});

export default Dcircles;
