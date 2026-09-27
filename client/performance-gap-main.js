import { createReportPage } from "./report-page.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { flashLabel, sendLabel } from "./status.js";
import { reportGradePoint, reportPositionOrder } from "../shared/volume-stats.js";
import { gapHeadline } from "../shared/gap-stats.js";

createReportPage({
  view: "performance-gap",
  rootId: "gap-root",
  endpoint: "/-/api/performance/gap",
  demoPath: "performance/gap",
  renderChart({ buckets, flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket }, { type, viewScaleId }) {
    const positionOrder = reportPositionOrder(type);
    return renderComboChartHtml({
      bucketLabels: buckets,
      bars: [{ label: "Avg attempts to send", values: avgAttemptsByBucket }],
      lines: [
        {
          label: flashLabel(type),
          points: flashMaxByBucket.map(p => reportGradePoint(p, type, viewScaleId)),
          positionOrder,
        },
        {
          label: sendLabel(type),
          points: sendMaxByBucket.map(p => reportGradePoint(p, type, viewScaleId)),
          positionOrder,
        },
      ],
      // Recomputed so the headline follows the chosen scale, like the chart.
      headline: gapHeadline(flashMaxByBucket, sendMaxByBucket, type, viewScaleId),
    });
  },
});
