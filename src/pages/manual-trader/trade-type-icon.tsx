/**
 * Deriv's own trade-type icons, from @deriv/quill-icons - the set their trader
 * draws in its menu and on its buy buttons - keyed by contract type.
 */
import {
    TradeTypesAccumulatorStayInIcon,
    TradeTypesDigitsDiffersIcon,
    TradeTypesDigitsEvenIcon,
    TradeTypesDigitsMatchesIcon,
    TradeTypesDigitsOddIcon,
    TradeTypesDigitsOverIcon,
    TradeTypesDigitsUnderIcon,
    TradeTypesHighsAndLowsHigherIcon,
    TradeTypesHighsAndLowsLowerIcon,
    TradeTypesHighsAndLowsNoTouchIcon,
    TradeTypesHighsAndLowsTouchIcon,
    TradeTypesMultipliersDownIcon,
    TradeTypesMultipliersUpIcon,
    TradeTypesTurboLongIcon,
    TradeTypesTurboShortIcon,
    TradeTypesUpsAndDownsFallIcon,
    TradeTypesUpsAndDownsRiseIcon,
    TradeTypesVanillaCallIcon,
    TradeTypesVanillaPutIcon,
} from '@deriv/quill-icons/TradeTypes';
import type { TTradeTypeId } from './trade-types';

// Every icon in the set shares one type; borrow it rather than describe it.
type TIcon = typeof TradeTypesDigitsEvenIcon;

/** By contract type, for the buy buttons. */
const BY_CONTRACT: Record<string, TIcon> = {
    ACCU: TradeTypesAccumulatorStayInIcon,
    DIGITMATCH: TradeTypesDigitsMatchesIcon,
    DIGITDIFF: TradeTypesDigitsDiffersIcon,
    DIGITEVEN: TradeTypesDigitsEvenIcon,
    DIGITODD: TradeTypesDigitsOddIcon,
    DIGITOVER: TradeTypesDigitsOverIcon,
    DIGITUNDER: TradeTypesDigitsUnderIcon,
    CALL: TradeTypesUpsAndDownsRiseIcon,
    PUT: TradeTypesUpsAndDownsFallIcon,
    ONETOUCH: TradeTypesHighsAndLowsTouchIcon,
    NOTOUCH: TradeTypesHighsAndLowsNoTouchIcon,
    MULTUP: TradeTypesMultipliersUpIcon,
    MULTDOWN: TradeTypesMultipliersDownIcon,
    TURBOSLONG: TradeTypesTurboLongIcon,
    TURBOSSHORT: TradeTypesTurboShortIcon,
    VANILLALONGCALL: TradeTypesVanillaCallIcon,
    VANILLALONGPUT: TradeTypesVanillaPutIcon,
};

/** Higher/Lower shares CALL/PUT with Rise/Fall but has icons of its own. */
const OVERRIDES: Partial<Record<TTradeTypeId, string[]>> = {
    higher_lower: ['HIGHER', 'LOWER'],
};
const OVERRIDE_ICONS: Record<string, TIcon> = {
    HIGHER: TradeTypesHighsAndLowsHigherIcon,
    LOWER: TradeTypesHighsAndLowsLowerIcon,
};

export const TradeTypeIcon = ({
    trade_type_id,
    contract_type,
    index,
    size = 'sm',
}: {
    trade_type_id: TTradeTypeId;
    contract_type: string;
    /** Which side of the trade type, for the types with their own icons. */
    index: number;
    size?: 'xs' | 'sm' | 'md';
}) => {
    const override = OVERRIDES[trade_type_id]?.[index];
    const Icon = (override && OVERRIDE_ICONS[override]) || BY_CONTRACT[contract_type];
    if (!Icon) return null;
    return <Icon iconSize={size} className='mt-icon' />;
};

export default TradeTypeIcon;
