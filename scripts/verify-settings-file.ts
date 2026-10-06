/**
 * One-time verification for the settings export/import round trip.
 *
 * Run:  node scripts/verify-settings-file.ts
 *
 * src/settingsFile.ts uses extensionless relative imports (the bundler
 * convention used across src/), which plain Node cannot resolve. A one-line
 * resolve hook is registered here so Node's own type-stripping can load the
 * real module — no build step, no extra dependency. This module is deliberately
 * kept free of src/settings.ts at load time (that one pulls in
 * tauri-plugin-store), so the same code the app ships is what gets exercised.
 */
import { register } from "node:module";

const hook = `export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\\.[a-zA-Z]+$/.test(specifier)) {
    try { return await nextResolve(specifier + ".ts", context); } catch {}
  }
  return nextResolve(specifier, context);
}`;
register("data:text/javascript," + encodeURIComponent(hook));

const {
  buildSettingsFile,
  parseSettingsFile,
  SETTINGS_FILE_VERSION,
  SETTINGS_FILE_APP,
} = await import("../src/settingsFile.ts");
const { DEFAULT_STATUS_BAR_FIELDS, DEFAULT_HIDDEN_REFRESH, DEFAULT_VIEW_OPTIONS, DEFAULT_SMOOTH_SPEEDS, DEFAULT_TRAY_ALWAYS_VISIBLE } =
  await import("../src/settingsFile.ts");

let passed = 0;
const failures: string[] = [];

function check(cond: boolean, label: string, detail = ""): void {
  if (cond) passed++;
  else failures.push(label + (detail ? `\n    ${detail}` : ""));
}
function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, label, `expected ${e}\n    actual   ${a}`);
}

console.log(`settings file version = ${SETTINGS_FILE_VERSION}`);

// --- the simulated local store: a full connection with a real password ------
const fullForm = {
  host: "nas.local",
  port: "9091",
  path: "/transmission/rpc",
  username: "alice",
  password: "s3cr3t-PASSWORD-must-not-leak",
  https: true,
  acceptInvalid: true,
  clientCert: "/home/alice/cert.pem",
  clientKey: "/home/alice/key.pem",
};

// Non-default values for every preference, so a dropped field is visible.
const settings = {
  form: fullForm,
  servers: [{ id: "srv_1", name: "nas", form: fullForm }],
  locale: "zh-CN",
  columns: ["name", "size", "eta"],
  notifyOnComplete: false,
  pathMap: [{ remote: "/downloads", local: "/Volumes/media" }],
  uiFontSize: "large",
  statusBarFields: { total: true, shown: false, selected: true, updated: false, hint: true, doubleClick: false },
  hiddenRefresh: { enabled: true, seconds: 42 },
  minimizeToTray: false,
  viewOptions: { toolbar: false, filterPane: true, details: false, statusBar: true, bigToolbar: true },
  clipboardAutoAdd: true,
  smoothSpeeds: true,
  trayAlwaysVisible: false,
};

// (1) the store really does hold a password — the point is that the export
// drops it, not that there was nothing to drop.
check(
  JSON.stringify(settings).includes('"password"'),
  "precondition: the simulated store contains a password",
);

const file = buildSettingsFile(settings as never, new Date("2020-01-01T00:00:00Z"));
const text = JSON.stringify(file);
const pretty = JSON.stringify(file, null, 2);

// (1a) password never appears, anywhere (top-level, servers, client fields).
eq(text.match(/password/gi)?.length ?? 0, 0, "exported file mentions no password (compact)");
eq(pretty.match(/password/gi)?.length ?? 0, 0, "exported file mentions no password (pretty)");
check(!("password" in (file.form as object)), "exported form has no password key");
check(!("password" in (file.servers[0].form as object)), "exported server form has no password key");
check(file.form.username === "alice", "the rest of the form survives the strip");
check(file.version === SETTINGS_FILE_VERSION && file.app === SETTINGS_FILE_APP, "app/version stamped");

// (2) the new preferences round-trip unchanged.
const back = parseSettingsFile(pretty);
check(back.ok, "round-trip parse succeeds", back.ok ? "" : back.error);
if (back.ok) {
  const s = back.settings;
  eq(s.uiFontSize, "large", "uiFontSize round-trips");
  eq(s.statusBarFields, settings.statusBarFields, "statusBarFields round-trips");
  eq(s.hiddenRefresh, settings.hiddenRefresh, "hiddenRefresh round-trips");
  eq(s.minimizeToTray, false, "minimizeToTray round-trips");
  eq(s.viewOptions, settings.viewOptions, "viewOptions round-trips");
  eq(s.clipboardAutoAdd, true, "clipboardAutoAdd round-trips");
  eq(s.smoothSpeeds, true, "smoothSpeeds round-trips");
  eq(s.trayAlwaysVisible, false, "trayAlwaysVisible round-trips");
  eq(s.columns, settings.columns, "columns still round-trips");
  eq(s.notifyOnComplete, false, "notifyOnComplete still round-trips");
  eq(s.pathMap, settings.pathMap, "pathMap still round-trips");
  eq(s.locale, "zh-CN", "locale still round-trips");
  eq(
    Object.keys(back.settings).sort(),
    [
      "clipboardAutoAdd",
      "columns",
      "form",
      "hiddenRefresh",
      "locale",
      "minimizeToTray",
      "notifyOnComplete",
      "pathMap",
      "servers",
      "smoothSpeeds",
      "statusBarFields",
      "trayAlwaysVisible",
      "uiFontSize",
      "viewOptions",
    ],
    "round-trip exposes exactly the expected keys",
  );
}

// (3) an old v1 file (written before the new preferences existed) still
// imports, missing values fall back to defaults, and it merges the old keys.
const v1 = JSON.stringify({
  app: SETTINGS_FILE_APP,
  version: 1,
  exportedAt: "2019-01-01T00:00:00Z",
  form: { host: "old.host", port: "9091", path: "/transmission/rpc", username: "bob", https: false, acceptInvalid: false, clientCert: "", clientKey: "", password: "leftover" },
  servers: [],
  columns: ["name", "progress"],
  notifyOnComplete: true,
  pathMap: [],
});
const old = parseSettingsFile(v1);
check(old.ok, "v1 file imports", old.ok ? "" : old.error);
if (old.ok) {
  eq(old.settings.uiFontSize, "medium", "v1 missing uiFontSize -> default medium");
  eq(old.settings.statusBarFields, DEFAULT_STATUS_BAR_FIELDS, "v1 missing statusBarFields -> defaults");
  eq(old.settings.hiddenRefresh, DEFAULT_HIDDEN_REFRESH, "v1 missing hiddenRefresh -> defaults");
  eq(old.settings.minimizeToTray, true, "v1 missing minimizeToTray -> default true");
  eq(old.settings.viewOptions, DEFAULT_VIEW_OPTIONS, "v1 missing viewOptions -> defaults");
  eq(old.settings.clipboardAutoAdd, false, "v1 missing clipboardAutoAdd -> default false");
  eq(old.settings.smoothSpeeds, DEFAULT_SMOOTH_SPEEDS, "v1 missing smoothSpeeds -> default false");
  eq(old.settings.trayAlwaysVisible, DEFAULT_TRAY_ALWAYS_VISIBLE, "v1 missing trayAlwaysVisible -> default true");
  eq(old.settings.columns, ["name", "progress"], "v1 columns preserved");
  eq(old.settings.notifyOnComplete, true, "v1 notifyOnComplete preserved");
  check(
    old.warnings.includes("Passwords in the file were ignored"),
    "v1 file carrying a password warns",
    JSON.stringify(old.warnings),
  );
}

// (3b) dirty values fall back to defaults rather than poisoning the store.
const dirty = parseSettingsFile(
  JSON.stringify({
    app: SETTINGS_FILE_APP,
    version: 2,
    uiFontSize: "gigantic",
    statusBarFields: "nope",
    hiddenRefresh: { enabled: "yes", seconds: -5 },
    viewOptions: { toolbar: "maybe" },
    minimizeToTray: 3,
    clipboardAutoAdd: "true",
    smoothSpeeds: "true",
    trayAlwaysVisible: 3,
  }),
);
if (dirty.ok) {
  eq(dirty.settings.uiFontSize, "medium", "unknown font size -> medium");
  eq(dirty.settings.statusBarFields, DEFAULT_STATUS_BAR_FIELDS, "garbage statusBarFields -> defaults");
  eq(dirty.settings.hiddenRefresh, { enabled: false, seconds: 10 }, "non-positive seconds -> default 10");
  eq(dirty.settings.minimizeToTray, true, "non-boolean minimizeToTray -> default true");
  eq(dirty.settings.viewOptions, DEFAULT_VIEW_OPTIONS, "garbage viewOptions -> defaults");
  eq(dirty.settings.clipboardAutoAdd, false, "non-boolean clipboardAutoAdd -> default false");
  eq(dirty.settings.smoothSpeeds, false, "non-boolean smoothSpeeds -> default false");
  eq(dirty.settings.trayAlwaysVisible, true, "non-boolean trayAlwaysVisible -> default true");
}

// (4) fail-closed: bad inputs must not be applied to the store.
const store = { ...settings };
function tryImport(raw: string): { ok: boolean; error?: string } {
  const r = parseSettingsFile(raw);
  if (r.ok) {
    Object.assign(store, r.settings); // the only path that would touch the store
    return { ok: true };
  }
  return { ok: false, error: r.error };
}

const before = JSON.stringify(store);
const badJson = tryImport("{ not json ");
check(!badJson.ok, "invalid JSON is rejected", badJson.error);
const wrongApp = tryImport(JSON.stringify({ app: "some-other-app", version: 2 }));
check(!wrongApp.ok, "a foreign file is rejected", wrongApp.error);
const tooNew = tryImport(
  JSON.stringify({ app: SETTINGS_FILE_APP, version: SETTINGS_FILE_VERSION + 1 }),
);
check(!tooNew.ok, "a newer version is rejected", tooNew.error);
check(JSON.stringify(store) === before, "rejected imports left the store untouched");

if (failures.length > 0) {
  console.error(`FAILED ${failures.length} of ${passed + failures.length}:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`settings-file: ${passed} assertions passed`);
