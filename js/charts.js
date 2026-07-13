// ============================================================================
// Helpers de Chart.js
// ============================================================================
// Chart.js v4 se carga como global (window.Chart) desde el CDN en index.html.
// ============================================================================

const instances = new WeakMap();

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Destruye cualquier chart previo asociado a un <canvas> antes de recrearlo.
function reset(canvas) {
  const prev = instances.get(canvas);
  if (prev) prev.destroy();
}

// Gráfica de líneas genérica sobre un <canvas>.
// datasets: [{ label, data:[{x,y}] | [n], color, yAxisID }]
export function lineChart(canvas, { labels, datasets, height }) {
  if (!window.Chart) return null;
  reset(canvas);
  if (height) canvas.parentElement.style.height = height + "px";

  const grid = cssVar("--grid", "rgba(128,128,128,0.15)");
  const text = cssVar("--text-dim", "#8a94a6");

  const scales = { x: { grid: { color: grid }, ticks: { color: text, maxRotation: 0, autoSkip: true } } };
  const usesRightAxis = datasets.some((d) => d.yAxisID === "y1");
  scales.y = { position: "left", grid: { color: grid }, ticks: { color: text }, beginAtZero: false };
  if (usesRightAxis) {
    scales.y1 = { position: "right", grid: { drawOnChartArea: false }, ticks: { color: text }, beginAtZero: false };
  }

  const chart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.color + "22",
        borderWidth: 2,
        pointRadius: d.pointRadius ?? 2,
        pointHoverRadius: 5,
        tension: 0.25,
        fill: d.fill ?? false,
        yAxisID: d.yAxisID || "y",
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: text, boxWidth: 12, usePointStyle: true } },
        tooltip: { enabled: true },
      },
      scales,
    },
  });
  instances.set(canvas, chart);
  return chart;
}

export const CHART_COLORS = {
  weight: "#4f9cf9",
  fat: "#f97362",
  muscle: "#4fd1a1",
  water: "#5bc0de",
  volume: "#b07cf9",
  reps: "#f9b24f",
};
