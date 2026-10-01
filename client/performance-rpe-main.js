import { createReportPage } from "./report-page.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { reportGradePoint, reportPositionOrder } from "../shared/volume-stats.js";
import { buildEffortReport } from "../shared/reports.js";

createReportPage({
  view: "performance-rpe",
  rootId: "rpe-root",
  path: "performance/rpe",
  build: buildEffortReport,
  renderChart({ buckets, maxGradeByBucket, avgExertionByBucket, headline }, { type, viewScaleId }) {
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
      headline: headline ?? "Not enough data yet for a reliable read -- log a few more sends and check back.",
    });
  },
});
