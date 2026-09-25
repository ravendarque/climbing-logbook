// #985 -- links from an app page (my./beta.) to the apex's own pages, such
// as /help/. The partials that carry them (footer, menus) are built once
// for every host, so the markup says /help/ and each such link is marked
// data-apex-link; this points them at the apex at runtime. Without it they
// still work, via the app hosts' 301 to the apex (infra/tls-hardening.tf),
// just with an extra hop. On the apex, local dev and PR previews the
// links stay as they are.
import { resolveApexUrl } from "./resolve-cross-hostname-url.js";

// Only root-relative hrefs are rewritten, so a link that's already absolute
// (set by its own code with resolveApexUrl) or a placeholder ("#") is left
// alone, and running this twice changes nothing.
export function pointApexLinksAtApex(root = document, hostname = location.hostname) {
  for (const link of root.querySelectorAll("a[data-apex-link]")) {
    const href = link.getAttribute("href");
    if (href?.startsWith("/")) link.href = resolveApexUrl(hostname, href);
  }
}
