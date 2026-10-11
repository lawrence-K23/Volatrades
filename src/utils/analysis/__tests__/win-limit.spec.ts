import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { clearWinLimit, startWinLimit } from '../win-limit';

const settled = (contract_id: string, profit: number) => ({
    contract_id,
    is_sold: 1,
    profit,
});

describe('startWinLimit', () => {
    let stops: number;
    const countStop = () => {
        stops += 1;
    };

    beforeEach(() => {
        stops = 0;
        globalObserver.register('bot.click_stop', countStop);
    });

    afterEach(() => {
        clearWinLimit();
        globalObserver.unregister('bot.click_stop', countStop);
    });

    it('stops the bot on the winning contract that reaches the target', () => {
        startWinLimit(3);

        globalObserver.emit('bot.contract', settled('1', 0.95));
        globalObserver.emit('bot.contract', settled('2', 0.95));
        expect(stops).toBe(0);

        globalObserver.emit('bot.contract', settled('3', 0.95));
        expect(stops).toBe(1);
    });

    it('does not stop on the first win when more are asked for', () => {
        startWinLimit(2);

        globalObserver.emit('bot.contract', settled('1', 0.95));

        expect(stops).toBe(0);
    });

    it('counts a contract once, however many updates it sends', () => {
        startWinLimit(2);

        globalObserver.emit('bot.contract', settled('1', 0.95));
        globalObserver.emit('bot.contract', settled('1', 0.95));
        globalObserver.emit('bot.contract', settled('1', 0.95));

        expect(stops).toBe(0);
    });

    it('ignores contracts that are still running', () => {
        startWinLimit(1);

        globalObserver.emit('bot.contract', { contract_id: '1', is_sold: 0, profit: 0.95 });

        expect(stops).toBe(0);
    });

    it('does not count losses towards the target', () => {
        startWinLimit(2);

        globalObserver.emit('bot.contract', settled('1', -0.5));
        globalObserver.emit('bot.contract', settled('2', -0.5));
        globalObserver.emit('bot.contract', settled('3', 0.95));
        expect(stops).toBe(0);

        globalObserver.emit('bot.contract', settled('4', 0.95));
        expect(stops).toBe(1);
    });

    it('treats a target of zero as no limit', () => {
        startWinLimit(0);

        globalObserver.emit('bot.contract', settled('1', 0.95));
        globalObserver.emit('bot.contract', settled('2', 0.95));

        expect(stops).toBe(0);
    });

    it('stops watching once the bot has stopped', () => {
        startWinLimit(1);
        globalObserver.emit('bot.stop', {});

        globalObserver.emit('bot.contract', settled('1', 0.95));

        expect(stops).toBe(0);
    });

    it('asks to stop only once', () => {
        startWinLimit(1);

        globalObserver.emit('bot.contract', settled('1', 0.95));
        globalObserver.emit('bot.contract', settled('2', 0.95));

        expect(stops).toBe(1);
    });

    it('starts a fresh count when a new run begins', () => {
        startWinLimit(2);
        globalObserver.emit('bot.contract', settled('1', 0.95));

        startWinLimit(2);
        globalObserver.emit('bot.contract', settled('2', 0.95));
        expect(stops).toBe(0);

        globalObserver.emit('bot.contract', settled('3', 0.95));
        expect(stops).toBe(1);
    });
});
