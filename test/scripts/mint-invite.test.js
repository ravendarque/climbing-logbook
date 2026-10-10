import { describe, expect, it } from "vitest";
import { mintInviteCode } from "../../scripts/mint-invite.mjs";

describe("mintInviteCode (#1073)", () => {
  it("is 128 random bits as 26 lowercase base32 characters, safe in a link", () => {
    const codes = Array.from({ length: 200 }, mintInviteCode);
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{26}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
