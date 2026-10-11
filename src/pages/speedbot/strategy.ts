/**
 * The two decisions Speedbot makes before every trade - how much, and which
 * side - kept apart from the page so they can be read and tested on their own.
 */

export type TContractType = 'DIGITEVEN' | 'DIGITODD';
export type TResult = 'win' | 'loss' | null;

/** Fallback payout rate for recovery sizing until a contract reports its own. */
export const DEFAULT_PAYOUT_RATE = 0.95;
/** Deriv will not take less than this on a digit contract. */
export const MIN_STAKE = 0.35;

export const flipSide = (type: TContractType): TContractType =>
    type === 'DIGITEVEN' ? 'DIGITODD' : 'DIGITEVEN';

type TStakeInput = {
    /** The stake typed into the form. */
    base: number;
    martingale_on: boolean;
    /** Multiplier applied to the last stake after a loss. */
    multiplier: number;
    recovery_on: boolean;
    last_result: TResult;
    last_stake: number;
    /** Profit or loss so far this run; negative means behind. */
    session_pl: number;
    /** payout / stake - 1, as the last settled contract reported it. */
    payout_rate: number;
};

/**
 * Recovery takes precedence over martingale: it stakes whatever one win at the
 * going payout needs to clear the run's deficit, so it already subsumes the
 * step-up martingale would have made. Neither ever stakes below the base.
 */
export const pickStake = ({
    base,
    martingale_on,
    multiplier,
    recovery_on,
    last_result,
    last_stake,
    session_pl,
    payout_rate,
}: TStakeInput): number => {
    const floor = Math.max(MIN_STAKE, Number.isFinite(base) ? base : MIN_STAKE);

    if (recovery_on) {
        const deficit = Math.max(0, -session_pl);
        if (deficit > 0) {
            const rate = payout_rate > 0 ? payout_rate : DEFAULT_PAYOUT_RATE;
            return Math.max(floor, Number((deficit / rate).toFixed(2)));
        }
    }

    if (martingale_on && last_result === 'loss' && last_stake > 0) {
        const factor = Math.max(1, Number.isFinite(multiplier) ? multiplier : 1);
        return Math.max(floor, Number((last_stake * factor).toFixed(2)));
    }

    return floor;
};

type TSideInput = {
    /** The side chosen in the form. */
    selected: TContractType;
    /** The side the last trade was placed on. */
    last_type: TContractType;
    last_result: TResult;
    alternate_sides: boolean;
    alternate_on_loss: boolean;
};

/**
 * Alternating every trade wins over alternating on a loss, which in turn only
 * applies once a loss has actually settled; otherwise the chosen side stands.
 */
export const pickSide = ({
    selected,
    last_type,
    last_result,
    alternate_sides,
    alternate_on_loss,
}: TSideInput): TContractType => {
    if (alternate_sides) return flipSide(last_type);
    if (alternate_on_loss && last_result === 'loss') return flipSide(last_type);
    return selected;
};
