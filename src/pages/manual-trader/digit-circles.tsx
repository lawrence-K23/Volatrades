/**
 * The last-digit circles Deriv's trader shows along the foot of the chart for
 * the digit trade types: one ring per digit with its share of the last 1000
 * ticks, the most frequent ringed in teal, the least in red, and a pointer
 * under the digit that has just landed.
 *
 * The chart's own last-digit stats draw bars, not these, which is why they
 * are drawn here instead.
 */
import { useMemo } from 'react';
import useLiveTicks from '@/hooks/useLiveTicks';
import { digitStats } from '@/utils/analysis';

const WINDOW = 1000;
const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// The lower part of the ring, where Deriv draws its highlight.
const ARC = CIRCUMFERENCE * 0.42;

const DigitCircles = ({ symbol }: { symbol: string }) => {
    const { digits, last_digit } = useLiveTicks(symbol || null, WINDOW);

    const stats = useMemo(() => digitStats(digits), [digits]);

    const { highest, lowest } = useMemo(() => {
        if (!digits.length) return { highest: -1, lowest: -1 };
        const sorted = [...stats].sort((a, b) => a.count - b.count);
        return { lowest: sorted[0].digit, highest: sorted[sorted.length - 1].digit };
    }, [digits.length, stats]);

    if (!digits.length) return null;

    return (
        <div className='mt-digits' aria-label='Last digit statistics'>
            {stats.map(({ digit, percentage }) => {
                const tone = digit === highest ? 'up' : digit === lowest ? 'down' : null;
                const is_last = digit === last_digit;

                return (
                    <div key={digit} className={`mt-digits__item ${is_last ? 'mt-digits__item--last' : ''}`}>
                        <div className='mt-digits__circle'>
                            <svg viewBox='0 0 44 44' className='mt-digits__ring' aria-hidden='true'>
                                <circle cx='22' cy='22' r={RADIUS} className='mt-digits__track' />
                                {tone && (
                                    <circle
                                        cx='22'
                                        cy='22'
                                        r={RADIUS}
                                        className={`mt-digits__arc mt-digits__arc--${tone}`}
                                        strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
                                        // Start the arc on the lower left and sweep under the digit.
                                        transform='rotate(30 22 22)'
                                    />
                                )}
                            </svg>
                            <span className='mt-digits__value'>
                                <b>{digit}</b>
                                <small>{percentage.toFixed(1)}%</small>
                            </span>
                        </div>
                        {is_last && <span className='mt-digits__pointer' aria-hidden='true' />}
                    </div>
                );
            })}
        </div>
    );
};

export default DigitCircles;
