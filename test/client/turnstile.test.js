import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderTurnstile } from "../../client/turnstile.js";

function fakeTurnstile(token = "token") {
  return { render: vi.fn(() => "widget-1"), getResponse: vi.fn(() => token), reset: vi.fn() };
}

function containerOfWidth(width) {
  const container = document.createElement("div");
  container.id = "turnstile-widget";
  Object.defineProperty(container, "clientWidth", { value: width });
  document.body.append(container);
  return container;
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
  delete window.turnstile;
  delete window.onTurnstileLoad;
});

describe("renderTurnstile", () => {
  it("renders straight away when api.js has already run, hidden unless it needs a click", () => {
    const container = containerOfWidth(312);
    window.turnstile = fakeTurnstile();
    const widget = renderTurnstile("#turnstile-widget");

    expect(window.turnstile.render).toHaveBeenCalledWith(container, {
      sitekey: "1x00000000000000000000AA",
      appearance: "interaction-only",
      size: "normal",
    });
    expect(widget.getResponse()).toBe("token");
    expect(window.turnstile.getResponse).toHaveBeenCalledWith("widget-1");
  });

  it("uses the compact size when the normal one wouldn't fit", () => {
    containerOfWidth(262);
    window.turnstile = fakeTurnstile();
    renderTurnstile("#turnstile-widget");

    expect(window.turnstile.render.mock.calls[0][1].size).toBe("compact");
  });

  it("waits for api.js's onload callback when it hasn't run yet", () => {
    containerOfWidth(312);
    const widget = renderTurnstile("#turnstile-widget");
    expect(widget.getResponse()).toBeUndefined();

    window.turnstile = fakeTurnstile();
    window.onTurnstileLoad();

    expect(window.turnstile.render).toHaveBeenCalledOnce();
    widget.reset();
    expect(window.turnstile.reset).toHaveBeenCalledWith("widget-1");
  });

  it("waits for a check still running in the background, and gives up after ten seconds", async () => {
    vi.useFakeTimers();
    containerOfWidth(312);
    window.turnstile = fakeTurnstile("");
    const widget = renderTurnstile("#turnstile-widget");

    const pending = widget.waitForResponse();
    await vi.advanceTimersByTimeAsync(1000);
    window.turnstile.getResponse.mockReturnValue("late-token");
    await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toBe("late-token");

    window.turnstile.getResponse.mockReturnValue("");
    const abandoned = widget.waitForResponse();
    await vi.advanceTimersByTimeAsync(10_200);
    expect(await abandoned).toBe("");
  });
});
