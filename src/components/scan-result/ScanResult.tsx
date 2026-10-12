/**
 * The measured result of one contract setup on one market, as stat cards.
 *
 * Every number is measured on real Deriv ticks. "Fair value" is the win rate
 * the contract has by construction (Over 1 wins on 8 digits of 10, so 80%),
 * and "Edge" is how far the measured rate sits above it. The edge is only
 * called real when it survives the 95% confidence bound; otherwise the setup
 * is doing what chance alone predicts, and the card says so.
 */
import React from 'react';
import { localize } from '@deriv-com/translations';

import { RECENT_WINDOW, TStrategyEvaluation } from '@/utils/analysis';

import './scan-result.scss';

type TProps = {
    market: string;
    evaluation: TStrategyEvaluation;
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

const ScanResult: React.FC<TProps> = ({ market, evaluation }) => {
    const { definition, win_rate, baseline, trials, raw_edge, edge, recent_edge, confidence, trigger } = evaluation;
    const recent_trials = Math.min(trials, RECENT_WINDOW);
    const recent_rate = Math.max(0, Math.min(100, baseline + recent_edge));
    const has_edge = edge > 0;
    const tone = has_edge ? 'good' : raw_edge >= 0 ? 'neutral' : 'bad';

    const trade_detail = trigger
        ? localize('Enter after a {{digit}}: won {{rate}}% of {{trials}} such ticks', {
              digit: trigger.previous_digit,
              rate: trigger.win_rate,
              trials: trigger.trials,
          })
        : localize('No entry digit improves it - any tick');

    const cards = [
        {
            icon: '✓',
            label: localize('Win rate'),
            value: `${win_rate.toFixed(1)}%`,
            note: localize('all {{n}} ticks', { n: trials }),
        },
        {
            icon: '⚡',
            label: localize('Recent'),
            value: `${recent_rate.toFixed(1)}%`,
            note: localize('last {{n}} ticks', { n: recent_trials }),
        },
        {
            icon: '◐',
            label: localize('Samples'),
            value: String(trials),
            note: localize('ticks measured'),
        },
        {
            icon: '⚖',
            label: localize('Fair value'),
            value: `${baseline.toFixed(0)}%`,
            note: localize('the built-in odds'),
        },
        {
            icon: '◎',
            label: localize('Edge'),
            value: `${signed(raw_edge)} pts`,
            note: localize('{{c}}% confidence', { c: confidence.toFixed(0) }),
            tone,
        },
    ];

    return (
        <div className='scan-result'>
            <div className='scan-result__pair'>
                <div className='scan-result__box'>
                    <span className='scan-result__label'>{localize('Selected market')}</span>
                    <span className='scan-result__big'>{market}</span>
                </div>
                <div className='scan-result__box'>
                    <span className='scan-result__label'>{localize('Trade type')}</span>
                    <span className='scan-result__big'>{definition.label}</span>
                    <span className='scan-result__small'>{trade_detail}</span>
                </div>
            </div>

            <div className='scan-result__cards'>
                {cards.map(card => (
                    <div key={card.label} className={`scan-result__card${card.tone ? ` scan-result__card--${card.tone}` : ''}`}>
                        <span className='scan-result__icon' aria-hidden='true'>
                            {card.icon}
                        </span>
                        <span className='scan-result__label'>{card.label}</span>
                        <span className='scan-result__value'>{card.value}</span>
                        <span className='scan-result__small'>{card.note}</span>
                    </div>
                ))}
            </div>

            <div className={`scan-result__verdict scan-result__verdict--${tone}`}>
                {has_edge
                    ? localize(
                          '{{label}} is beating its {{fair}}% fair value by more than chance explains on this data. Past ticks do not guarantee future ones - trade small.',
                          { label: definition.label, fair: baseline.toFixed(0) }
                      )
                    : localize(
                          '{{label}} is within normal randomness of its {{fair}}% fair value - no real edge on this data. Its win rate is the built-in odds, which the payout already prices in.',
                          { label: definition.label, fair: baseline.toFixed(0) }
                      )}
            </div>
        </div>
    );
};

export default ScanResult;
