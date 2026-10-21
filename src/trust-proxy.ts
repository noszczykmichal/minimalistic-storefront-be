import { BlockList, isIPv4 } from "node:net";

// Firebase Hosting rewrites reach Cloud Run from this range (seen in the
// X-Forwarded-For entries Cloud Run logs for requests from the frontend).
const firebaseHosting = new BlockList();
firebaseHosting.addSubnet("66.249.64.0", 19, "ipv4");

/**
 * Express "trust proxy" for Cloud Run, reached either directly or through a
 * Firebase Hosting rewrite. Express walks X-Forwarded-For from the right and
 * uses the first untrusted address as req.ip:
 * - hop 0 is Cloud Run's front end, which appends who connected to it;
 * - hop 1 is that address: trusted only if it's Firebase Hosting (which
 *   appended the real client). Otherwise it is the client itself, and
 *   anything to its left was made up by the client.
 */
export function cloudRunTrustProxy(addr: string, hop: number): boolean {
  if (hop === 0) {
    return true;
  }
  return hop === 1 && isIPv4(addr) && firebaseHosting.check(addr, "ipv4");
}
