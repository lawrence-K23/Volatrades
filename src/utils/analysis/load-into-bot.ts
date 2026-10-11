/**
 * Hand a scanned strategy over to the bot builder.
 *
 * The quick-strategy form is the app's own entry point into Blockly, so the
 * scanners drive it rather than generating XML themselves. The contract type
 * is passed in the `type` field because `quick_strategy.onSubmit` maps that
 * field onto the strategy's `purchase` block.
 */
import { DBOT_TABS } from '@/constants/bot-contents';

import { TStrategyDefinition } from './strategies';
import { clearWinLimit, startWinLimit } from './win-limit';

export type TBotParams = {
    stake: number;
    /** Martingale multiplier. */
    martingale: number;
    /** Consecutive wins to stop after (0 = no limit). */
    wins: number;
    /** Stop loss in account currency (0 = none). */
    stopLoss: number;
    useMartingale: boolean;
};

export type TLoadMeta = {
    display_name: string;
    strategy_label: string;
    /** 0-100 */
    confident_win_rate: number;
    /** percentage points */
    edge: number;
    ticks_analysed: number;
    trigger_digit: number | null;
};

const QS_FIELDS_KEY = 'qs-fields';
const AI_SCANNER_META_KEY = '__analysisScannerMeta';

/**
 * Quick-strategy form payload for a scanned strategy.
 *
 * Duration is fixed at one tick because that is the horizon every scanner
 * statistic is measured over - the contract resolves on the next tick.
 */
export const buildQuickStrategyFormData = (
    symbol: string,
    definition: TStrategyDefinition,
    params: TBotParams,
    action: 'RUN' | 'LOAD' = 'RUN'
): Record<string, any> => {
    const has_prediction = definition.barrier !== null;
    const has_stop_loss = Number(params.stopLoss) > 0;
    const stop_loss = has_stop_loss ? String(params.stopLoss) : '0';
    /**
     * The loss side of the same trap: this is substituted into the strategy's
     * `lossThreshold`, and it trades again only while
     * `totalProfit > -lossThreshold`. Sent as 0 - which is what "no stop loss"
     * looked like - a single losing contract ends the run. 5000 is the figure
     * the strategies themselves use to mean "no practical limit".
     */
    const loss_ceiling = has_stop_loss ? String(params.stopLoss) : '5000';

    /**
     * The strategy's take profit, which decides how long it runs.
     *
     * This field is substituted into the strategy's `profitThreshold`, and the
     * strategy trades again only while `totalProfit < profitThreshold`. It used
     * to be sent as 0, which made every run end on its first winning contract -
     * exactly the "it buys one win and stops" complaint - while a losing run
     * carried on, because a negative total is still below zero.
     *
     * The win count is enforced separately (see win-limit), so this is only a
     * ceiling: wins x stake x 10 is above what any digit contract can return on
     * that many wins - the richest, digit matches, pays about eight times the
     * stake - so it can never cut a run short of its target.
     */
    const wins_target = Math.max(1, Math.trunc(Number(params.wins) || 1));
    const profit_ceiling = Math.max(10, Number((wins_target * Number(params.stake) * 10).toFixed(2)));

    return {
        symbol,
        tradetype: definition.trade_type,
        // `onSubmit` reads this as the contract to purchase.
        type: definition.contract_type,
        durationtype: 't',
        duration: 1,
        action,
        stake: String(params.stake),
        unit: String(params.martingale),
        size: String(params.martingale),
        growth_rate: '0.01',
        last_digit_prediction: has_prediction ? String(definition.barrier) : '1',
        boolean_martingale: !!params.useMartingale,
        boolean_max_stake: has_stop_loss,
        max_stake: stop_loss,
        // `tick_count` is the accumulators sell-after-N-ticks condition, not a
        // win counter; the win count was wired to it by mistake and did nothing.
        boolean_tick_count: false,
        take_profit: String(profit_ceiling),
        profit: String(profit_ceiling),
        loss: loss_ceiling,
        boolean_profit: true,
        boolean_loss: has_stop_loss,
        boolean_stop_loss: has_stop_loss,
    };
};

export type TStoreLike = {
    dashboard?: { setBotBuilderSymbol?: (symbol: string) => void; setActiveTab?: (tab: number) => void };
    quick_strategy?: {
        setValue: (name: string, value: any) => void;
        setSelectedStrategy: (strategy: string) => void;
        setFormVisibility: (open: boolean) => void;
        onSubmit: (data: Record<string, any>) => Promise<void> | void;
    };
};

const persistFormData = (form_data: Record<string, any>, meta: TLoadMeta) => {
    try {
        const existing = JSON.parse(localStorage.getItem(QS_FIELDS_KEY) ?? '{}');
        localStorage.setItem(
            QS_FIELDS_KEY,
            JSON.stringify({ ...existing, ...form_data, [AI_SCANNER_META_KEY]: meta })
        );
    } catch {
        /* private mode / quota: the in-memory form values still apply */
    }
};

/**
 * Load a scanned strategy into the bot builder, optionally starting it.
 *
 * `run` is only ever true from an explicit user action (the parameters dialog),
 * never as a side effect of scanning.
 */
export const loadStrategyIntoBot = async (
    store: TStoreLike,
    input: {
        symbol: string;
        definition: TStrategyDefinition;
        params: TBotParams;
        meta: TLoadMeta;
        run: boolean;
    }
): Promise<void> => {
    const { quick_strategy, dashboard } = store;
    if (!quick_strategy || !dashboard) throw new Error('Bot builder is not ready yet.');

    const form_data = buildQuickStrategyFormData(
        input.symbol,
        input.definition,
        input.params,
        input.run ? 'RUN' : 'LOAD'
    );

    Object.entries(form_data).forEach(([key, value]) => quick_strategy.setValue(key, value));
    persistFormData(form_data, input.meta);

    dashboard.setBotBuilderSymbol?.(input.symbol);
    dashboard.setActiveTab?.(DBOT_TABS.BOT_BUILDER);

    // No Quick Strategy form in between: the parameters were already collected,
    // so the strategy is submitted directly (and started when action is RUN).
    quick_strategy.setSelectedStrategy(input.params.useMartingale ? 'MARTINGALE' : 'D_ALEMBERT');

    // The strategy itself has no win counter, so the number of wins asked for
    // is counted off the bot's contract stream and stops it at the target.
    if (input.run) startWinLimit(input.params.wins);
    else clearWinLimit();

    // Let the bot-builder workspace mount before the strategy XML is loaded.
    await new Promise<void>(resolve => setTimeout(resolve, 250));
    await quick_strategy.onSubmit(form_data);
};
