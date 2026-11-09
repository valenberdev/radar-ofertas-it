import { describe, expect, it } from "vitest";
import { redactPersonalData } from "../../src/domain/redact-personal-data";

describe("redactPersonalData", () => {
  it("returns an empty string unchanged", () => {
    expect(redactPersonalData("")).toBe("");
  });

  it("returns text without personal data unchanged", () => {
    const text =
      "Backend developer.\nNode.js, PostgreSQL and Docker.\n\n  Remote, async.";

    expect(redactPersonalData(text)).toBe(text);
  });

  describe("emails", () => {
    it.each([
      ["valen@gmail.com", "[EMAIL]"],
      ["Mail me: valen@gmail.com.", "Mail me: [EMAIL]."],
      ["valen.berdini+jobs@mail.co.uk y otro", "[EMAIL] y otro"],
      ["VALEN_B@Example-Corp.IO", "[EMAIL]"],
      ["(valen@gmail.com)", "([EMAIL])"],
      ["a@b.com, c@d.org", "[EMAIL], [EMAIL]"],
      ["mailto:valen@gmail.com", "mailto:[EMAIL]"],
      ["jobs@sub.domain.example.com", "[EMAIL]"],
    ])("redacts %j", (input, expected) => {
      expect(redactPersonalData(input)).toBe(expected);
    });

    it.each([
      "@valen",
      "valen@",
      "valen@localhost",
      "valen@gmail.c",
      "node.js@2",
      "valen [at] gmail [dot] com",
    ])("leaves %j alone", (input) => {
      expect(redactPersonalData(input)).toBe(input);
    });
  });

  describe("urls", () => {
    it.each([
      ["https://github.com/valenberdev", "[URL]"],
      ["see https://github.com/valenberdev.", "see [URL]."],
      ["(https://example.com/a?b=1&c=2)", "([URL])"],
      ["http://localhost:3000/x, then", "[URL], then"],
      ["HTTPS://EXAMPLE.COM/Path", "[URL]"],
      ["www.valen.dev", "[URL]"],
      ["visit www.example.com/about!", "visit [URL]!"],
      ["linkedin.com/in/valenberdini/", "[URL]"],
      ["ar.linkedin.com/in/valenberdini", "[URL]"],
      ["GitHub.com/valenberdev", "[URL]"],
      ["gitlab.com/group/project", "[URL]"],
      ["x.com/valen", "[URL]"],
      ["t.me/valen", "[URL]"],
      ["wa.me/5492914567890", "[URL]"],
      ["https://example.com/a https://example.org/b", "[URL] [URL]"],
      ["https://user@example.com/profile", "[URL]"],
      ["https://example.com/?contact=valen@gmail.com", "[URL]"],
    ])("redacts %j", (input, expected) => {
      expect(redactPersonalData(input)).toBe(expected);
    });

    it.each([
      "github.com",
      "linkedin.com/",
      "https://",
      "notgithub.com/x",
      "githubxcom/valen",
      "box.com/file",
      "Node.js",
      "ASP.NET",
      "Next.js 16",
      "example.com",
    ])("leaves %j alone", (input) => {
      expect(redactPersonalData(input)).toBe(input);
    });
  });

  describe("phones", () => {
    it.each([
      ["+54 9 291 456-7890", "Argentina international"],
      ["+5492914567890", "Argentina compact"],
      ["(0291) 15-456-7890", "Argentina with area code and 15"],
      ["0291 456-7890", "Argentina landline"],
      ["2914567890", "plain ten digits"],
      ["291 4567890", "Argentina split"],
      ["291-456-7890", "dashes"],
      ["291.456.7890", "dots"],
      ["291\u2013456\u20137890", "en dashes"],
      ["291\u00A0456\u00A07890", "non-breaking spaces"],
      ["+598 2 123 4567", "Uruguay landline"],
      ["+598 99 123 456", "Uruguay mobile"],
      ["+56 9 8765 4321", "Chile"],
      ["+55 (11) 91234-5678", "Brazil"],
      ["+52 55 1234 5678", "Mexico"],
      ["+57 300 123 4567", "Colombia"],
      ["+34 612 34 56 78", "Spain"],
      ["+1 (415) 555-2671", "United States"],
      ["415.555.2671", "United States dots"],
      ["+44 20 7946 0958", "United Kingdom"],
      ["+49 30 12345678", "Germany"],
      ["12345678", "exactly eight digits"],
      ["12.345.678", "Argentine DNI"],
      ["20-12345678-9", "Argentine CUIT"],
    ])("redacts %j (%s)", (input) => {
      expect(redactPersonalData(input)).toBe("[PHONE]");
    });

    it.each([
      ["Tel: 291 4567890.", "Tel: [PHONE]."],
      ["Phone +54 9 291 456-7890, email", "Phone [PHONE], email"],
      ["(+54 291 456-7890)", "([PHONE])"],
      ["call 2914567890\nthen 1155551234", "call [PHONE]\nthen [PHONE]"],
      ["2914567890 / 1155551234", "[PHONE] / [PHONE]"],
      ["+54 (9) 291 456 7890 ok", "[PHONE] ok"],
    ])("redacts inside text %j", (input, expected) => {
      expect(redactPersonalData(input)).toBe(expected);
    });

    it.each([
      "1234567",
      "291 4567",
      "12 34 567",
      "+54 9 291",
      "Tel: 456-7890",
      "3.14159",
    ])("keeps %j because it has fewer than eight digits", (input) => {
      expect(redactPersonalData(input)).toBe(input);
    });

    it.each([
      "2019-2023",
      "2019 - 2023",
      "2019\u20132023",
      "2019 2021 2022-2023",
      "1999-2004",
      "2026-11-09",
      "2026.11.19",
      "15.01.2026",
      "10-11-2026",
      "01\u201102\u20112003",
      "Henry 2026-2027",
      "(2019-2023)",
    ])("keeps %j because it is a date or a list of years", (input) => {
      expect(redactPersonalData(input)).toBe(input);
    });

    it.each([
      "Node 20.11.1, Next.js 16, v1.2.3, Python 3.12, Java 21",
      "Java 21 · Spring Boot 3.5.7 · PostgreSQL 16",
      "$100,000 - $120,000",
      "ARS 1.500.000",
      "5 years of experience, 10 projects",
      "id12345678",
      "12345678abc",
      "12345678_x",
      "abc2914567890",
      "user_2914567890",
      "80000 - 100000",
    ])("keeps %j", (input) => {
      expect(redactPersonalData(input)).toBe(input);
    });

    it.each([
      ["2019 2914567890", "[PHONE]"],
      ["2019 5492014567", "[PHONE]"],
      ["2914567890 15.01.2026", "[PHONE]"],
      ["15.01.2026 2914567890", "[PHONE]"],
      ["12342019 2020", "[PHONE]"],
      ["20191234 2020", "[PHONE]"],
    ])(
      "redacts %j because it is not only a date or years",
      (input, expected) => {
        expect(redactPersonalData(input)).toBe(expected);
      },
    );

    it("redacts digits followed by a space and a letter", () => {
      expect(redactPersonalData("2914567890 gmail")).toBe("[PHONE] gmail");
    });

    it("redacts salary ranges without symbols as a known false positive", () => {
      expect(redactPersonalData("80000-100000")).toBe("[PHONE]");
    });

    it("keeps a year range that has a hyphen surrounded by spaces next to a phone", () => {
      expect(redactPersonalData("2019 - 2023 tel 2914567890")).toBe(
        "2019 - 2023 tel [PHONE]",
      );
    });
  });

  describe("combinations", () => {
    it("redacts every kind in a single text", () => {
      const input = [
        "Valentino Berdini",
        "valen@gmail.com | +54 9 291 456-7890",
        "https://github.com/valenberdev | linkedin.com/in/valenberdini",
        "Node.js 2023-2025",
      ].join("\n");

      expect(redactPersonalData(input)).toBe(
        [
          "Valentino Berdini",
          "[EMAIL] | [PHONE]",
          "[URL] | [URL]",
          "Node.js 2023-2025",
        ].join("\n"),
      );
    });

    it("redacts the email inside a url as part of the url", () => {
      expect(
        redactPersonalData("https://example.com/?e=a@b.com and c@d.com"),
      ).toBe("[URL] and [EMAIL]");
    });

    it("is idempotent", () => {
      const once = redactPersonalData(
        "a@b.com +54 9 291 456-7890 https://x.io/a 2019-2023",
      );

      expect(redactPersonalData(once)).toBe(once);
    });

    it("leaves no run of eight or more digits behind", () => {
      const input =
        "tel 2914567890, +54 9 291 456-7890, (011) 4567-8901, 12.345.678, 20-12345678-9 y 5492914567890";

      expect(redactPersonalData(input)).not.toMatch(/(?:\d[ .\-()]?){8}/);
    });
  });

  describe("long inputs", () => {
    it.each([
      ["spaced digits", `${"1 ".repeat(50_000)}x`],
      ["letters", "a".repeat(200_000)],
      ["dotted words", "a.".repeat(100_000)],
      ["separators", `${"1-.".repeat(50_000)}x`],
    ])("finishes quickly on %s", (_name, input) => {
      const start = performance.now();

      redactPersonalData(input);

      expect(performance.now() - start).toBeLessThan(1000);
    });
  });
});
