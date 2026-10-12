// The daemon timeouts: the original's defaults, ranges, and the rule that a
// connect timeout of zero means the HTTP timeout rather than no limit.
import {
  clampConnectTimeout,
  clampHttpTimeout,
  effectiveConnectTimeout,
  CONNECT_TIMEOUT_DEFAULT,
  HTTP_TIMEOUT_DEFAULT,
  HTTP_TIMEOUT_MAX,
  HTTP_TIMEOUT_MIN,
} from "../src/netTimeouts.ts";

let n = 0;
function check(what: string, ok: boolean, detail = "") {
  n++;
  if (!ok) {
    console.error(`FAIL ${what} ${detail}`);
    process.exit(1);
  }
}

// The HTTP timeout: 30 seconds by default, and anything outside 2..999 falls
// back rather than being taken literally (the original's own bounds).
check("the default is kept", clampHttpTimeout(HTTP_TIMEOUT_DEFAULT) === 30);
check("a legal value is kept", clampHttpTimeout(45) === 45);
check("the low end is legal", clampHttpTimeout(HTTP_TIMEOUT_MIN) === HTTP_TIMEOUT_MIN);
check("the high end is legal", clampHttpTimeout(HTTP_TIMEOUT_MAX) === HTTP_TIMEOUT_MAX);
check("too small falls back", clampHttpTimeout(1) === HTTP_TIMEOUT_DEFAULT);
check("too large falls back", clampHttpTimeout(1000) === HTTP_TIMEOUT_DEFAULT);
check("zero falls back", clampHttpTimeout(0) === HTTP_TIMEOUT_DEFAULT);
check("a fraction is a whole second", clampHttpTimeout(12.9) === 12);
check("an unusable value falls back", clampHttpTimeout(NaN) === HTTP_TIMEOUT_DEFAULT);

// The connect timeout: 0 by default, and 0 is legal and meaningful.
check("the default is zero", clampConnectTimeout(CONNECT_TIMEOUT_DEFAULT) === 0);
check("zero stays zero", clampConnectTimeout(0) === 0);
check("a legal value is kept", clampConnectTimeout(5) === 5);
check("negative falls back", clampConnectTimeout(-1) === CONNECT_TIMEOUT_DEFAULT);
check("too large falls back", clampConnectTimeout(1000) === CONNECT_TIMEOUT_DEFAULT);

// The rule that makes the two different settings: an unset connect timeout
// borrows the HTTP one, so a machine that only set the HTTP timeout still gets
// a cancellable handshake.
check("zero borrows the HTTP timeout", effectiveConnectTimeout(0, 20) === 20);
check("zero borrows the default when that is unset too", effectiveConnectTimeout(0, 7) === 7);
check("a set value is used as it is", effectiveConnectTimeout(5, 20) === 5);
check("an out-of-range connect timeout borrows as well", effectiveConnectTimeout(99999, 20) === 20);

console.log(`netTimeouts: ${n} assertions passed`);
