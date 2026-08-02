import { useEffect, useRef, useState } from 'react';
import { init, use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface StarHistoryChartProps {
    historyData: Record<string, { date: string, stars: number }[]>;
}

export default function StarHistoryChart({ historyData }: StarHistoryChartProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const [theme, setTheme] = useState('light');

    // Rebuild the chart when the color mode toggles on <html>
    useEffect(() => {
        const readTheme = () =>
            setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        readTheme();
        const observer = new MutationObserver(readTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!chartRef.current || Object.keys(historyData).length === 0) return;

        const chart = init(chartRef.current);

        // Read the theme tokens so the chart follows the light/dark palette
        const cssVar = (name: string, fallback: string) => {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || fallback;
        };
        const accent = cssVar('--color-accent', '#2E4BC6');
        const ink = cssVar('--color-ink', '#171715');
        const paper = cssVar('--color-paper', '#FAFAF8');
        const line = cssVar('--color-line', '#E5E3DC');
        const muted = cssVar('--color-pale-slate-500', '#78716C');
        const repos = Object.keys(historyData);
        if (repos.length === 0) return;

        // Use the dates from the first repo as the x-axis
        const dates = historyData[repos[0]].map(entry => entry.date);

        const series = repos.map((repo, index) => {
            // accent-led palette; the rest are mid-tones that hold up in both themes
            const colors = [accent, '#047857', '#B45309', '#7C3AED', '#DB2777'];
            const color = colors[index % colors.length];
            const name = repo.split('/').pop() || repo;

            return {
                name: name,
                type: 'line',
                smooth: true,
                symbol: 'none',
                lineStyle: {
                    width: 2,
                    color: color
                },
                itemStyle: { color },
                data: historyData[repo].map(entry => entry.stars)
            };
        });

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis' as const,
                backgroundColor: paper,
                borderColor: line,
                textStyle: { color: ink, fontFamily: 'IBM Plex Mono' },
                axisPointer: { type: 'line' as const, lineStyle: { color: line } }
            },

            legend: {
                data: repos.map(r => r.split('/').pop() || r),
                top: 0,
                textStyle: { color: muted, fontFamily: 'IBM Plex Mono', fontSize: 12 },
                icon: 'circle'
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'category' as const,
                boundaryGap: false,

                data: dates,
                axisLine: { lineStyle: { color: line } },
                axisLabel: { color: muted, fontFamily: 'IBM Plex Mono', margin: 12, formatter: (value: string) => value.substring(5) },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value' as const,
                axisLine: { show: false },

                axisLabel: { color: muted, fontFamily: 'IBM Plex Mono' },
                splitLine: { lineStyle: { color: line, type: 'dashed' as const } }
            },

            series: series
        };

        chart.setOption(option);

        const handleResize = () => chart.resize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.dispose();
        };
    }, [historyData, theme]);

    return (
        // The section around this already carries the "Star activity" heading.
        <div className="border hairline rounded-sm p-6 w-full h-[360px]">
            <div ref={chartRef} className="w-full h-full" />
        </div>
    );
}
