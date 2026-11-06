const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("Android installs separately and can build unsigned production APKs", () => {
  const gradle = read("apps/mobile/android/app/build.gradle");
  assert.match(gradle, /applicationId "app\.selftalk\.notes"/);
  assert.match(gradle, /build_config_package.*com\.streetwriters\.notesnook/);
  assert.match(gradle, /universalApk true/);
  assert.match(gradle, /!project\.hasProperty\("unsignedRelease"\)/);
});

test("fresh installs default to Chinese and keep the official sync endpoints", () => {
  assert.match(read("apps/mobile/app/stores/use-setting-store.ts"), /appLanguage: DEFAULT_APP_LANGUAGE/);
  assert.match(read("packages/intl/src/languages.ts"), /DEFAULT_APP_LANGUAGE = "zh-CN"/);
  const database = read("apps/mobile/app/common/database/index.ts");
  for (const url of ["https://api.notesnook.com", "https://auth.streetwriters.co", "https://events.streetwriters.co"]) {
    assert.ok(database.includes(url), url);
  }
  assert.match(database, /SettingsService\.getProperty\("serverUrls"\)/);
});

test("native widgets and system actions have Chinese resources", () => {
  const xml = read("apps/mobile/android/app/src/main/res/values/strings.xml");
  const entries = [...xml.matchAll(/<string name="([^"]+)">([^<]*)<\/string>/g)];
  assert.ok(entries.length >= 30);
  for (const [_, name, value] of entries) {
    if (["app_name", "title_activity_share"].includes(name)) continue;
    assert.match(value, /\p{Script=Han}/u, name);
    if (["reminder_snoozed_until", "reminder_today", "reminder_tomorrow", "reminder_yesterday", "reminder_upcoming", "reminder_last"].includes(name)) {
      assert.equal((value.match(/%1\$s/g) || []).length, 1, name);
    }
  }
  const manifest = read("apps/mobile/android/app/src/main/AndroidManifest.xml");
  assert.doesNotMatch(manifest, /android:label="(New note|Make Note|Notesnook|NotePreviewConfigure)"/);
  for (const file of ["widget_reminders.xml", "widget_reminders_preview.xml"]) {
    assert.doesNotMatch(read("apps/mobile/android/app/src/main/res/layout/" + file), /android:text="Reminders"/);
  }
});

test("cloud build does not publish or use an upstream signing key", () => {
  const workflow = read(".github/workflows/selftalk.android.yml");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /-PunsignedRelease=true/);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|upload-google-play|action-gh-release/);
});
