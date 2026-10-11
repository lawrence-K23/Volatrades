import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
/* [AI] - Analytics removed - rudderstack event tracking removed */
/* [/AI] */
import ChunkLoader from '@/components/loader/chunk-loader';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useSmartChartAdaptor } from '@/hooks/useSmartChartAdaptor';
import { useStore } from '@/hooks/useStore';
import { ChartTitle, SmartChart, TGranularity, TStateChangeListener } from '@deriv-com/smartcharts-champion';
import { useDevice } from '@deriv-com/ui';
import ToolbarWidgets from './toolbar-widgets';
import '@deriv-com/smartcharts-champion/dist/smartcharts.css';

/**
 * A line, or a pair of lines with a band between them, drawn over the chart.
 * The keys are the ones SmartCharts' barrier store reads; `shade: 'between'`
 * becomes its SHADE_BETWEEN, and a relative barrier is an offset from the
 * current spot, which is how an accumulator's band follows the price.
 */
export type TChartBarrier = {
    high: number | string;
    low?: number | string;
    relative?: boolean;
    shade?: 'between' | 'outside' | 'above' | 'below' | 'none_single' | 'none_double';
    color?: string;
    shadeColor?: string;
    lineStyle?: 'solid' | 'dashed' | 'dotted';
    draggable?: boolean;
    hidePriceLines?: boolean;
    hideOffscreenBarrier?: boolean;
    isSingleBarrier?: boolean;
};

/**
 * A contract marker, in the shape Deriv's trader hands SmartCharts as
 * `contracts_array`. An accumulator's range is one of these - type
 * `AccumulatorContract`, with `highBarrier`, `lowBarrier` and `previousTick`
 * points - and the chart draws it the way DTrader shows it.
 */
export type TChartMarker = {
    type: string;
    markers: {
        epoch: number;
        quote?: number;
        type: string;
        color?: string;
        text?: string;
    }[];
    props?: Record<string, unknown>;
};

type TChartProps = {
    show_digits_stats: boolean;
    barriers?: TChartBarrier[];
    contracts_array?: TChartMarker[];
    /** Dresses the chart as DTrader does for accumulators. */
    is_accumulator?: boolean;
};

const NO_BARRIERS: TChartBarrier[] = [];
const NO_MARKERS: TChartMarker[] = [];

// DTrader's own values, from its CHART_CONSTANTS: the space kept right of the
// last tick so the range has room to show, and on a phone the bars kept left.
const ACCUMULATOR_WHITESPACE = 190;
const ACCUMULATOR_MIN_LEFT_BARS_MOBILE = 3;

const Chart = observer(
    ({ show_digits_stats, barriers = NO_BARRIERS, contracts_array = NO_MARKERS, is_accumulator = false }: TChartProps) => {
    const { common, ui } = useStore();
    const { chart_store, run_panel, dashboard } = useStore();
    const [isSafari, setIsSafari] = useState(false);

    const {
        chart_type,
        getMarketsOrder,
        granularity,
        onSymbolChange,
        setChartStatus,
        symbol,
        updateChartType,
        updateGranularity,
        updateSymbol,
    } = chart_store;

    // Use the custom hook for SmartChart Adaptor
    const { chartData, getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartAdaptor();

    const { isDesktop, isMobile } = useDevice();
    const { is_drawer_open } = run_panel;
    const { is_chart_modal_visible } = dashboard;

    const settings = {
        assetInformation: false, // ui.is_chart_asset_info_visible,
        countdown: true,
        isHighestLowestMarkerEnabled: false, // TODO: Pending UI,
        language: common.current_language.toLowerCase(),
        position: ui.is_chart_layout_default ? 'bottom' : 'left',
        theme: ui.is_dark_mode_on ? 'dark' : 'light',
        ...(is_accumulator
            ? {
                  whitespace: ACCUMULATOR_WHITESPACE,
                  minimumLeftBars: isMobile ? ACCUMULATOR_MIN_LEFT_BARS_MOBILE : undefined,
              }
            : {}),
    };

    useEffect(() => {
        // Safari browser detection using feature detection
        // More robust than user agent sniffing
        const isSafariBrowser = () => {
            // Check for Safari-specific features
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

            // Additional check: Safari has specific webkit features
            const hasWebkitFeatures = 'webkitAudioContext' in window || 'WebKitMediaSource' in window;

            return isSafari && hasWebkitFeatures;
        };

        setIsSafari(isSafariBrowser());

        return () => {
            chart_api.api.forgetAll('ticks');
        };
    }, []);

    useEffect(() => {
        if (!symbol) updateSymbol();
    }, [symbol, updateSymbol]);

    const is_connection_opened = !!chart_api?.api;

    const handleStateChange: TStateChangeListener = (state, options) => {
        /* [AI] - Analytics removed - rudderstack event call removed */
        // Handle state changes: INITIAL, READY, SCROLL_TO_LEFT
        /* [/AI] */
        if (state === 'READY') {
            setChartStatus(true);
        }
    };

    if (!symbol || chartData.activeSymbols.length === 0) {
        return <ChunkLoader message='' />;
    }

    return (
        <div
            className={classNames('dashboard__chart-wrapper', {
                'dashboard__chart-wrapper--expanded': is_drawer_open && isDesktop,
                'dashboard__chart-wrapper--modal': is_chart_modal_visible && isDesktop,
                'dashboard__chart-wrapper--safari': isSafari,
            })}
            dir='ltr'
        >
            <SmartChart
                id={`dbot-${symbol}`}
                key={`chart-${symbol}`}
                barriers={barriers}
                contracts_array={contracts_array}
                showLastDigitStats={show_digits_stats}
                chartControlsWidgets={null}
                enabledChartFooter={false}
                stateChangeListener={handleStateChange}
                toolbarWidget={() => (
                    <ToolbarWidgets
                        updateChartType={updateChartType}
                        updateGranularity={updateGranularity}
                        position={!isDesktop ? 'bottom' : 'top'}
                        isDesktop={isDesktop}
                    />
                )}
                chartType={chart_type}
                isMobile={isMobile}
                enabledNavigationWidget={isDesktop}
                // Accumulators trade on ticks, so DTrader keeps their chart on
                // the tick chart and zooms the price axis out to fit the range.
                granularity={(is_accumulator ? 0 : granularity) as TGranularity}
                allowTickChartTypeOnly={is_accumulator}
                should_zoom_out_on_yaxis={is_accumulator}
                getQuotes={getQuotes}
                subscribeQuotes={subscribeQuotes}
                unsubscribeQuotes={unsubscribeQuotes}
                chartData={{ activeSymbols: chartData.activeSymbols, tradingTimes: chartData.tradingTimes }}
                settings={settings}
                symbol={symbol}
                topWidgets={() => <ChartTitle onChange={onSymbolChange} />}
                isConnectionOpened={is_connection_opened}
                getMarketsOrder={getMarketsOrder}
                isLive
                leftMargin={80}
                drawingToolFloatingMenuPosition={isMobile ? { x: 100, y: 100 } : { x: 200, y: 200 }}
            />
        </div>
    );
});

export default Chart;
