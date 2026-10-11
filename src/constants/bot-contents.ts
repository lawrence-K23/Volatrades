type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    CHART: 2,
    TUTORIAL: 3,
    FREE_BOTS: 4,
    SPEEDBOT: 5,
    AUTO_TRADER: 6,
    ANALYSIS_TOOL: 7,
    SCANNER: 8,
    MANUAL_TRADER: 9,
    BULK_TRADER: 10,
    DCIRCLES: 11,
    COPY_TRADER: 12,
    TRADING_VIEW: 13,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-tutorials',
    'id-free-bots',
    'id-speedbot',
    'id-auto-trader',
    'id-analysis-tool',
    'id-scanner',
    'id-manual-trader',
    'id-bulk-trader',
    'id-dcircles',
    'id-copy-trader',
    'id-trading-view',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
