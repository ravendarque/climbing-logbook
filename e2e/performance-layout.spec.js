import { daysAgo, expect, test } from "./owner.js";

const REPORTS = [
  { path: "pyramid", chart: "climbing-grade-pyramid #pyramid", picker: true },
  { path: "gap", chart: "#gap-root [data-combo-chart]", picker: true },
  { path: "rpe", chart: "#rpe-root [data-combo-chart]", picker: true },
  { path: "trends", chart: "#trends-root [data-combo-chart]", picker: true },
  { path: "injury", chart: "#injury-log-empty", picker: false },
  { path: "strengths", chart: null, picker: false },
];

test("every Performance insights report has one layout: descriptions, pickers, chart, then insights (#1375)", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries: [1, 2, 3, 4, 5].map(n => ({ date: daysAgo(n * 3), grade: "6B", rpe: 60 })) });

  for (const report of REPORTS) {
    await page.goto(owner.url(`/performance/${report.path}`));
    const insights = page.locator("#report-insights");
    await expect(insights, report.path).toBeVisible();
    await expect(page.locator("#view-explainer > p"), report.path).toHaveCount(2);
    await expect(page.locator("#window-note"), report.path).toHaveCount(0);

    const order = await page.evaluate(
      ({ chart, picker }) => {
        const follows = (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
        const explainer = document.getElementById("view-explainer");
        const insightsEl = document.getElementById("report-insights");
        const scale = document.getElementById("report-grade-scale-root");
        const chartEl = chart ? document.querySelector(chart) : null;
        const checks = { explainerFirst: follows(explainer, insightsEl) !== 0 };
        if (chartEl) checks.chartBeforeInsights = follows(chartEl, insightsEl) !== 0;
        if (picker) {
          checks.pickerAfterExplainer = follows(explainer, scale) !== 0;
          checks.pickerBeforeChart = follows(scale, chartEl) !== 0;
        } else {
          checks.noPicker = scale === null;
        }
        return checks;
      },
      { chart: report.chart, picker: report.picker },
    );
    expect(Object.values(order).every(Boolean), `${report.path}: ${JSON.stringify(order)}`).toBe(true);
  }
});
