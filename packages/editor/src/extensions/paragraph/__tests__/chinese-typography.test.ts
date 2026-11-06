import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import TextStyle from "@tiptap/extension-text-style";
import { createEditor } from "../../../../test-utils/index.js";
import { Paragraph, selectedBodyParagraphs } from "../paragraph.js";
import { FontFamily } from "../../font-family/font-family.js";
import { getFont, getFontById, getFontIds } from "../../../utils/font.js";

const editors: Editor[] = [];
function open(html: string) {
  const { editor } = createEditor({
    initialContent: html,
    extensions: {
      paragraph: Paragraph,
      textStyle: TextStyle,
      fontFamily: FontFamily
    }
  });
  editors.push(editor);
  return editor;
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe("Chinese typography", () => {
  it("round-trips all six font IDs and their local CSS stacks, without changing text", () => {
    const ids = [
      "microsoft-yahei",
      "simsun",
      "kaiti",
      "fangsong",
      "simhei",
      "dengxian"
    ];
    const editor = open("<p>中文</p>");
    for (const id of ids) {
      expect(getFontIds()).toContain(id);
      const font = getFontById(id)!;
      expect(getFont(font.font)?.id).toBe(id);
      editor.commands.selectAll();
      editor.commands.setFontFamily(id);
      const html = editor.getHTML();
      expect(html).toContain(`data-font-family="${id}"`);
      expect(html).toContain("font-family:");
      editor.commands.setContent(html);
      editor.commands.setTextSelection(2);
      expect(editor.getAttributes("textStyle").fontFamily).toBe(id);
      expect(editor.getText()).toBe("中文");
    }
  });
  it("indents ordinary paragraphs by default and preserves an opt-out across Enter and HTML reload", () => {
    const editor = open("<p>第一段</p>");
    expect(editor.getHTML()).not.toContain("text-indent");
    editor.commands.setTextSelection(4);
    expect(selectedBodyParagraphs(editor.state)[0].indented).toBe(true);
    expect(editor.commands.toggleFirstLineIndent()).toBe(true);
    expect(editor.getText()).toBe("第一段");
    editor.commands.splitBlock();
    expect(editor.state.doc.lastChild?.attrs.firstLineIndent).toBe(false);
    const copy = open(editor.getHTML());
    expect(copy.state.doc.firstChild?.attrs.firstLineIndent).toBe(false);
    expect(copy.state.doc.lastChild?.attrs.firstLineIndent).toBe(false);
    copy.commands.selectAll();
    copy.commands.toggleFirstLineIndent();
    expect(copy.state.doc.firstChild?.attrs.firstLineIndent).toBe(true);
    expect(copy.getHTML()).toContain("2em");
  });
  it("toggles a mixed selection together and skips headings, quotes, lists and code", () => {
    const editor = open(
      '<p style="text-indent:2em">甲</p><h2>题</h2><blockquote><p>引</p></blockquote><ul><li><p>项</p></li></ul><pre><code>1</code></pre><p style="text-indent:0px">乙</p>'
    );
    editor.commands.selectAll();
    editor.commands.toggleFirstLineIndent();
    expect(editor.getHTML().match(/text-indent/g)).toHaveLength(2);
    editor.commands.toggleFirstLineIndent();
    expect(editor.state.doc.firstChild?.attrs.firstLineIndent).toBe(false);
    expect(editor.state.doc.lastChild?.attrs.firstLineIndent).toBe(false);
    expect(editor.getHTML()).not.toContain("2em");
    editor.commands.setTextSelection(4);
    expect(editor.can().toggleFirstLineIndent()).toBe(false);
    expect(editor.commands.toggleFirstLineIndent()).toBe(false);
  });
});
