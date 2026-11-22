// tools/content-delivery.cjs: a delivery changes only the lines it means to in a Prettier-formatted
// course file, and `ids` refuses an argument that is not a number.
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyDelivery, main } = require("../tools/content-delivery.cjs") as {
  applyDelivery: (d: object, o: { root: string; content: string; now: Date }) => unknown;
  main: (argv: string[], out: { log: (s: string) => void; error: (s: string) => void }) => number;
};

const prettier = require.resolve("prettier/bin/prettier.cjs");
const format = (file: string) =>
  execFileSync(process.execPath, [prettier, "--ignore-path", os.devNull, "--write", file]);

const ID = (c: string) => c.repeat(20);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-"));
  const curriculumFile = path.join(root, "src", "data", "curricula", "ap-test.json");
  fs.mkdirSync(path.dirname(curriculumFile), { recursive: true });
  const curriculum = {
    id: "ap-test",
    apCourse: "physics-1",
    sets: [
      { key: "1A", unit: 1, topics: ["1.1", "1.2"], draftIds: [ID("a")] },
      { key: "2A", unit: 2, topics: ["2.1"], draftIds: [ID("c")] },
    ],
  };
  fs.writeFileSync(curriculumFile, JSON.stringify(curriculum, null, 2) + "\n");
  format(curriculumFile); // short arrays on one line, as the real course files are
  const contentFile = path.join(root, "content", "ap-test", "units.json");
  fs.mkdirSync(path.dirname(contentFile), { recursive: true });
  const draft = (id: string, unit: number, topic: string) => ({
    id,
    course: "physics-1",
    apUnit: unit,
    apTopic: topic,
    problem: { text: "x", apTopic: topic },
  });
  const content = {
    count: 2,
    drafts: [draft(ID("a"), 1, "1.1"), draft(ID("c"), 2, "2.1")],
  };
  fs.writeFileSync(contentFile, JSON.stringify(content, null, 2) + "\n");
  return { root, curriculumFile, contentFile };
}

describe("content-delivery apply", () => {
  test("keeps the course file in Prettier's layout and changes only the set it appends to", () => {
    const { root, curriculumFile, contentFile } = fixture();
    const before = fs.readFileSync(curriculumFile, "utf8");
    expect(before).not.toBe(JSON.stringify(JSON.parse(before), null, 2) + "\n"); // really Prettier's
    applyDelivery(
      {
        curriculumId: "ap-test",
        unit: 1,
        drafts: [{ id: ID("d"), apTopic: "1.1", problem: { text: "A new problem." } }],
        order: { "1A": [ID("d")] },
      },
      { root, content: contentFile, now: new Date("2026-01-01T00:00:00Z") },
    );
    const after = fs.readFileSync(curriculumFile, "utf8");
    const changed = after.split("\n").filter((l, i) => l !== before.split("\n")[i]);
    expect(changed).toEqual([expect.stringContaining(`"${ID("d")}"`)]);
    expect(JSON.parse(after).sets[0].draftIds).toEqual([ID("a"), ID("d")]);
    // the content file was plain two-space JSON, and stays that way
    const content = fs.readFileSync(contentFile, "utf8");
    expect(content).toBe(JSON.stringify(JSON.parse(content), null, 2) + "\n");
    expect(JSON.parse(content).count).toBe(3);
  });

  test("a delivery that changes nothing leaves the files untouched", () => {
    const { root, curriculumFile, contentFile } = fixture();
    const stamp = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(curriculumFile, stamp, stamp);
    applyDelivery(
      { curriculumId: "ap-test", unit: 1 },
      { root, content: contentFile, now: new Date() },
    );
    expect(fs.statSync(curriculumFile).mtime.getTime()).toBe(stamp.getTime());
  });
});

describe("content-delivery ids", () => {
  const run = (argv: string[]) => {
    const log: string[] = [];
    const error: string[] = [];
    const code = main(argv, { log: (s) => log.push(s), error: (s) => error.push(s) });
    return { code, log, error };
  };

  test("prints that many ids", () => {
    const r = run(["ids", "3"]);
    expect(r.code).toBe(0);
    expect(r.log).toHaveLength(3);
    for (const id of r.log) expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(run(["ids"]).log).toHaveLength(1);
  });

  test.each(["abc", "2.5", "-3", "ten"])("refuses %p with a usage error", (arg) => {
    const r = run(["ids", arg]);
    expect(r.code).toBe(1);
    expect(r.log).toEqual([]);
    expect(r.error[0]).toMatch(/ids needs a whole number/);
  });
});
