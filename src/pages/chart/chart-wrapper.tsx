// Removed unused React import - React 17+ JSX transform doesn't require it
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/hooks/useStore';
import Chart, { type TChartBarrier, type TChartMarker } from './chart';
import './chart.scss';

interface ChartWrapperProps {
    prefix?: string;
    show_digits_stats: boolean;
    /** Lines to draw over the chart, e.g. an accumulator's band. */
    barriers?: TChartBarrier[];
    /** Contract markers, e.g. an accumulator's range as DTrader draws it. */
    contracts_array?: TChartMarker[];
    is_accumulator?: boolean;
}

const ChartWrapper = observer(
    ({ prefix = 'chart', show_digits_stats, barriers, contracts_array, is_accumulator }: ChartWrapperProps) => {
        const { client } = useStore();
        const [uuid] = useState(uuidv4());

        const uniqueKey = client.loginid ? `${prefix}-${client.loginid}` : `${prefix}-${uuid}`;

        return (
            <Chart
                key={uniqueKey}
                show_digits_stats={show_digits_stats}
                barriers={barriers}
                contracts_array={contracts_array}
                is_accumulator={is_accumulator}
            />
        );
    }
);

export default ChartWrapper;
