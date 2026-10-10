import { byId, filterTradeTypes, groupTradeTypes, TRADE_TYPES } from '../trade-types';
import { buildProposalRequest, readApiError, readProposal, type TProposalInputs } from '../use-proposal';

const inputs = (over: Partial<TProposalInputs> = {}): TProposalInputs => ({
    symbol: 'R_100',
    currency: 'USD',
    basis: 'stake',
    stake: 100,
    duration: 1,
    digit: 2,
    growth_rate: 0.03,
    multiplier: 400,
    barrier_offset: '+0.10',
    take_profit: null,
    stop_loss: null,
    deal_cancellation: false,
    ...over,
});

describe('buildProposalRequest', () => {
    it('names the market with the field this API uses', () => {
        const request = buildProposalRequest(byId('even_odd'), 'DIGITEVEN', inputs());

        expect(request.underlying_symbol).toBe('R_100');
        expect(request.symbol).toBeUndefined();
    });

    it('subscribes, so the price keeps up with the market', () => {
        expect(buildProposalRequest(byId('even_odd'), 'DIGITEVEN', inputs()).subscribe).toBe(1);
    });

    it('sends the predicted digit as the barrier for matches and over/under', () => {
        expect(buildProposalRequest(byId('matches_differs'), 'DIGITMATCH', inputs({ digit: 7 })).barrier).toBe('7');
        expect(buildProposalRequest(byId('over_under'), 'DIGITOVER', inputs({ digit: 4 })).barrier).toBe('4');
    });

    it('sends no barrier for even/odd, which has no prediction', () => {
        expect(buildProposalRequest(byId('even_odd'), 'DIGITODD', inputs()).barrier).toBeUndefined();
    });

    it('sends the barrier offset for higher/lower', () => {
        const request = buildProposalRequest(byId('higher_lower'), 'CALL', inputs({ barrier_offset: '+0.484' }));
        expect(request.barrier).toBe('+0.484');
    });

    it('counts duration in ticks for the options types', () => {
        const request = buildProposalRequest(byId('over_under'), 'DIGITUNDER', inputs({ duration: 5 }));
        expect(request.duration).toBe(5);
        expect(request.duration_unit).toBe('t');
    });

    it('sends an accumulator with its growth rate and no duration', () => {
        const request = buildProposalRequest(byId('accumulator'), 'ACCU', inputs({ growth_rate: 0.05 }));

        expect(request.contract_type).toBe('ACCU');
        expect(request.growth_rate).toBe(0.05);
        expect(request.duration).toBeUndefined();
        expect(request.duration_unit).toBeUndefined();
    });

    it('sends a multiplier with its size and no duration', () => {
        const request = buildProposalRequest(byId('multipliers'), 'MULTUP', inputs({ multiplier: 200 }));

        expect(request.multiplier).toBe(200);
        expect(request.duration).toBeUndefined();
    });

    it('carries take profit and stop loss as a limit order', () => {
        const request = buildProposalRequest(
            byId('multipliers'),
            'MULTUP',
            inputs({ take_profit: 12, stop_loss: 8 })
        );

        expect(request.limit_order).toEqual({ take_profit: 12, stop_loss: 8 });
    });

    it('leaves the limit order out when neither is set', () => {
        expect(buildProposalRequest(byId('multipliers'), 'MULTUP', inputs()).limit_order).toBeUndefined();
    });

    it('asks for deal cancellation only when it is ticked', () => {
        expect(buildProposalRequest(byId('multipliers'), 'MULTUP', inputs()).cancellation).toBeUndefined();
        expect(
            buildProposalRequest(byId('multipliers'), 'MULTUP', inputs({ deal_cancellation: true })).cancellation
        ).toBe('60m');
    });

    it('quotes from a payout only where Deriv offers that switch', () => {
        expect(buildProposalRequest(byId('even_odd'), 'DIGITEVEN', inputs({ basis: 'payout' })).basis).toBe('payout');
        // Accumulators are staked, whatever the switch says.
        expect(buildProposalRequest(byId('accumulator'), 'ACCU', inputs({ basis: 'payout' })).basis).toBe('stake');
    });
});

describe('the trade type menu', () => {
    it('offers every trade type under All', () => {
        expect(filterTradeTypes('All', '', null)).toHaveLength(TRADE_TYPES.length);
    });

    it('keeps multipliers and accumulators out of Options', () => {
        const labels = filterTradeTypes('Options', '', null).map(type => type.label);

        expect(labels).toContain('Even/Odd');
        expect(labels).not.toContain('Multipliers');
        expect(labels).not.toContain('Accumulators');
    });

    it('searches by name and by group', () => {
        expect(filterTradeTypes('All', 'even', null).map(t => t.id)).toEqual(['even_odd']);
        expect(filterTradeTypes('All', 'digits', null).map(t => t.id)).toEqual([
            'matches_differs',
            'even_odd',
            'over_under',
        ]);
    });

    it('offers only what the market itself supports', () => {
        const available = ['DIGITEVEN', 'DIGITODD', 'CALL', 'PUT'];

        expect(filterTradeTypes('All', '', available).map(t => t.id)).toEqual([
            'even_odd',
            'rise_fall',
            'higher_lower',
        ]);
    });

    it('falls back to the full list when the market has not answered yet', () => {
        expect(filterTradeTypes('All', '', []).length).toBe(TRADE_TYPES.length);
    });

    it('groups in Deriv’s order', () => {
        const groups = groupTradeTypes(filterTradeTypes('All', '', null)).map(entry => entry.group);

        expect(groups).toEqual([
            'Accumulators',
            'Digits',
            'Ups & Downs',
            'Touch & No Touch',
            'Multipliers',
            'Turbos',
            'Vanillas',
        ]);
    });

    it('knows every type it offers how to buy', () => {
        TRADE_TYPES.filter(type => type.tradable).forEach(type => {
            expect(type.sides[0]?.contract_type).toBeTruthy();
        });
    });
});

/**
 * Responses captured from Deriv's live API on 2026-10-08, so these read the
 * real shape rather than an assumed one.
 */
describe('readProposal, against live Deriv responses', () => {
    const accumulator = {
        ask_price: 100,
        payout: 0,
        id: '91c01219-57d6-de36-50f3-ab0de57e3d08',
        contract_details: {
            barrier_spot_distance: '0.488',
            high_barrier: '1284.888',
            low_barrier: '1283.912',
            maximum_payout: 3000,
            maximum_stake: '200.00',
            maximum_ticks: 85,
            minimum_stake: '1.00',
            ticks_stayed_in: [4, 32, 20, 63, 22],
        },
        validation_params: { max_payout: '3000.00', max_ticks: 85 },
    };

    it('reads an accumulator quote’s limits from contract_details', () => {
        const price = readProposal(accumulator, 100);

        expect(price.id).toBe('91c01219-57d6-de36-50f3-ab0de57e3d08');
        expect(price.max_payout).toBe(3000);
        expect(price.max_ticks).toBe(85);
    });

    it('reads the band, which Deriv sends as strings', () => {
        const price = readProposal(accumulator, 100);

        expect(price.barrier_spot_distance).toBe(0.488);
        expect(price.high_barrier).toBe(1284.888);
        expect(price.low_barrier).toBe(1283.912);
    });

    it('reads the tick the band was measured from, where the chart starts drawing it', () => {
        // Captured live on 2026-10-10: spot_time sits on the proposal itself,
        // and contract_details repeats it as last_tick_epoch.
        expect(readProposal({ ...accumulator, spot_time: 1791628771 }, 100).spot_time).toBe(1791628771);
        expect(
            readProposal(
                { ...accumulator, contract_details: { ...accumulator.contract_details, last_tick_epoch: 1791628771 } },
                100
            ).spot_time
        ).toBe(1791628771);
        expect(readProposal(accumulator, 100).spot_time).toBeNull();
    });

    it('reads the runs the stats strip shows', () => {
        expect(readProposal(accumulator, 100).ticks_stayed_in).toEqual([4, 32, 20, 63, 22]);
    });

    it('prices even/odd as Deriv quotes it', () => {
        const price = readProposal({ ask_price: 100, payout: 195.31, id: 'af140aa4' }, 100);

        expect(price.payout).toBe(195.31);
        expect(price.percentage).toBeCloseTo(95.31, 2);
    });
});

describe('readApiError', () => {
    it('reads the message out of a refusal, which is not an Error', () => {
        const refusal = { error: { code: 'AuthorizationRequired', message: 'Please log in.' } };
        expect(readApiError(refusal, 'fallback')).toBe('Please log in.');
    });

    it('falls back only when there is nothing to read', () => {
        expect(readApiError(undefined, 'fallback')).toBe('fallback');
    });
});
