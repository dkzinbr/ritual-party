// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { deleteCookie, getCookie, loadBackupCookie, saveBackupCookie, setCookie } from "../src/cookies.ts";

function clearAllCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

beforeEach(() => {
  clearAllCookies();
});

describe("cookies", () => {
  it("stores, reads and deletes a value", () => {
    setCookie("ritual-party-token", "abc123");
    expect(getCookie("ritual-party-token")).toBe("abc123");
    deleteCookie("ritual-party-token");
    expect(getCookie("ritual-party-token")).toBeNull();
  });

  it("encodes special characters", () => {
    setCookie("nome", "Kimiya; Zero = Ordem");
    expect(getCookie("nome")).toBe("Kimiya; Zero = Ordem");
  });

  it("returns null for cookies that were never set", () => {
    expect(getCookie("missing")).toBeNull();
  });
});

describe("offline backup in cookies", () => {
  it("returns null when there is no backup", () => {
    expect(loadBackupCookie()).toBeNull();
  });

  it("round-trips a payload split across several cookies", () => {
    const payload = JSON.stringify({ guests: Array.from({ length: 200 }, (_, i) => ({ name: `Agente ${i}`, bringing: "Pão de alho" })) });
    expect(payload.length).toBeGreaterThan(3200);
    saveBackupCookie(payload);
    expect(Number(getCookie("rp_bak_n"))).toBeGreaterThan(1);
    expect(loadBackupCookie()).toBe(payload);
  });

  it("replaces a larger previous backup with a smaller one", () => {
    saveBackupCookie("x".repeat(9000));
    saveBackupCookie("small");
    expect(getCookie("rp_bak_n")).toBe("1");
    expect(getCookie("rp_bak_1")).toBeNull();
    expect(loadBackupCookie()).toBe("small");
  });

  it("keeps the previous backup when a new one is too big for 20 cookies", () => {
    saveBackupCookie("small");
    saveBackupCookie("x".repeat(3200 * 21));
    expect(loadBackupCookie()).toBe("small");
  });

  it("returns null when a chunk is missing", () => {
    saveBackupCookie("y".repeat(7000));
    deleteCookie("rp_bak_1");
    expect(loadBackupCookie()).toBeNull();
  });
});
