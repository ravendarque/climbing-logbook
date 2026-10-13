import { createReportPage } from "./report-page.js";
import { renderComboChartHtml } from "./combo-chart.js";
import {
  NO_SENDS_HAIKU,
  reportGradePoint,
  reportPositionOrder,
  volumeHeadline,
  volumeTrendInsight,
} from "../shared/volume-stats.js";
import { buildVolumeReport } from "../shared/reports.js";

createReportPage({
  view: "performance-trends",
  rootId: "trends-root",
  path: "performance/volume",
  build: buildVolumeReport,
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
    });
  },
  insights: ({ sendCounts, trend }, { type, viewScaleId }) => [
    volumeTrendInsight(trend, type, viewScaleId),
    sendCounts.some(Boolean)
      ? { tone: "neutral", text: volumeHeadline(sendCounts) }
      : { tone: "neutral", text: NO_SENDS_HAIKU, haiku: true },
  ],
});
