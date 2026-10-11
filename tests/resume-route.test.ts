import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/resume/parse/route";

function request(fileName: string, bytes: Uint8Array, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/resume/parse", {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-resume-file-name": encodeURIComponent(fileName), ...headers },
    body: Buffer.from(bytes),
  });
}

describe("resume parsing route validation", () => {
  it("fails closed before inspecting or parsing an upload without Supabase configuration", async () => {
    const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    const previous = envNames.map((name) => process.env[name]);
    envNames.forEach((name) => delete process.env[name]);
    try {
      const response = await POST(request("candidate.txt", Buffer.from("not parsed")));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
    } finally {
      envNames.forEach((name, index) => previous[index] === undefined ? delete process.env[name] : process.env[name] = previous[index]);
    }
  });

  it("checks authenticated context before reading or parsing the upload", async () => {
    const source = await readFile(new URL("../src/app/api/resume/parse/route.ts", import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("export async function POST"));
    assert.ok(handler.indexOf("await getAuthenticatedContext()") < handler.indexOf("await parseResume(request)"));
    assert.match(handler, /acquireRequestSlot\("parse"\)/);
  });
});
