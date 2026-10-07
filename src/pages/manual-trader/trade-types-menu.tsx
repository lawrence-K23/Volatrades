/**
 * The "Trade types" picker, laid out as Deriv's is: the categories down the
 * left, a search box over a grouped list on the right.
 */
import { useMemo, useState } from 'react';
import { localize } from '@deriv-com/translations';
import {
    filterTradeTypes,
    groupTradeTypes,
    TRADE_CATEGORIES,
    type TTradeCategory,
    type TTradeType,
    type TTradeTypeId,
} from './trade-types';

const LEARN_MORE_URL = 'https://deriv.com/trade-types/options/digital-options/up-and-down/';

/** The small pair of marks each row carries, standing for its two sides. */
const SideMarks = ({ type }: { type: TTradeType }) => (
    <span className='mt-types__marks' aria-hidden='true'>
        <span className='mt-types__mark mt-types__mark--up' />
        {type.sides[1] && <span className='mt-types__mark mt-types__mark--down' />}
    </span>
);

const TradeTypesMenu = ({
    selected,
    available,
    onSelect,
    onClose,
}: {
    selected: TTradeTypeId;
    /** Contract types Deriv lists for this market, or null if not known yet. */
    available: string[] | null;
    onSelect: (id: TTradeTypeId) => void;
    onClose: () => void;
}) => {
    const [category, setCategory] = useState<TTradeCategory>('All');
    const [search, setSearch] = useState('');

    const groups = useMemo(
        () => groupTradeTypes(filterTradeTypes(category, search, available)),
        [available, category, search]
    );

    return (
        <div className='mt-types' role='dialog' aria-label={localize('Trade types')}>
            <div className='mt-types__nav'>
                <h3 className='mt-types__nav-title'>{localize('Trade types')}</h3>
                {TRADE_CATEGORIES.map(item => (
                    <button
                        key={item}
                        type='button'
                        className={`mt-types__nav-item ${
                            item === category ? 'mt-types__nav-item--active' : ''
                        }`}
                        onClick={() => setCategory(item)}
                    >
                        {localize(item)}
                    </button>
                ))}
            </div>

            <div className='mt-types__main'>
                <div className='mt-types__search'>
                    <input
                        type='search'
                        value={search}
                        placeholder={localize('Search')}
                        onChange={event => setSearch(event.target.value)}
                        aria-label={localize('Search trade types')}
                    />
                </div>

                <a className='mt-types__learn' href={LEARN_MORE_URL} target='_blank' rel='noopener noreferrer'>
                    {localize('Learn more about trade types')} <span aria-hidden='true'>›</span>
                </a>

                <div className='mt-types__list'>
                    {groups.length === 0 && (
                        <p className='mt-types__none'>{localize('Nothing matches that search.')}</p>
                    )}

                    {groups.map(({ group, types }) => (
                        <div key={group} className='mt-types__group'>
                            <h4 className='mt-types__group-title'>{localize(group)}</h4>
                            {types.map(type => (
                                <button
                                    key={type.id}
                                    type='button'
                                    className={`mt-types__item ${
                                        type.id === selected ? 'mt-types__item--active' : ''
                                    }`}
                                    onClick={() => {
                                        onSelect(type.id);
                                        onClose();
                                    }}
                                >
                                    <SideMarks type={type} />
                                    <span className='mt-types__item-label'>{localize(type.label)}</span>
                                    {!type.tradable && (
                                        <span className='mt-types__item-note'>{localize('view only')}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TradeTypesMenu;
