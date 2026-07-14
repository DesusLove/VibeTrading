import { useEffect, useRef } from "react";
import i18n from "@/i18n";
import { echarts } from "@/lib/echarts";
import { getChartTheme } from "@/lib/chart-theme";

interface Props {
  labels: string[];
  matrix: number[][];
  height?: number;
}

function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return "#888";
  let [h, s, l] = parts;
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function CorrelationMatrix({ labels, matrix, height = 500 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || labels.length === 0 || matrix.length === 0) return;

    const t = getChartTheme();
    const chart = echarts.init(ref.current);

    // Build heatmap data: [xIdx, yIdx, value]
    const data: [number, number, number][] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < labels.length; j++) {
        const val = matrix[i]?.[j] ?? 0;
        data.push([j, i, parseFloat(val.toFixed(4))]);
      }
    }

    const minVal = -1;
    const maxVal = 1;

    // Teal-positive → neutral → amber-negative diverging scale
    const pos = getComputedStyle(document.documentElement).getPropertyValue("--accent-primary").trim() || "186 55% 40%";
    const neg = getComputedStyle(document.documentElement).getPropertyValue("--warning").trim() || "38 85% 50%";
    const posHex = hslToHex(pos);
    const negHex = hslToHex(neg);

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        position: "top",
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
        formatter: (params: unknown) => {
          const p = params as { data: [number, number, number] };
          const [x, y, v] = p.data;
          return `<b>${labels[x]}</b> vs <b>${labels[y]}</b><br/>r = <b>${v.toFixed(4)}</b>`;
        },
      },
      grid: { left: "3%", right: "8%", top: "8%", bottom: "14%", containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          color: t.textColor,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          rotate: 30,
          interval: 0,
        },
        axisLine: { lineStyle: { color: t.axisColor } },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          color: t.textColor,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          interval: 0,
        },
        axisLine: { lineStyle: { color: t.axisColor } },
        splitArea: { show: false },
      },
      visualMap: {
        min: minVal,
        max: maxVal,
        precision: 2,
        calculable: true,
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: { color: t.textColor, fontFamily: "JetBrains Mono, monospace", fontSize: 10 },
        inRange: {
          color: [negHex, "#f5f0e8", posHex],
        },
      },
      series: [
        {
          name: "Correlation",
          type: "heatmap",
          data,
          label: {
            show: labels.length <= 8,
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            color: t.textColor,
            formatter: (params: unknown) => {
              const p = params as { value: [number, number, number] };
              return p.value[2].toFixed(2);
            },
          },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.5)" },
          },
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current!);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [labels, matrix]);

  if (labels.length === 0) {
    return <div className="text-text-secondary text-xs p-4">{i18n.t("charts.noCorrelationData")}</div>;
  }
  return <div ref={ref} style={{ height }} />;
}