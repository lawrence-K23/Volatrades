import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LegacyClose1pxIcon } from '@deriv/quill-icons/Legacy';
import { localize } from '@deriv-com/translations';

import { useStore } from '@/hooks/useStore';
import {
    loadStrategyIntoBot,
    pickBest,
    scanMarkets,
    TScanProgress,
    TScanResult,
    TScanRow,
    TStoreLike,
    TStrategyEvaluation,
    TStrategyFamily,
} from '@/utils/analysis';
import ScanResult from '@/components/scan-result/ScanResult';

import ScannerParametersModal, { TScannerParams } from './ScannerParametersModal';
import './entry-scanner.scss';

const DEFAULT_TICKS = 500;
const MIN_TICKS = 100;
const MAX_TICKS = 5000;
const LEADERBOARD_SIZE = 5;
const PREFS_KEY = 'ai-scanner-prefs';

type TFamilyFilter = 'all' | TStrategyFamily;

const FAMILY_OPTIONS: { value: TFamilyFilter; label: string }[] = [
    { value: 'all', label: localize('All contracts') },
    { value: 'overunder', label: localize('Over / Under') },
    { value: 'matchesdiffers', label: localize('Matches / Differs') },
    { value: 'evenodd', label: localize('Even / Odd') },
    { value: 'callput', label: localize('Rise / Fall') },
];

/** The setup a row reports: its best positive-edge one, else its top-ranked one. */
const topOf = (row: TScanRow | null): TStrategyEvaluation | null => row?.best ?? row?.evaluations[0] ?? null;

type TProps = {
    isOpen: boolean;
    onClose: () => void;
};


/**
 * AI Scanner.
 *
 * Nothing about the answer is written in advance: the market list comes from
 * `active_symbols`, the playable contracts from `contracts_for`, and the
 * ranking from measured win rates on real `ticks_history` data.
 */
const EntryScannerModal: React.FC<TProps> = ({ isOpen, onClose }) => {
    const store = useStore();
    const [ticks_input, setTicksInput] = useState(String(DEFAULT_TICKS));
    const [family, setFamily] = useState<TFamilyFilter>('all');
    const [is_scanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState<TScanProgress | null>(null);
    const [result, setResult] = useState<TScanResult | null>(null);
    const [selected_symbol, setSelectedSymbol] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [show_params, setShowParams] = useState(false);
    const [is_loading_bot, setIsLoadingBot] = useState(false);

    const cancellation_ref = useRef<{ cancelled: boolean }>({ cancelled: false });
    const is_mounted_ref = useRef(true);

    useEffect(() => {
        is_mounted_ref.current = true;
        return () => {
            is_mounted_ref.current = false;
            cancellation_ref.current.cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        try {
            const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
            if (saved?.ticks) setTicksInput(String(saved.ticks));
            if (saved?.family) setFamily(saved.family);
        } catch {
            /* no stored preferences */
        }
    }, [isOpen]);

    // Every scanned market, ranked by its top setup - shown whether or not
    // anything beats fair value, so a scan always ends with real numbers.
    const ranked = useMemo(
        () =>
            [...(result?.rows ?? [])]
                .filter(row => topOf(row))
                .sort((a, b) => (topOf(b)?.score ?? -Infinity) - (topOf(a)?.score ?? -Infinity)),
        [result]
    );
    const best = useMemo(() => (result ? (pickBest(result) ?? ranked[0] ?? null) : null), [result, ranked]);

    const selected: TScanRow | null = useMemo(() => {
        if (!result) return null;
        if (selected_symbol) return result.rows.find(row => row.symbol === selected_symbol) ?? best;
        return best;
    }, [result, selected_symbol, best]);
    const selected_evaluation = topOf(selected);

    const leaderboard = useMemo(() => ranked.slice(0, LEADERBOARD_SIZE), [ranked]);

    const runScan = useCallback(async () => {
        const ticks = Math.max(MIN_TICKS, Math.min(MAX_TICKS, parseInt(ticks_input, 10) || DEFAULT_TICKS));
        setTicksInput(String(ticks));
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify({ ticks, family }));
        } catch {
            /* nothing to do */
        }

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
                // Volatility indices only: the other synthetics offer digit
                // contracts but do not behave like the volatility series, and
                // ranking them together produced picks no digit trader wants.
                scope: 'volatility',
                families: family === 'all' ? undefined : [family],
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
    }, [family, ticks_input]);

    const handleRun = useCallback(
        async (params: TScannerParams) => {
            if (!selected || !selected_evaluation) return;
            setShowParams(false);
            setIsLoadingBot(true);
            try {
                // Loads the strategy into Bot Builder and starts it straight away.
                await loadStrategyIntoBot(store as unknown as TStoreLike, {
                    symbol: selected.symbol,
                    definition: selected_evaluation.definition,
                    params,
                    meta: {
                        display_name: selected.display_name,
                        strategy_label: selected_evaluation.definition.label,
                        confident_win_rate: selected_evaluation.confident_win_rate,
                        edge: selected_evaluation.edge,
                        ticks_analysed: selected.ticks_analysed,
                        trigger_digit: selected_evaluation.trigger?.previous_digit ?? null,
                    },
                    run: true,
                });
                onClose();
            } catch (err) {
                setError(err instanceof Error ? err.message : localize('Could not load the strategy.'));
            } finally {
                if (is_mounted_ref.current) setIsLoadingBot(false);
            }
        },
        [onClose, selected, selected_evaluation, store]
    );

    if (!isOpen || !store) return null;

    const ticks_value = Math.max(MIN_TICKS, Math.min(MAX_TICKS, parseInt(ticks_input, 10) || DEFAULT_TICKS));
    const mode_label = FAMILY_OPTIONS.find(option => option.value === family)?.label ?? '';

    return (
        <div className='ai-entry-scanner__overlay' onClick={onClose}>
            <div className='ai-entry-scanner__modal' onClick={event => event.stopPropagation()} role='dialog' aria-modal='true'>
                <div className='ai-entry-scanner__header'>
                    <h2 className='ai-entry-scanner__title'>{localize('Entry Scanner')}</h2>
                    <button
                        type='button'
                        className='ai-entry-scanner__close'
                        onClick={onClose}
                        aria-label={localize('Close scanner')}
                    >
                        <LegacyClose1pxIcon width='22px' height='22px' />
                    </button>
                </div>

                <div className='ai-entry-scanner__body'>
                    <div className='ai-entry-scanner__hero'>
                        <span className='ai-entry-scanner__badge'>✦ {localize('Live tick analysis')}</span>
                        <h3 className='ai-entry-scanner__hero-title'>{localize('Volatility Market Scanner')}</h3>
                        <p className='ai-entry-scanner__hero-text'>
                            {localize(
                                'Measures every contract setup on every volatility index against real Deriv ticks, and its fair odds.'
                            )}
                        </p>
                        <span className={`ai-entry-scanner__radar${is_scanning ? ' ai-entry-scanner__radar--on' : ''}`} aria-hidden='true' />
                    </div>

                    <div className='ai-entry-scanner__chips' role='tablist'>
                        {FAMILY_OPTIONS.map(option => (
                            <button
                                key={option.value}
                                type='button'
                                role='tab'
                                aria-selected={family === option.value}
                                className={`ai-entry-scanner__chip${family === option.value ? ' ai-entry-scanner__chip--active' : ''}`}
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
                        onClick={() => setShowParams(true)}
                        disabled={!selected_evaluation || is_scanning || is_loading_bot}
                    >
                        {is_loading_bot
                            ? localize('Loading bot...')
                            : selected_evaluation
                              ? localize('Load {{label}} Strategy', { label: selected_evaluation.definition.label })
                              : localize('Load Strategy')}
                    </button>
                    <button
                        type='button'
                        className='ai-entry-scanner__btn ai-entry-scanner__btn--secondary'
                        onClick={runScan}
                        disabled={is_scanning || is_loading_bot}
                    >
                        {is_scanning ? localize('Scanning...') : result ? localize('Rescan') : localize('Scan Markets')}
                    </button>
                </div>
            </div>

            <ScannerParametersModal isOpen={show_params} onClose={() => setShowParams(false)} onRun={handleRun} />
        </div>
    );
};

export default EntryScannerModal;
