/**
 * AI Scanner for the Bulk Trader.
 *
 * Scans the markets the Bulk Trader can trade, for the digit contracts it
 * places (Even/Odd, Over/Under, Matches/Differs), on real Deriv tick history,
 * and shows the measured result with the same stat cards as the main AI
 * scanner. "Apply to Bulk Trader" sets the market, trade type and prediction
 * and marks the scanned side's button. It never buys: stake, number of trades
 * and the final click stay with the trader.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LegacyClose1pxIcon } from '@deriv/quill-icons/Legacy';
import { localize } from '@deriv-com/translations';

import ScanResult from '@/components/scan-result/ScanResult';
import {
    pickBest,
    scanMarkets,
    TScanProgress,
    TScanResult,
    TScanRow,
    TStrategyEvaluation,
    TStrategyFamily,
} from '@/utils/analysis';

import '@/components/ai-entry-scanner/entry-scanner.scss';
import './bulk-scanner.scss';

export type TBulkTradeType = 'even_odd' | 'over_under' | 'matches_differs';

/** What the scan hands back to the Bulk Trader. */
export type TBulkScanPick = {
    symbol: string;
    display_name: string;
    trade_type: TBulkTradeType;
    /** Over/Under and Matches/Differs barrier; null for Even/Odd. */
    prediction: number | null;
    contract_type: 'DIGITEVEN' | 'DIGITODD' | 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF';
    evaluation: TStrategyEvaluation;
};

type TFamilyFilter = 'all' | 'evenodd' | 'overunder' | 'matchesdiffers';

const FAMILY_OPTIONS: { value: TFamilyFilter; label: string }[] = [
    { value: 'all', label: localize('All digit types') },
    { value: 'evenodd', label: localize('Even / Odd') },
    { value: 'overunder', label: localize('Over / Under') },
    { value: 'matchesdiffers', label: localize('Matches / Differs') },
];

const BULK_FAMILIES: TStrategyFamily[] = ['evenodd', 'overunder', 'matchesdiffers'];
const TRADE_TYPE_OF: Record<string, TBulkTradeType> = {
    evenodd: 'even_odd',
    overunder: 'over_under',
    matchesdiffers: 'matches_differs',
};

const MIN_TICKS = 100;
const MAX_TICKS = 5000;
const LEADERBOARD_SIZE = 5;

const topOf = (row: TScanRow | null): TStrategyEvaluation | null => row?.best ?? row?.evaluations[0] ?? null;

type TProps = {
    isOpen: boolean;
    onClose: () => void;
    /** Markets the Bulk Trader offers; the scan keeps to these. */
    symbols: string[];
    /** Starting depth, from the Bulk Trader's ticks field. */
    initialTicks: number;
    /** Starting filter, from the Bulk Trader's trade type. */
    initialTradeType: TBulkTradeType;
    onApply: (pick: TBulkScanPick) => void;
};

const BulkScanner: React.FC<TProps> = ({ isOpen, onClose, symbols, initialTicks, initialTradeType, onApply }) => {
    const [ticks_input, setTicksInput] = useState(String(initialTicks));
    const [family, setFamily] = useState<TFamilyFilter>('all');
    const [is_scanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState<TScanProgress | null>(null);
    const [result, setResult] = useState<TScanResult | null>(null);
    const [selected_symbol, setSelectedSymbol] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const cancellation_ref = useRef<{ cancelled: boolean }>({ cancelled: false });
    const is_mounted_ref = useRef(true);

    useEffect(() => {
        is_mounted_ref.current = true;
        return () => {
            is_mounted_ref.current = false;
            cancellation_ref.current.cancelled = true;
        };
    }, []);

    // Each opening starts from the Bulk Trader's current settings.
    useEffect(() => {
        if (!isOpen) return;
        setTicksInput(String(Math.max(MIN_TICKS, Math.min(MAX_TICKS, initialTicks))));
        const by_type: Record<TBulkTradeType, TFamilyFilter> = {
            even_odd: 'evenodd',
            over_under: 'overunder',
            matches_differs: 'matchesdiffers',
        };
        setFamily(current => (result ? current : by_type[initialTradeType]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const ranked = useMemo(
        () =>
            [...(result?.rows ?? [])]
                .filter(row => topOf(row))
                .sort((a, b) => (topOf(b)?.score ?? -Infinity) - (topOf(a)?.score ?? -Infinity)),
        [result]
    );
    const best = useMemo(() => (result ? (pickBest(result) ?? ranked[0] ?? null) : null), [result, ranked]);
    const selected = useMemo(() => {
        if (!result) return null;
        if (selected_symbol) return result.rows.find(row => row.symbol === selected_symbol) ?? best;
        return best;
    }, [best, result, selected_symbol]);
    const selected_evaluation = topOf(selected);
    const leaderboard = useMemo(() => ranked.slice(0, LEADERBOARD_SIZE), [ranked]);

    const runScan = useCallback(async () => {
        const ticks = Math.max(MIN_TICKS, Math.min(MAX_TICKS, parseInt(ticks_input, 10) || initialTicks));
        setTicksInput(String(ticks));

        cancellation_ref.current.cancelled = true;
        const cancellation = { cancelled: false };
        cancellation_ref.current = cancellation;

        setIsScanning(true);
        setError(null);
        setResult(null);
        setSelectedSymbol(null);
        setProgress(null);

        try {
            const scan = await scanMarkets({
                ticks,
                scope: 'volatility',
                symbols: symbols.length ? symbols : undefined,
                families: family === 'all' ? BULK_FAMILIES : [family],
                cancellation,
                onProgress: next => {
                    if (!cancellation.cancelled && is_mounted_ref.current) setProgress(next);
                },
            });
            if (cancellation.cancelled || !is_mounted_ref.current) return;
            setResult(scan);
            if (!scan.rows.length) {
                setError(scan.failures[0]?.reason ?? localize('Deriv returned no analysable markets. Please try again.'));
            }
        } catch (err) {
            if (cancellation.cancelled || !is_mounted_ref.current) return;
            setError(err instanceof Error ? err.message : localize('Scan failed.'));
        } finally {
            if (is_mounted_ref.current && !cancellation.cancelled) setIsScanning(false);
        }
    }, [family, initialTicks, symbols, ticks_input]);

    const apply = useCallback(() => {
        if (!selected || !selected_evaluation) return;
        const { definition } = selected_evaluation;
        const trade_type = TRADE_TYPE_OF[definition.family];
        if (!trade_type) return;
        onApply({
            symbol: selected.symbol,
            display_name: selected.display_name,
            trade_type,
            prediction: definition.barrier,
            contract_type: definition.contract_type as TBulkScanPick['contract_type'],
            evaluation: selected_evaluation,
        });
        onClose();
    }, [onApply, onClose, selected, selected_evaluation]);

    const cancelAndClose = useCallback(() => {
        cancellation_ref.current.cancelled = true;
        setIsScanning(false);
        onClose();
    }, [onClose]);

    if (!isOpen) return null;

    const ticks_value = Math.max(MIN_TICKS, Math.min(MAX_TICKS, parseInt(ticks_input, 10) || initialTicks));
    const mode_label = FAMILY_OPTIONS.find(option => option.value === family)?.label ?? '';

    return (
        <div className='ai-entry-scanner__overlay' onClick={cancelAndClose}>
            <div
                className='ai-entry-scanner__modal bulk-scanner'
                onClick={event => event.stopPropagation()}
                role='dialog'
                aria-modal='true'
            >
                <div className='ai-entry-scanner__header'>
                    <h2 className='ai-entry-scanner__title'>{localize('Bulk Trader Scanner')}</h2>
                    <button
                        type='button'
                        className='ai-entry-scanner__close'
                        onClick={cancelAndClose}
                        aria-label={localize('Close scanner')}
                    >
                        <LegacyClose1pxIcon width='22px' height='22px' />
                    </button>
                </div>

                <div className='ai-entry-scanner__body'>
                    <div className='ai-entry-scanner__hero'>
                        <span className='ai-entry-scanner__badge'>✦ {localize('Live tick analysis')}</span>
                        <h3 className='ai-entry-scanner__hero-title'>{localize('Digit Market Scanner')}</h3>
                        <p className='ai-entry-scanner__hero-text'>
                            {localize(
                                'Measures Even/Odd, Over/Under and Matches/Differs on every Bulk Trader market against real Deriv ticks, and its fair odds.'
                            )}
                        </p>
                        <span
                            className={`ai-entry-scanner__radar${is_scanning ? ' ai-entry-scanner__radar--on' : ''}`}
                            aria-hidden='true'
                        />
                    </div>

                    <div className='ai-entry-scanner__chips bulk-scanner__chips' role='tablist'>
                        {FAMILY_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                type='button'
                                role='tab'
                                aria-selected={family === option.value}
                                className={`ai-entry-scanner__chip${
                                    family === option.value ? ' ai-entry-scanner__chip--active' : ''
                                }`}
                                onClick={() => setFamily(option.value)}
                                disabled={is_scanning}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div className='ai-entry-scanner__config'>
                        <label className='ai-entry-scanner__config-card'>
                            <span className='ai-entry-scanner__config-label'>
                                {localize('Scan depth ({{min}}-{{max}})', { min: MIN_TICKS, max: MAX_TICKS })}
                            </span>
                            <input
                                type='number'
                                className='ai-entry-scanner__config-input'
                                min={MIN_TICKS}
                                max={MAX_TICKS}
                                step={100}
                                value={ticks_input}
                                disabled={is_scanning}
                                onChange={event => setTicksInput(event.target.value)}
                                onKeyDown={event => {
                                    if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                                }}
                            />
                        </label>
                        <div className='ai-entry-scanner__config-card'>
                            <span className='ai-entry-scanner__config-label'>{localize('Mode')}</span>
                            <span className='ai-entry-scanner__config-value'>{mode_label}</span>
                        </div>
                        <div className='ai-entry-scanner__config-card'>
                            <span className='ai-entry-scanner__config-label'>{localize('Ticks per market')}</span>
                            <span className='ai-entry-scanner__config-value'>{ticks_value}</span>
                        </div>
                    </div>

                    {(is_scanning || (progress && !result)) && (
                        <div className='ai-entry-scanner__progress-box'>
                            <div className='ai-entry-scanner__progress-row'>
                                <span className='ai-entry-scanner__progress-label'>
                                    {progress?.current_display_name
                                        ? localize('Analysing {{market}}...', { market: progress.current_display_name })
                                        : localize('Loading Deriv markets...')}
                                </span>
                                {progress && (
                                    <span className='ai-entry-scanner__progress-count'>
                                        {progress.completed}/{progress.total}
                                    </span>
                                )}
                            </div>
                            <div className='ai-entry-scanner__progress-track'>
                                <div
                                    className='ai-entry-scanner__progress-fill'
                                    style={{
                                        width: progress?.total ? `${(progress.completed / progress.total) * 100}%` : '6%',
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {error && <div className='ai-entry-scanner__status ai-entry-scanner__status--error'>{error}</div>}

                    {!result && !is_scanning && !error && (
                        <p className='bulk-scanner__hint'>
                            {localize('Press Scan Markets to measure every Bulk Trader market on live Deriv data.')}
                        </p>
                    )}

                    {!is_scanning && selected && selected_evaluation && (
                        <ScanResult market={`${selected.display_name} (${selected.symbol})`} evaluation={selected_evaluation} />
                    )}

                    {!is_scanning && leaderboard.length > 1 && (
                        <div className='ai-entry-scanner__leaderboard'>
                            <span className='ai-entry-scanner__label'>{localize('Markets ranked')}</span>
                            {leaderboard.map(row => {
                                const top = topOf(row);
                                return (
                                    <button
                                        key={row.symbol}
                                        type='button'
                                        className={`ai-entry-scanner__rank${
                                            row.symbol === selected?.symbol ? ' ai-entry-scanner__rank--active' : ''
                                        }`}
                                        onClick={() => setSelectedSymbol(row.symbol)}
                                    >
                                        <span className='ai-entry-scanner__rank-market'>{row.display_name}</span>
                                        <span className='ai-entry-scanner__rank-strategy'>{top?.definition.label}</span>
                                        <span
                                            className={`ai-entry-scanner__rank-edge${
                                                (top?.edge ?? 0) > 0 ? ' ai-entry-scanner__rank-edge--good' : ''
                                            }`}
                                        >
                                            {top?.win_rate.toFixed(1)}% / {localize('fair')} {top?.baseline.toFixed(0)}%
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className='ai-entry-scanner__footer'>
                    <button
                        type='button'
                        className='ai-entry-scanner__btn ai-entry-scanner__btn--primary'
                        onClick={apply}
                        disabled={!selected_evaluation || is_scanning}
                    >
                        {selected_evaluation
                            ? localize('Apply {{label}} to Bulk Trader', { label: selected_evaluation.definition.label })
                            : localize('Apply to Bulk Trader')}
                    </button>
                    <button
                        type='button'
                        className='ai-entry-scanner__btn ai-entry-scanner__btn--secondary'
                        onClick={runScan}
                        disabled={is_scanning}
                    >
                        {is_scanning ? localize('Scanning...') : result ? localize('Rescan') : localize('Scan Markets')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkScanner;
