import { buildQuickStrategyFormData, type TBotParams } from '../load-into-bot';
import type { TStrategyDefinition } from '../strategies';

const even_odd = {
    label: 'Even',
    trade_type: 'evenodd',
    contract_type: 'DIGITEVEN',
    barrier: null,
} as unknown as TStrategyDefinition;

const matches = {
    label: 'Matches 3',
    trade_type: 'matchesdiffers',
    contract_type: 'DIGITMATCH',
    barrier: 3,
} as unknown as TStrategyDefinition;

const params = (over: Partial<TBotParams> = {}): TBotParams => ({
    stake: 0.5,
    martingale: 2,
    wins: 5,
    stopLoss: 50,
    useMartingale: true,
    ...over,
});

describe('buildQuickStrategyFormData', () => {
    /**
     * The strategy trades again only while totalProfit < profitThreshold, and
     * `profit` is what that threshold is built from. A zero there ended every
     * run on its first winning contract.
     */
    it('never sends a profit threshold of zero', () => {
        const form = buildQuickStrategyFormData('R_100', even_odd, params());
        expect(Number(form.profit)).toBeGreaterThan(0);
    });

    it('sets the profit ceiling above what the asked-for wins can return', () => {
        const form = buildQuickStrategyFormData('R_100', even_odd, params({ wins: 5, stake: 0.5 }));

        // Five even/odd wins return about 0.95 x stake each, so ~2.38 in total.
        expect(Number(form.profit)).toBeGreaterThan(5 * 0.5 * 0.95);
    });

    it('leaves room for a high-paying contract to reach the win target', () => {
        // Digit matches pays about 8x the stake, the richest of the digit
        // contracts: three wins is about 12, and the ceiling must exceed it.
        const form = buildQuickStrategyFormData('R_100', matches, params({ wins: 3, stake: 0.5 }));

        expect(Number(form.profit)).toBeGreaterThan(3 * 0.5 * 8);
    });

    it('passes the stop loss through as the loss threshold', () => {
        const form = buildQuickStrategyFormData('R_100', even_odd, params({ stopLoss: 25 }));

        expect(form.loss).toBe('25');
        expect(form.boolean_loss).toBe(true);
    });

    /**
     * The same trap on the loss side: the strategy trades again only while
     * totalProfit > -lossThreshold, so a zero ends the run on the first loss.
     */
    it('never sends a loss threshold of zero', () => {
        const form = buildQuickStrategyFormData('R_100', even_odd, params({ stopLoss: 0 }));

        expect(Number(form.loss)).toBeGreaterThan(0);
        expect(form.boolean_loss).toBe(false);
    });

    it('no longer passes the win count off as a sell-after-N-ticks condition', () => {
        const form = buildQuickStrategyFormData('R_100', even_odd, params({ wins: 5 }));

        expect(form.boolean_tick_count).toBe(false);
        expect(form.tick_count).toBeUndefined();
    });

    it('keeps the rest of the contract as the scanner chose it', () => {
        const form = buildQuickStrategyFormData('1HZ100V', matches, params());

        expect(form.symbol).toBe('1HZ100V');
        expect(form.tradetype).toBe('matchesdiffers');
        expect(form.type).toBe('DIGITMATCH');
        expect(form.last_digit_prediction).toBe('3');
        expect(form.duration).toBe(1);
        expect(form.durationtype).toBe('t');
        expect(form.stake).toBe('0.5');
    });
});
