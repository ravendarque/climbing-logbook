// #997 -- the username policy: reserved names, their lookalikes, authority
// words and the brand are rejected; innocent near-misses are not.
import { describe, expect, it } from "vitest";
import { checkUsername, skeletons } from "../../shared/username-policy.js";
import { AUTHORITY_TOKENS, RESERVED_USERNAMES } from "../../shared/reserved-usernames.js";

const reason = name => checkUsername(name).reason;

describe("skeletons", () => {
  it("drops separators, reads leet digits and letter-pair lookalikes", () => {
    expect(skeletons("h.e_l.p")).toEqual(["help"]);
    expect(skeletons("l0g1n")).toEqual(["login", "logln"]);
    expect(skeletons("rnod")).toEqual(["mod"]);
    expect(skeletons("vvww")).toEqual(["www"]);
  });
});

describe("checkUsername", () => {
  it("rejects anything outside the format, including a hyphen (#983)", () => {
    for (const name of ["", "Raven", "a-b", "-", "service-worker.js", "émile", "a".repeat(31)]) {
      expect(reason(name), name).toBe("format");
    }
  });

  it("rejects the demo accounts' names (#251)", () => {
    expect(reason("beginnerdemo")).toBe("demo");
  });

  it("rejects every reserved name as written", () => {
    for (const name of RESERVED_USERNAMES) expect(checkUsername(name).ok, name).toBe(false);
  });

  it("rejects lookalikes of reserved names", () => {
    for (const name of ["he1p", "h.e.l.p", "help_", "l0gin", "log_in", "1ogin", "reg1ster", "4dmin", "0fficial", "rnod", "5upport", "ap1", "w.w.w"]) {
      expect(reason(name), name).toBe("reserved");
    }
  });

  it("rejects an authority word as any one part of a name", () => {
    for (const name of ["admin_raven", "raven.support", "the.official.page", "adm1n.tom", "mod_team_x", "staff.climber"]) {
      expect(reason(name), name).toBe("authority");
    }
    for (const token of AUTHORITY_TOKENS) expect(reason(`raven_${token}`), token).toBe("authority");
  });

  it("rejects the brand anywhere in a name", () => {
    for (const name of ["the_climbinglogbook", "climbing.logbook.fan", "cl1mbinglogbookfan", "climbinglogbookhq"]) {
      expect(reason(name), name).toBe("brand");
    }
  });

  it("accepts innocent near-misses", () => {
    for (const name of [
      "ravendarque", "a", "user.name", "user_name_1", "sw.js",
      "badmintonfan", "supportertom", "helper", "helpful_hannah", "logan", "loggin",
      "adminton", "moderato", "climber", "climbing_raven", "logbook_fan", "mods_rock_fan",
      "intermediate", "sam_5", "tom88",
    ]) {
      expect(checkUsername(name), name).toEqual({ ok: true });
    }
  });
});
