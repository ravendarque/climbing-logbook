import { createReportPage } from "./report-page.js";
import { renderComboChartHtml } from "./combo-chart.js";
import { reportGradePoint, reportPositionOrder, volumeHeadline } from "../shared/volume-stats.js";

createReportPage({
  view: "performance-trends",
  rootId: "trends-root",
  endpoint: "/-/api/performance/volume",
  demoPath: "performance/volume",
  renderChart({ buckets, sendCounts, maxGradeByBucket }, { type, viewScaleId }) {
    return renderComboChartHtml({
      bucketLabels: buckets,
      bars: [{ label: "Sends", values: sendCounts }],
      lines: [
        {
          label: "Max grade",
          points: maxGradeByBucket.map(p => reportGradePoint(p, type, viewScaleId)),
          positionOrder: reportPositionOrder(type),
        },
      ],
      headline: volumeHeadline(sendCounts),
    });
  },
});
