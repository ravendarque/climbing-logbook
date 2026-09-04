// #376/#251 -- Turnstile's real widget script loads (async) from
// Cloudflare's own CDN with no test-time mock; a real, previously-
// observed source of flake (2026-08-07, across 5 full e2e runs: one
// page.goto() itself timed out waiting for `load`, root-caused to that
// async script fetch occasionally hanging rather than failing fast
// against challenges.cloudflare.com from this environment). Intercepted
// and stubbed here instead of letting the real network request happen at
// all. Mirrors exactly what public/register/register.js's own
// onTurnstileLoad callback needs: window.turnstile.render()/getResponse()/
// reset() (the same three methods that file calls), and the onload
// query-param convention Cloudflare's real script also follows (invoking
// window[onload] once ready) -- register.js's own #turnstile-widget
// render call and any caller's own getResponse() wait both still
// exercise the exact same code paths they did against the real widget,
// just without the real network dependency.
//
// Extracted from e2e/register.spec.js (#251) once a second, unrelated
// spec (e2e/climbing-header.spec.js's own "renders on /register/"
// presence check) hit the identical page.goto() timeout despite never
// submitting the form or needing a real token -- the widget script's
// mere presence on the page is what page.goto()'s default `load` wait
// condition blocks on, not anything about form submission specifically.
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
