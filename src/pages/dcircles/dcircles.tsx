/**
 * Dcircles.
 *
 * The digit ring on its own screen: how often each last digit has come up over
 * the chosen number of ticks, which one is leading, and what has just landed.
 * Bulk Trader and the Analysis Tool draw a small version of this beside their
 * controls; here it is the whole page, so the numbers are readable at a glance.
 *
 * Reads the shared tick stream (useTickData), so it costs no extra subscription
 * and stays in step with the market chosen anywhere else in the site.
 */
import { type CSSProperties, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import TradingBackdrop from '@/components/trading-backdrop/TradingBackdrop';
import { useTickData } from '@/hooks/useTickData';
import { localize } from '@deriv-com/translations';
import './dcircles.scss';

const TICK_CHOICES = [100, 300, 500, 1000];

const Dcircles = observer(() => {
    const {
        availableSymbols,
        selectedSymbol,
        setSelectedSymbol,
        tickLimit,
        setTickLimit,
        ticksBuffer,
        latestTick,
        lastHitNumber,
        circleData,
        isConnected,
        isLoadingTicks,
        connectionError,
    } = useTickData();

    // The most and least frequent digits, for the two readouts under the ring.
    const { hottest, coldest } = useMemo(() => {
        if (!circleData.length) return { hottest: null, coldest: null };
        const sorted = [...circleData].sort((a, b) => b.count - a.count);
        return { hottest: sorted[0], coldest: sorted[sorted.length - 1] };
    }, [circleData]);

    const recent_digits = useMemo(() => ticksBuffer.slice(-12).map(tick => tick.digit), [ticksBuffer]);

    return (
        <div className='dcircles' data-testid='dt_dcircles'>
            <TradingBackdrop />

            <div className='dcircles__inner'>
                <div className='dcircles__header'>
                    <h2 className='dcircles__title'>{localize('Dcircles')}</h2>
                    <p className='dcircles__subtitle'>
                        {localize('How often each last digit appears, over your chosen run of ticks.')}
                    </p>
                </div>

                <div className='dcircles__controls'>
                    <div className='dcircles__field'>
                        <label htmlFor='dcircles-symbol'>{localize('Market')}</label>
                        <select
                            id='dcircles-symbol'
                            value={selectedSymbol}
                            onChange={event => setSelectedSymbol(event.target.value)}
                        >
                            {availableSymbols.map(item => (
                                <option key={item.symbol} value={item.symbol}>
                                    {item.display_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className='dcircles__field'>
                        <label htmlFor='dcircles-ticks'>{localize('Ticks analysed')}</label>
                        <select
                            id='dcircles-ticks'
                            value={tickLimit}
                            onChange={event => setTickLimit(Number(event.target.value))}
                        >
                            {TICK_CHOICES.map(choice => (
                                <option key={choice} value={choice}>
                                    {choice}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className='dcircles__readout'>
                        <span className='dcircles__readout-label'>{localize('Current tick')}</span>
                        <strong className='dcircles__readout-value'>{latestTick?.quote ?? '—'}</strong>
                    </div>

                    <div className='dcircles__readout'>
                        <span className='dcircles__readout-label'>{localize('Last digit')}</span>
                        <strong className='dcircles__readout-value'>{lastHitNumber ?? '—'}</strong>
                    </div>
                </div>

                {connectionError && <div className='dcircles__notice dcircles__notice--error'>{connectionError}</div>}
                {!connectionError && (isLoadingTicks || !isConnected) && (
                    <div className='dcircles__notice'>{localize('Collecting ticks…')}</div>
                )}

                <div className='dcircles__ring'>
                    {circleData.map(datum => (
                        <div
                            key={datum.digit}
                            className={`dcircles__circle dcircles__circle--${datum.color}${
                                datum.digit === lastHitNumber ? ' dcircles__circle--hit' : ''
                            }`}
                            // The arc length is the digit's share of the run.
                            style={{ '--progress': `${datum.percentage}%` } as CSSProperties}
                        >
                            <span className='dcircles__digit'>{datum.digit}</span>
                            <span className='dcircles__percent'>{datum.percentage.toFixed(1)}%</span>
                            <span className='dcircles__count'>{datum.count}</span>
                        </div>
                    ))}
                </div>

                <div className='dcircles__summary'>
                    <div className='dcircles__summary-item'>
                        <span className='dcircles__summary-label'>{localize('Most frequent')}</span>
                        <strong>
                            {hottest ? `${hottest.digit} · ${hottest.percentage.toFixed(1)}%` : '—'}
                        </strong>
                    </div>
                    <div className='dcircles__summary-item'>
                        <span className='dcircles__summary-label'>{localize('Least frequent')}</span>
                        <strong>
                            {coldest ? `${coldest.digit} · ${coldest.percentage.toFixed(1)}%` : '—'}
                        </strong>
                    </div>
                    <div className='dcircles__summary-item'>
                        <span className='dcircles__summary-label'>{localize('Ticks collected')}</span>
                        <strong>{ticksBuffer.length}</strong>
                    </div>
                </div>

                <div className='dcircles__history'>
                    <span className='dcircles__history-label'>{localize('Latest digits')}</span>
                    <div className='dcircles__history-items'>
                        {recent_digits.length === 0 && <span className='dcircles__history-empty'>—</span>}
                        {recent_digits.map((digit, index) => (
                            <span
                                key={`${index}-${digit}`}
                                className={`dcircles__history-item${
                                    index === recent_digits.length - 1 ? ' dcircles__history-item--latest' : ''
                                }`}
                            >
                                {digit}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Dcircles;
