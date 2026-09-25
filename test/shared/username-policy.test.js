// #997 -- the username policy: reserved names, their lookalikes, authority
// words and the brand are rejected; innocent near-misses are not.
import { describe, expect, it } from "vitest";
import { checkUsername, skeletons } from "../../shared/username-policy.js";
import { AUTHORITY_TOKENS, RESERVED_USERNAMES } from "../../shared/reserved-usernames.js";
import { EXTRA_PATTERNS, OBSCENITY_PHRASES, RAW_TERMS } from "../../shared/blocked-username-terms.js";

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

  // #997 phase 2 -- slurs and hate speech only (Raven, 2026-09-25).
  describe("slurs and hate speech", () => {
    it("rejects every listed phrase as written", () => {
      for (const word of [...OBSCENITY_PHRASES, ...Object.keys(EXTRA_PATTERNS), ...RAW_TERMS]) {
        expect(reason(word), word).toBe("hate");
      }
    });

    it("sees through leet, repeated letters and separators", () => {
      for (const name of ["n1gger", "niiigger", "kike_hater", "tr4nny", "h1tler_fan", "heil.hitler", "white_power", "whitepride88", "towel_head", "fourteen_words", "raven_spic", "wolf1488", "14.88", "the14words", "kkk_member", "shem_ale"]) {
        expect(reason(name), name).toBe("hate");
      }
    });

    it("accepts innocent names that share letters with a listed term", () => {
      for (const name of [
        "grape_vine", "therapist", "scrape", "negroni", "montenegro", "nigeria", "sniggering",
        "spicy", "spice.girl", "raccoon", "tycoon", "cocoon", "pakistan", "wogan", "woggle",
        "gookie", "beanery", "abode", "about_time", "vandyke", "fagus", "retardant", "trans_climber",
        "tomwhite", "power_climber", "pride_climber", "con_man",
      ]) {
        expect(checkUsername(name), name).toEqual({ ok: true });
      }
    });

    it("doesn't block 88 or 14 on their own: mostly birth years and grades", () => {
      for (const name of ["tom88", "climber14", "v14_crusher", "1988"]) expect(checkUsername(name), name).toEqual({ ok: true });
    });
  });
});
