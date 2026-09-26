// Shared partials say /help/; on my. and beta. these point at the apex (else the 301 costs a hop).
import { resolveApexUrl } from "./resolve-cross-hostname-url.js";

// Root-relative only, so already-absolute links and "#" are left alone; safe to run twice.
export function pointApexLinksAtApex(root = document, hostname = location.hostname) {
  for (const link of root.querySelectorAll("a[data-apex-link]")) {
    const href = link.getAttribute("href");
    if (href?.startsWith("/")) link.href = resolveApexUrl(hostname, href);
  }
}
