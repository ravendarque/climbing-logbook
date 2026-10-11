// The Worker checks Turnstile and the per-address limit before Better Auth sends anything (#1053, #1335).
export async function resendVerificationEmail(email, turnstile) {
  try {
    const turnstileToken = await turnstile.waitForResponse();
    if (!turnstileToken) return { ok: false, message: "Please complete the verification check, then try again." };
    const res = await fetch("/-/api/auth/send-verification-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, turnstileToken }),
    });
    if (res.ok) {
      return {
        ok: true,
        message: "If that address is waiting to be verified, we've sent a new link. It can take a few minutes.",
      };
    }
    const data = await res.json().catch(() => null);
    return { ok: false, message: data?.message || `Couldn't send the email (${res.status}).` };
  } catch {
    return { ok: false, message: "Network error -- check your connection and try again." };
  } finally {
    turnstile.reset();
  }
}
