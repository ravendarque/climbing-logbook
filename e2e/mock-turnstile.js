// Cloudflare's real widget script sometimes hangs here and blocks page load, so stub the three methods pages call.
export async function mockTurnstile(page) {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js**", route =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.turnstile = {
          render: () => "e2e-stub-widget-id",
          getResponse: () => "e2e-stub-token",
          reset: () => {},
        };
        if (typeof window.onTurnstileLoad === "function") window.onTurnstileLoad();
      `,
    }));
}
