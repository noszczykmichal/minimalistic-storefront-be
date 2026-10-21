import { cloudRunTrustProxy } from "@/trust-proxy.js";

describe("cloudRunTrustProxy", () => {
  it("always trusts Cloud Run's front end (hop 0)", () => {
    expect(cloudRunTrustProxy("169.254.1.1", 0)).toBe(true);
  });

  it.each(["66.249.64.0", "66.249.93.132", "66.249.95.255"])(
    "trusts Firebase Hosting at hop 1 (%s)",
    (addr) => {
      expect(cloudRunTrustProxy(addr, 1)).toBe(true);
    },
  );

  it.each(["89.66.224.41", "66.249.63.255", "66.249.96.0", "::1", "unknown"])(
    "does not trust other addresses at hop 1 (%s)",
    (addr) => {
      expect(cloudRunTrustProxy(addr, 1)).toBe(false);
    },
  );

  it("never trusts hop 2 or further, even with a Firebase address", () => {
    expect(cloudRunTrustProxy("66.249.93.132", 2)).toBe(false);
  });
});
