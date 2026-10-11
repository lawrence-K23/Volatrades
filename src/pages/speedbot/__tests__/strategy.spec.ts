import { DEFAULT_PAYOUT_RATE, flipSide, MIN_STAKE, pickSide, pickStake } from '../strategy';

const stake_defaults = {
    base: 1,
    martingale_on: false,
    multiplier: 2,
    recovery_on: false,
    last_result: null as 'win' | 'loss' | null,
    last_stake: 0,
    session_pl: 0,
    payout_rate: DEFAULT_PAYOUT_RATE,
};

const side_defaults = {
    selected: 'DIGITEVEN' as const,
    last_type: 'DIGITEVEN' as const,
    last_result: null as 'win' | 'loss' | null,
    alternate_sides: false,
    alternate_on_loss: false,
};

describe('speedbot strategy', () => {
    describe('pickStake', () => {
        it('stakes the form amount when nothing else is switched on', () => {
            expect(pickStake({ ...stake_defaults, base: 0.5 })).toBe(0.5);
        });

        it('never goes below the minimum Deriv accepts', () => {
            expect(pickStake({ ...stake_defaults, base: 0.1 })).toBe(MIN_STAKE);
        });

        it('leaves the stake alone after a win', () => {
            expect(
                pickStake({ ...stake_defaults, martingale_on: true, last_result: 'win', last_stake: 4 })
            ).toBe(1);
        });

        it('multiplies the last stake after a loss when martingale is on', () => {
            expect(
                pickStake({
                    ...stake_defaults,
                    martingale_on: true,
                    multiplier: 1.15,
                    last_result: 'loss',
                    last_stake: 2,
                })
            ).toBe(2.3);
        });

        it('ignores a loss when martingale is off', () => {
            expect(pickStake({ ...stake_defaults, last_result: 'loss', last_stake: 8 })).toBe(1);
        });

        it('treats a multiplier below one as no multiplier at all', () => {
            expect(
                pickStake({
                    ...stake_defaults,
                    martingale_on: true,
                    multiplier: 0.5,
                    last_result: 'loss',
                    last_stake: 3,
                })
            ).toBe(3);
        });

        it('stakes a losing run back at the reported payout rate', () => {
            // 10 behind at a 0.95 payout needs 10.53 to come level on one win.
            expect(
                pickStake({ ...stake_defaults, recovery_on: true, session_pl: -10, payout_rate: 0.95 })
            ).toBe(10.53);
        });

        it('falls back to the default payout rate before any contract has settled', () => {
            expect(
                pickStake({ ...stake_defaults, recovery_on: true, session_pl: -10, payout_rate: 0 })
            ).toBe(Number((10 / DEFAULT_PAYOUT_RATE).toFixed(2)));
        });

        it('does not chase a run that is level or ahead', () => {
            expect(pickStake({ ...stake_defaults, recovery_on: true, session_pl: 5 })).toBe(1);
            expect(pickStake({ ...stake_defaults, recovery_on: true, session_pl: 0 })).toBe(1);
        });

        it('lets recovery decide when both it and martingale are on', () => {
            expect(
                pickStake({
                    ...stake_defaults,
                    recovery_on: true,
                    martingale_on: true,
                    multiplier: 10,
                    last_result: 'loss',
                    last_stake: 2,
                    session_pl: -4,
                    payout_rate: 1,
                })
            ).toBe(4);
        });

        it('keeps a tiny deficit at the base stake rather than under it', () => {
            expect(
                pickStake({ ...stake_defaults, base: 1, recovery_on: true, session_pl: -0.2, payout_rate: 0.95 })
            ).toBe(1);
        });
    });

    describe('pickSide', () => {
        it('keeps the chosen side by default', () => {
            expect(pickSide(side_defaults)).toBe('DIGITEVEN');
        });

        it('alternates every trade when asked to', () => {
            expect(pickSide({ ...side_defaults, alternate_sides: true, last_type: 'DIGITEVEN' })).toBe('DIGITODD');
            expect(pickSide({ ...side_defaults, alternate_sides: true, last_type: 'DIGITODD' })).toBe('DIGITEVEN');
        });

        it('alternates only after a loss when asked to', () => {
            expect(pickSide({ ...side_defaults, alternate_on_loss: true, last_result: 'loss' })).toBe('DIGITODD');
            expect(pickSide({ ...side_defaults, alternate_on_loss: true, last_result: 'win' })).toBe('DIGITEVEN');
            expect(pickSide({ ...side_defaults, alternate_on_loss: true, last_result: null })).toBe('DIGITEVEN');
        });

        it('alternating every trade wins over alternating on a loss', () => {
            expect(
                pickSide({
                    ...side_defaults,
                    alternate_sides: true,
                    alternate_on_loss: true,
                    last_type: 'DIGITODD',
                    last_result: 'win',
                })
            ).toBe('DIGITEVEN');
        });
    });

    describe('flipSide', () => {
        it('turns one into the other', () => {
            expect(flipSide('DIGITEVEN')).toBe('DIGITODD');
            expect(flipSide('DIGITODD')).toBe('DIGITEVEN');
        });
    });
});
