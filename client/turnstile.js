// infra.yml rewrites REAL_SITEKEY from Terraform's output after an apply.
const REAL_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
// Cloudflare's always-passes test key, for hosts the real widget isn't registered on.
const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL_SITEKEY_HOSTNAMES = ["climbinglogbook.com", "beta.climbinglogbook.com"];

function turnstileSitekey(hostname) {
  return REAL_SITEKEY_HOSTNAMES.includes(hostname) ? REAL_SITEKEY : TEST_SITEKEY;
}

const NORMAL_WIDTH = 300;
const RESPONSE_WAIT_MS = 10_000;

// Hidden unless the check needs a click; api.js is async and may run before this module.
export function renderTurnstile(selector) {
  let widgetId;
  const render = () => {
    const container = document.querySelector(selector);
    widgetId = window.turnstile.render(container, {
      sitekey: turnstileSitekey(window.location.hostname),
      appearance: "interaction-only",
      size: container.clientWidth < NORMAL_WIDTH ? "compact" : "normal",
    });
  };
  if (window.turnstile) render();
  else window.onTurnstileLoad = render;

  const getResponse = () => window.turnstile?.getResponse(widgetId);
  return {
    getResponse,
    waitForResponse: async () => {
      const deadline = Date.now() + RESPONSE_WAIT_MS;
      while (!getResponse() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
      return getResponse();
    },
    reset: () => window.turnstile?.reset(widgetId),
  };
}
