/**
 * "Number of wins" for a scanned strategy.
 *
 * The quick strategies the scanner loads stop on a profit or loss threshold -
 * they have no notion of a win count. Expressing a win count as a profit
 * target cannot work: a digit-matches contract pays about eight times the
 * stake and an even/odd one about 0.95, so any single number is either hit on
 * the first win or never. So the wins are counted here, off the bot's own
 * contract stream, and the bot is asked to stop once the target is reached.
 */
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';

let teardown: (() => void) | null = null;

/** Stop watching. Safe to call when nothing is being watched. */
export const clearWinLimit = (): void => {
    teardown?.();
    teardown = null;
};

/**
 * Stop the bot after `target_wins` winning contracts. A target of zero or less
 * means no limit, which leaves the stop loss as the only brake.
 */
export const startWinLimit = (target_wins: number): void => {
    clearWinLimit();

    const target = Math.trunc(Number(target_wins));
    if (!Number.isFinite(target) || target <= 0) return;

    // A contract is reported more than once as it runs, so each one is counted
    // at most once, by its id.
    const settled = new Set<string>();
    let wins = 0;

    const onContract = (contract: any) => {
        if (!contract?.is_sold) return;

        const id = String(contract.contract_id ?? '');
        if (!id || settled.has(id)) return;
        settled.add(id);

        if (Number(contract.profit ?? 0) <= 0) return;
        wins += 1;
        if (wins < target) return;

        globalObserver.emit('ui.log.success', {
            log_type: 'info',
            extra: { message: `Scanner target reached: ${wins} of ${target} wins. Stopping.` },
        });
        // The run panel's own stop, so the bot winds down the way it does when
        // the stop button is pressed - open contracts are still followed.
        globalObserver.emit('bot.click_stop');
        clearWinLimit();
    };

    const onStop = () => clearWinLimit();

    globalObserver.register('bot.contract', onContract);
    globalObserver.register('bot.stop', onStop);

    teardown = () => {
        globalObserver.unregister('bot.contract', onContract);
        globalObserver.unregister('bot.stop', onStop);
    };
};
