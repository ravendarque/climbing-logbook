import { Resend } from "resend";

// Transactional email (#308) -- signup verification + password reset, the
// only two email-sending needs Better Auth's config (src/lib/auth.js)
// actually calls into. A factory (not a module-scope singleton), same
// reasoning as createAuth(env) itself -- env.RESEND_API_KEY only exists
// inside a request's fetch() call.
//
// FROM_ADDRESS uses Resend's own sandbox sender (no domain verification
// needed) until a real domain is verified in Resend's own dashboard -- see
// docs/infra-architecture.md's "Required secrets/variables" table for what
// production actually needs before this can send from a real address.
const FROM_ADDRESS = "climbing-logbook <onboarding@resend.dev>";

export function createEmailSender(env) {
  const resend = new Resend(env.RESEND_API_KEY);
  return {
    sendVerificationEmail(to, url) {
      return resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: "Verify your email",
        html: `<p>Click the link below to verify your email address.</p><p><a href="${url}">${url}</a></p>`,
      });
    },
    sendPasswordResetEmail(to, url) {
      return resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: "Reset your password",
        html: `<p>Click the link below to reset your password. If you didn't request this, you can ignore this email.</p><p><a href="${url}">${url}</a></p>`,
      });
    },
  };
}
