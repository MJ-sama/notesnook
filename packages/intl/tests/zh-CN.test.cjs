// Run after building @notesnook/intl; exercise the catalogs shipped to clients.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const intl = require("../dist/index.js");

function catalog(locale) {
  const file = join(__dirname, "../dist/locales", "$" + locale + ".json");
  return JSON.parse(readFileSync(file, "utf8")).messages;
}

function signature(parts, result = new Set()) {
  for (const part of parts) {
    if (!Array.isArray(part)) continue;
    const [name, format, cases] = part;
    result.add(name);
    if (cases && typeof cases === "object") {
      for (const [key, value] of Object.entries(cases)) {
        if (format === "select") result.add(name + ":" + key);
        if (Array.isArray(value)) signature(value, result);
      }
    }
  }
  return result;
}

test("every Chinese message exists, is translated and preserves its arguments", () => {
  const en = catalog("en");
  const zh = catalog("zh-CN");
  const verbatim = new Set(["#notesnook", "Notesnook", "Abc"]);
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const [id, source] of Object.entries(en)) {
    assert.deepEqual(signature(zh[id]), signature(source), id);
    if (!verbatim.has(source[0])) {
      assert.notDeepEqual(zh[id], source, "English fallback: " + id);
      assert.match(JSON.stringify(zh[id]), /\p{Script=Han}/u, id);
    }
  }
});

test("both client loaders support Chinese without overriding a saved choice", async () => {
  assert.equal(intl.getSupportedLocale("zh_Hans_CN"), "zh-CN");
  assert.equal(intl.resolveTargetLocale("", "de-DE"), "de");
  assert.equal(intl.resolveTargetLocale("en", "zh-CN"), "en");
  for (const init of [intl.initLocaleSync, intl.initLocale]) {
    assert.equal(await init({ getSavedLocale: () => intl.DEFAULT_APP_LANGUAGE, systemLocale: "en-US" }), "zh-CN");
    assert.equal(intl.strings.save(), "保存");
    assert.match(intl.strings.windowsProxyDescription(), /SelfTalk/);
    assert.equal(intl.strings.usingOfficialInstance(), "正在使用 Notesnook 官方服务");
    assert.equal(intl.strings.bulletList(), "无序列表");
    assert.equal(intl.strings.reminderModes("repeat"), "重复");
    assert.match(intl.strings.searchInRoute("会议"), /会议/);
    assert.match(intl.strings.doActions.delete.note(12), /12.*笔记/);
  }
});
