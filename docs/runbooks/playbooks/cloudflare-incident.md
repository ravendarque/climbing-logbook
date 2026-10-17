# Cloudflare incident

**Detect:** errors across every route at once with no deploy; `https://www.cloudflarestatus.com/` lists an incident for Workers, D1 or the network.

**Mitigate:** nothing in this repo fixes it. Post on the status page, link Cloudflare's incident, and wait. The app keeps working offline on people's devices, and queued climbs sync once Cloudflare recovers. Afterwards, check Workers Issues for anything that started during the incident and didn't stop.
