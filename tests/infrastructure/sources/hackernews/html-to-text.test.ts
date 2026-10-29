import { describe, expect, it } from "vitest";
import { htmlToText } from "../../../../src/infrastructure/sources/hackernews/html-to-text";

describe("htmlToText", () => {
  it("returns an empty string for an empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(htmlToText("Acme | Backend Engineer | Remote")).toBe(
      "Acme | Backend Engineer | Remote",
    );
  });

  describe("paragraphs", () => {
    it("turns <p> into a blank line", () => {
      expect(htmlToText("First line<p>Second paragraph<p>Third")).toBe(
        "First line\n\nSecond paragraph\n\nThird",
      );
    });

    it("accepts uppercase and closing paragraph tags", () => {
      expect(htmlToText("One<P>Two</p>Three")).toBe("One\n\nTwo\n\nThree");
    });
  });

  describe("links", () => {
    it("replaces a link with its href", () => {
      const html =
        'Acme | <a href="https:&#x2F;&#x2F;acme.example&#x2F;" rel="nofollow">https:&#x2F;&#x2F;acme.example&#x2F;</a> | Remote';

      expect(htmlToText(html)).toBe("Acme | https://acme.example/ | Remote");
    });

    it("uses the full href when the visible text is truncated", () => {
      const html =
        '<a href="https:&#x2F;&#x2F;a.example&#x2F;very&#x2F;long&#x2F;path" rel="nofollow">https:&#x2F;&#x2F;a.example&#x2F;very&#x2F;lo...</a>';

      expect(htmlToText(html)).toBe("https://a.example/very/long/path");
    });

    it("decodes entities inside the href", () => {
      const html =
        '<a href="https:&#x2F;&#x2F;x.example&#x2F;?a=1&amp;b=2">x</a>';

      expect(htmlToText(html)).toBe("https://x.example/?a=1&b=2");
    });

    it("understands single-quoted hrefs", () => {
      expect(htmlToText("<a href='https://x.example'>x</a>")).toBe(
        "https://x.example",
      );
    });

    it("keeps the text of a link that has no href", () => {
      expect(htmlToText('<a name="top">anchor text</a>')).toBe("anchor text");
    });

    it("handles many unclosed links in linear time", () => {
      const html = '<a href="x">'.repeat(60000);
      const started = Date.now();

      htmlToText(html);

      expect(Date.now() - started).toBeLessThan(500);
    });
  });

  describe("other tags", () => {
    it("removes formatting tags and keeps their text", () => {
      expect(
        htmlToText("<i>Fastly</i> builds <code>edge</code> software"),
      ).toBe("Fastly builds edge software");
    });

    it("removes an unclosed tag", () => {
      expect(htmlToText("<i>Fastly | Engineers | Full-time")).toBe(
        "Fastly | Engineers | Full-time",
      );
    });

    it("keeps the line breaks and indentation of a code block", () => {
      expect(htmlToText("Stack:<p><pre><code>a\n  b\nc\n</code></pre>")).toBe(
        "Stack:\n\na\n  b\nc",
      );
    });

    it("does not treat a lone angle bracket as a tag", () => {
      expect(htmlToText("salary 5 <3 years of experience")).toBe(
        "salary 5 <3 years of experience",
      );
    });
  });

  describe("entities", () => {
    it.each([
      ["&#x2F;", "/"],
      ["&#x27;", "'"],
      ["&amp;", "&"],
      ["&quot;", '"'],
      ["&apos;", "'"],
      ["&lt;", "<"],
      ["&gt;", ">"],
      ["&nbsp;", " "],
      ["&#65;", "A"],
      ["&#x41;", "A"],
      ["&#X41;", "A"],
      ["&#x1F600;", "\u{1F600}"],
    ])("decodes %s", (entity, expected) => {
      expect(htmlToText(`a${entity}b`)).toBe(`a${expected}b`);
    });

    it("decodes once, not twice", () => {
      expect(htmlToText("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    });

    it("does not turn decoded angle brackets into tags", () => {
      expect(htmlToText("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>");
    });

    it.each([
      ["&foo;"],
      ["&constructor;"],
      ["&toString;"],
      ["&#0;"],
      ["&#xD800;"],
      ["&#x110000;"],
      ["&#99999999999999999999;"],
    ])("leaves %s as it is", (entity) => {
      expect(htmlToText(`a${entity}b`)).toBe(`a${entity}b`);
    });

    it("never produces a NUL character", () => {
      expect(htmlToText("a&#0;b&#x0;c")).not.toContain("\u0000");
    });
  });

  describe("whitespace", () => {
    it("normalizes line endings, trailing spaces and long runs of blank lines", () => {
      expect(htmlToText("a  \r\nb\r\n\r\n\r\n\r\nc\t\nd")).toBe("a\nb\n\nc\nd");
    });

    it("trims the result", () => {
      expect(htmlToText("  \n  text \n\n")).toBe("text");
    });
  });

  it("converts a realistic job post", () => {
    const html =
      'Acme (<a href="https:&#x2F;&#x2F;acme.example" rel="nofollow">https:&#x2F;&#x2F;acme.example</a>) | Senior Engineer | REMOTE (US &amp; Canada) | $150k&#x2F;yr<p>We&#x27;re hiring.<p>Apply: <a href="https:&#x2F;&#x2F;acme.example&#x2F;jobs" rel="nofollow">https:&#x2F;&#x2F;acme.example&#x2F;jobs</a>';

    expect(htmlToText(html)).toBe(
      "Acme (https://acme.example) | Senior Engineer | REMOTE (US & Canada) | $150k/yr\n\nWe're hiring.\n\nApply: https://acme.example/jobs",
    );
  });
});
