import { createReportPage } from "./report-page.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { reportGradePoint, reportPositionOrder } from "../shared/volume-stats.js";
import { buildEffortReport } from "../shared/reports.js";
import { effortInsight } from "../shared/effort-stats.js";

createReportPage({
  view: "performance-rpe",
  rootId: "rpe-root",
  path: "performance/rpe",
  build: buildEffortReport,
  renderChart({ buckets, maxGradeByBucket, avgExertionByBucket }, { type, viewScaleId }) {
    return renderComboChartHtml({
      bucketLabels: buckets,
      bars: [{ label: "Avg exertion %", values: avgExertionByBucket }],
      lines: [
        {
          label: "Max grade",
          points: maxGradeByBucket.map(p => reportGradePoint(p, type, viewScaleId)),
          positionOrder: reportPositionOrder(type),
        },
      ],
    });
  },
  insights: ({ effort }, { type, viewScaleId }) => [effortInsight(effort, type, viewScaleId)],
});
