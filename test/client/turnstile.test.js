import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTurnstile } from "../../client/turnstile.js";

function fakeTurnstile() {
  return { render: vi.fn(() => "widget-1"), getResponse: vi.fn(() => "token"), reset: vi.fn() };
}

afterEach(() => {
  delete window.turnstile;
  delete window.onTurnstileLoad;
});

describe("renderTurnstile", () => {
  it("renders straight away when api.js has already run", () => {
    window.turnstile = fakeTurnstile();
    const widget = renderTurnstile("#turnstile-widget");

    expect(window.turnstile.render).toHaveBeenCalledWith("#turnstile-widget", { sitekey: "1x00000000000000000000AA" });
    expect(widget.getResponse()).toBe("token");
    expect(window.turnstile.getResponse).toHaveBeenCalledWith("widget-1");
  });

  it("waits for api.js's onload callback when it hasn't run yet", () => {
    const widget = renderTurnstile("#turnstile-widget");
    expect(widget.getResponse()).toBeUndefined();

    window.turnstile = fakeTurnstile();
    window.onTurnstileLoad();

    expect(window.turnstile.render).toHaveBeenCalledOnce();
    widget.reset();
    expect(window.turnstile.reset).toHaveBeenCalledWith("widget-1");
  });
});
