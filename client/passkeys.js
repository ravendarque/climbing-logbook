const BASE = "/-/api/auth/passkey";

export function passkeysSupported() {
  return (
    typeof PublicKeyCredential === "function" &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.prototype.toJSON === "function"
  );
}

export async function passkeyAutofillAvailable() {
  return passkeysSupported() && !!(await PublicKeyCredential.isConditionalMediationAvailable?.());
}

async function request(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.message || `Request failed (${res.status}).`), { code: data?.code });
  return data;
}

const post = (path, body) =>
  request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// The browser's own cancel or timeout, which needs no error shown.
export const isCancelled = err => err?.name === "NotAllowedError" || err?.name === "AbortError";

export async function signInWithPasskey({ autofill = false, signal } = {}) {
  const options = await request("/generate-authenticate-options");
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON({ ...options, userVerification: "required" });
  const credential = await navigator.credentials.get({
    publicKey,
    signal,
    ...(autofill ? { mediation: "conditional" } : {}),
  });
  const { user } = await post("/verify-authentication", { response: credential.toJSON() });
  return user;
}

export async function addPasskey(name) {
  const options = await request(`/generate-register-options?name=${encodeURIComponent(name)}`);
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(options);
  const credential = await navigator.credentials.create({ publicKey });
  return post("/verify-registration", { response: credential.toJSON(), name });
}

export const listPasskeys = () => request("/list-user-passkeys");
export const renamePasskey = (id, name) => post("/update-passkey", { id, name });
export const removePasskey = id => post("/delete-passkey", { id });
