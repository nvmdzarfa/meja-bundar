import { describe, expect, it } from "vitest";
import { parseGatewayResponse } from "@/lib/parser";

describe("parseGatewayResponse", () => {
  it("parses SSE stream with delta string chunks and [DONE]", () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"Halo "}}]}',
      'data: {"choices":[{"delta":{"content":"Pemilik!"}}]}',
      "data: [DONE]",
    ].join("\n");

    const parsed = parseGatewayResponse(sse, "text/event-stream");
    expect(parsed.format).toBe("sse");
    expect(parsed.text).toBe("Halo Pemilik!");
  });

  it("parses SSE stream even without text/event-stream header and with array parts", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":[{"type":"text","text":"Bagian 1 "}]}}]}',
      'data: {"choices":[{"delta":{"content":[{"type":"text","text":"Bagian 2"}]}}]}',
      "data: [DONE]",
    ].join("\n");

    const parsed = parseGatewayResponse(sse, "application/json");
    expect(parsed.format).toBe("sse");
    expect(parsed.text).toBe("Bagian 1 Bagian 2");
  });

  it("parses standard JSON /chat/completions with string content", () => {
    const json = JSON.stringify({
      id: "chatcmpl-1",
      choices: [{ message: { role: "assistant", content: "Rencana siap dijalankan." } }],
    });

    const parsed = parseGatewayResponse(json, "application/json");
    expect(parsed.format).toBe("json");
    expect(parsed.text).toBe("Rencana siap dijalankan.");
  });

  it("parses standard JSON /chat/completions with array-of-parts content", () => {
    const json = JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Langkah satu. " },
              { type: "text", text: "Langkah dua." },
            ],
          },
        },
      ],
    });

    const parsed = parseGatewayResponse(json);
    expect(parsed.format).toBe("json");
    expect(parsed.text).toBe("Langkah satu. Langkah dua.");
  });

  it("parses direct delta object JSON", () => {
    const json = JSON.stringify({
      delta: { content: "Isi delta langsung" },
    });

    const parsed = parseGatewayResponse(json);
    expect(parsed.format).toBe("json");
    expect(parsed.text).toBe("Isi delta langsung");
  });

  it("parses plain text responses", () => {
    const parsed = parseGatewayResponse("  Jawaban plain text dari proxy.  ", "text/plain");
    expect(parsed.format).toBe("text");
    expect(parsed.text).toBe("Jawaban plain text dari proxy.");
  });

  it("propagates provider error objects inside SSE or JSON", () => {
    const errJson = JSON.stringify({
      error: { message: "Model quota exceeded" },
    });
    expect(() => parseGatewayResponse(errJson)).toThrow("Model quota exceeded");

    const errSse = 'data: {"error":{"message":"Upstream stream timeout"}}';
    expect(() => parseGatewayResponse(errSse)).toThrow("Upstream stream timeout");
  });
});
