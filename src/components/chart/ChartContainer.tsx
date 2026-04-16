import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts'
import { useChartStore } from '@/store/chartStore'
import { ChartLoadingOverlay } from './ChartLoadingOverlay'
import type { Candle } from '@/types/candle'

function candleToChartData(c: Candle): CandlestickData {
  return {
    time: c.time as Time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }
}

export function ChartContainer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  const candles = useChartStore((s) => s.candles)
  const isLoading = useChartStore((s) => s.isLoading)

  // Initialize chart once on mount — cleanup on unmount handles React StrictMode double-invoke
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d1117' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: {
        vertLine: { color: '#444c56' },
        horzLine: { color: '#444c56' },
      },
      rightPriceScale: {
        borderColor: '#30363d',
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: 480,
    })

    // v5 API: addSeries(SeriesDefinition, options)
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    chartRef.current = chart
    seriesRef.current = series

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth })
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  // Update series when candles change
  useEffect(() => {
    const series = seriesRef.current
    if (series === null || candles.length === 0) return
    // lightweight-charts requires strictly ascending `time`.
    // Sort defensively in case the API ever returns non-monotonic klines.
    const sortedCandles = [...candles].sort((a, b) => a.time - b.time)
    series.setData(sortedCandles.map(candleToChartData))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return (
    <div className="relative bg-panel-bg border border-panel-border rounded-lg overflow-hidden">
      {isLoading && <ChartLoadingOverlay />}
      <div ref={containerRef} className="w-full" />
    </div>
  )
}
