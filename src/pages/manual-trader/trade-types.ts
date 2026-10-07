/**
 * The trade types Deriv's own trader offers, grouped and named as its "Trade
 * types" menu groups and names them.
 *
 * Each entry says which contract types it buys and which inputs it needs, so
 * the panel and the proposal request are both driven from here rather than
 * from a pile of conditionals.
 */

export type TTradeTypeId =
    | 'accumulator'
    | 'matches_differs'
    | 'even_odd'
    | 'over_under'
    | 'rise_fall'
    | 'higher_lower'
    | 'touch_notouch'
    | 'multipliers'
    | 'turbos'
    | 'vanillas';

export type TTradeGroup = 'Accumulators' | 'Digits' | 'Ups & Downs' | 'Touch & No Touch' | 'Multipliers' | 'Turbos' | 'Vanillas';

/** Which inputs the panel shows for a trade type. */
export type TTradeField =
    | 'duration'
    | 'digit_prediction'
    | 'stake'
    | 'growth_rate'
    | 'multiplier'
    | 'barrier_offset'
    | 'take_profit'
    | 'stop_loss'
    | 'deal_cancellation'
    /** Deriv shows a Stake / Payout switch on the options types only. */
    | 'basis_toggle';

export type TTradeType = {
    id: TTradeTypeId;
    group: TTradeGroup;
    /** As the menu and the panel header show it. */
    label: string;
    /** The two sides, long first, as the buttons read. */
    sides: [{ label: string; contract_type: string }, { label: string; contract_type: string }?];
    fields: TTradeField[];
    /** Contract types Deriv must list for the market before this is offered. */
    requires: string[];
    /**
     * Whether this panel can place the trade. The menu still lists the rest,
     * because Deriv's does and because the market may support them - they just
     * need inputs this panel does not carry yet, and a half-built form that
     * buys the wrong contract would be worse than an honest note.
     */
    tradable: boolean;
};

export const TRADE_TYPES: TTradeType[] = [
    {
        id: 'accumulator',
        group: 'Accumulators',
        label: 'Accumulators',
        sides: [{ label: 'Buy', contract_type: 'ACCU' }],
        fields: ['growth_rate', 'stake', 'take_profit'],
        requires: ['ACCU'],
        tradable: true,
    },
    {
        id: 'matches_differs',
        group: 'Digits',
        label: 'Matches/Differs',
        sides: [
            { label: 'Matches', contract_type: 'DIGITMATCH' },
            { label: 'Differs', contract_type: 'DIGITDIFF' },
        ],
        fields: ['duration', 'digit_prediction', 'stake', 'basis_toggle'],
        requires: ['DIGITMATCH', 'DIGITDIFF'],
        tradable: true,
    },
    {
        id: 'even_odd',
        group: 'Digits',
        label: 'Even/Odd',
        sides: [
            { label: 'Even', contract_type: 'DIGITEVEN' },
            { label: 'Odd', contract_type: 'DIGITODD' },
        ],
        fields: ['duration', 'stake', 'basis_toggle'],
        requires: ['DIGITEVEN', 'DIGITODD'],
        tradable: true,
    },
    {
        id: 'over_under',
        group: 'Digits',
        label: 'Over/Under',
        sides: [
            { label: 'Over', contract_type: 'DIGITOVER' },
            { label: 'Under', contract_type: 'DIGITUNDER' },
        ],
        fields: ['duration', 'digit_prediction', 'stake', 'basis_toggle'],
        requires: ['DIGITOVER', 'DIGITUNDER'],
        tradable: true,
    },
    {
        id: 'rise_fall',
        group: 'Ups & Downs',
        label: 'Rise/Fall',
        sides: [
            { label: 'Rise', contract_type: 'CALL' },
            { label: 'Fall', contract_type: 'PUT' },
        ],
        fields: ['duration', 'stake', 'basis_toggle'],
        requires: ['CALL', 'PUT'],
        tradable: true,
    },
    {
        id: 'higher_lower',
        group: 'Ups & Downs',
        label: 'Higher/Lower',
        sides: [
            { label: 'Higher', contract_type: 'CALL' },
            { label: 'Lower', contract_type: 'PUT' },
        ],
        fields: ['duration', 'barrier_offset', 'stake', 'basis_toggle'],
        requires: ['CALL', 'PUT'],
        tradable: true,
    },
    {
        id: 'multipliers',
        group: 'Multipliers',
        label: 'Multipliers',
        sides: [
            { label: 'Up', contract_type: 'MULTUP' },
            { label: 'Down', contract_type: 'MULTDOWN' },
        ],
        fields: ['multiplier', 'stake', 'take_profit', 'stop_loss', 'deal_cancellation'],
        requires: ['MULTUP', 'MULTDOWN'],
        tradable: true,
    },
    {
        id: 'touch_notouch',
        group: 'Touch & No Touch',
        label: 'Touch/No Touch',
        sides: [
            { label: 'Touch', contract_type: 'ONETOUCH' },
            { label: 'No Touch', contract_type: 'NOTOUCH' },
        ],
        fields: ['duration', 'barrier_offset', 'stake', 'basis_toggle'],
        requires: ['ONETOUCH', 'NOTOUCH'],
        tradable: false,
    },
    {
        id: 'turbos',
        group: 'Turbos',
        label: 'Turbos',
        sides: [
            { label: 'Long', contract_type: 'TURBOSLONG' },
            { label: 'Short', contract_type: 'TURBOSSHORT' },
        ],
        fields: ['duration', 'stake', 'basis_toggle'],
        requires: ['TURBOSLONG', 'TURBOSSHORT'],
        tradable: false,
    },
    {
        id: 'vanillas',
        group: 'Vanillas',
        label: 'Call/Put',
        sides: [
            { label: 'Call', contract_type: 'VANILLALONGCALL' },
            { label: 'Put', contract_type: 'VANILLALONGPUT' },
        ],
        fields: ['duration', 'stake', 'basis_toggle'],
        requires: ['VANILLALONGCALL', 'VANILLALONGPUT'],
        tradable: false,
    },
];

/** The menu's left-hand filters, as Deriv lists them. */
export const TRADE_CATEGORIES = ['All', 'Multipliers', 'Options', 'Accumulators'] as const;
export type TTradeCategory = (typeof TRADE_CATEGORIES)[number];

const CATEGORY_GROUPS: Record<TTradeCategory, TTradeGroup[] | null> = {
    All: null,
    Multipliers: ['Multipliers'],
    Options: ['Digits', 'Ups & Downs', 'Touch & No Touch', 'Turbos', 'Vanillas'],
    Accumulators: ['Accumulators'],
};

/** The order the groups appear in, matching Deriv's menu. */
export const GROUP_ORDER: TTradeGroup[] = [
    'Accumulators',
    'Digits',
    'Ups & Downs',
    'Touch & No Touch',
    'Multipliers',
    'Turbos',
    'Vanillas',
];

export const byId = (id: TTradeTypeId): TTradeType =>
    TRADE_TYPES.find(type => type.id === id) ?? TRADE_TYPES[1];

/**
 * The trade types to show: in the chosen category, matching the search text,
 * and - when Deriv has told us what the market supports - offered on it.
 */
export const filterTradeTypes = (
    category: TTradeCategory,
    search: string,
    available: string[] | null
): TTradeType[] => {
    const groups = CATEGORY_GROUPS[category];
    const needle = search.trim().toLowerCase();

    return TRADE_TYPES.filter(type => {
        if (groups && !groups.includes(type.group)) return false;
        if (needle && !type.label.toLowerCase().includes(needle) && !type.group.toLowerCase().includes(needle)) {
            return false;
        }
        if (available && available.length && !type.requires.every(contract => available.includes(contract))) {
            return false;
        }
        return true;
    });
};

/** Group the list for rendering, keeping Deriv's order. */
export const groupTradeTypes = (types: TTradeType[]): { group: TTradeGroup; types: TTradeType[] }[] =>
    GROUP_ORDER.map(group => ({ group, types: types.filter(type => type.group === group) })).filter(
        entry => entry.types.length > 0
    );
