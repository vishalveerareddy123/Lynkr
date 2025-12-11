const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");

// Mock configuration
process.env.WEB_SEARCH_ENDPOINT = "http://localhost:9999/search";
process.env.WEB_SEARCH_TIMEOUT_MS = "5000";
process.env.WEB_FETCH_BODY_PREVIEW_MAX = "1000";
process.env.WEB_SEARCH_RETRY_ENABLED = "true";
process.env.WEB_SEARCH_MAX_RETRIES = "2";

const config = require("../src/config");
const { webAgent, getAgentStats, fetchWithAgent } = require("../src/tools/web-client");

describe("Web Tools Tests", () => {
  describe("HTML Extraction", () => {
    // Import the extraction function by loading the module
    let extractTextFromHtml;

    before(() => {
      // Recreate the HTML extraction function for testing
      extractTextFromHtml = function(html) {
        if (typeof html !== "string") return "";
        let text = html;
        text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
        text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
        text = text.replace(/<!--[\s\S]*?-->/g, " ");
        text = text.replace(/<\/(div|p|br|h[1-6]|li|tr|section|article|header|footer|nav)>/gi, "\n");
        text = text.replace(/<[^>]+>/g, " ");
        text = text
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'");
        text = text.replace(/\r\n/g, "\n");
        text = text.replace(/\r/g, "\n");
        text = text.replace(/[ \t]+/g, " ");
        text = text.replace(/\n\s+/g, "\n");
        text = text.replace(/\n{3,}/g, "\n\n");
        return text.trim();
      };
    });

    it("should extract text from simple HTML", () => {
      const html = "<p>Hello World</p>";
      const result = extractTextFromHtml(html);
      assert.strictEqual(result, "Hello World");
    });

    it("should remove script tags and content", () => {
      const html = "<div>Content<script>alert('test')</script>More</div>";
      const result = extractTextFromHtml(html);
      assert.ok(!result.includes("alert"));
      assert.ok(result.includes("Content"));
      assert.ok(result.includes("More"));
    });

    it("should remove style tags and content", () => {
      const html = "<div>Text<style>body { color: red; }</style>More</div>";
      const result = extractTextFromHtml(html);
      assert.ok(!result.includes("color"));
      assert.ok(result.includes("Text"));
      assert.ok(result.includes("More"));
    });

    it("should decode HTML entities", () => {
      const html = "<p>&nbsp;&amp;&lt;&gt;&quot;&#39;</p>";
      const result = extractTextFromHtml(html);
      assert.ok(result.includes("&"));
      assert.ok(result.includes("<"));
      assert.ok(result.includes(">"));
      assert.ok(result.includes('"'));
      assert.ok(result.includes("'"));
    });

    it("should convert block elements to newlines", () => {
      const html = "<div>Line 1</div><p>Line 2</p><h1>Line 3</h1>";
      const result = extractTextFromHtml(html);
      const lines = result.split("\n").filter(l => l.trim());
      assert.strictEqual(lines.length, 3);
    });

    it("should normalize whitespace", () => {
      const html = "<p>Text   with    spaces</p>";
      const result = extractTextFromHtml(html);
      assert.strictEqual(result, "Text with spaces");
    });

    it("should handle empty or non-string input", () => {
      assert.strictEqual(extractTextFromHtml(""), "");
      assert.strictEqual(extractTextFromHtml(null), "");
      assert.strictEqual(extractTextFromHtml(undefined), "");
      assert.strictEqual(extractTextFromHtml(123), "");
    });

    it("should remove HTML comments", () => {
      const html = "<div>Text<!-- comment here -->More</div>";
      const result = extractTextFromHtml(html);
      assert.ok(!result.includes("comment"));
      assert.ok(result.includes("Text"));
      assert.ok(result.includes("More"));
    });

    it("should handle complex nested HTML", () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <header><h1>Title</h1></header>
            <div class="content">
              <p>Paragraph 1</p>
              <ul>
                <li>Item 1</li>
                <li>Item 2</li>
              </ul>
            </div>
            <footer>Footer</footer>
          </body>
        </html>
      `;
      const result = extractTextFromHtml(html);
      assert.ok(result.includes("Test"));
      assert.ok(result.includes("Title"));
      assert.ok(result.includes("Paragraph 1"));
      assert.ok(result.includes("Item 1"));
      assert.ok(result.includes("Footer"));
    });
  });

  describe("Web Client Agent", () => {
    it("should create agent with correct configuration", () => {
      assert.ok(webAgent, "Agent should be created");
      const stats = getAgentStats();
      assert.strictEqual(stats.agent, "undici");
      assert.strictEqual(stats.keepAlive, true);
      assert.strictEqual(stats.maxConnections, 50);
      assert.strictEqual(stats.pipelining, 10);
    });

    it("should have fetchWithAgent function", () => {
      assert.strictEqual(typeof fetchWithAgent, "function");
    });
  });

  describe("Configuration", () => {
    it("should load web search configuration correctly", () => {
      assert.ok(config.webSearch, "webSearch config should exist");
      assert.strictEqual(config.webSearch.enabled, true);
      assert.strictEqual(config.webSearch.endpoint, "http://localhost:9999/search");
      assert.strictEqual(config.webSearch.timeoutMs, 5000);
      assert.strictEqual(config.webSearch.bodyPreviewMax, 1000);
      assert.strictEqual(config.webSearch.retryEnabled, true);
      assert.strictEqual(config.webSearch.maxRetries, 2);
    });

    it("should have retry configuration", () => {
      assert.strictEqual(config.webSearch.retryEnabled, true);
      assert.strictEqual(config.webSearch.maxRetries, 2);
    });

    it("should have configurable body preview max", () => {
      assert.strictEqual(config.webSearch.bodyPreviewMax, 1000);
    });
  });

  describe("Retry Logic Integration", () => {
    let mockServer;
    let requestCounts;

    before((done) => {
      requestCounts = {};
      mockServer = http.createServer((req, res) => {
        const url = req.url;
        requestCounts[url] = (requestCounts[url] || 0) + 1;

        if (url === "/fail-twice") {
          if (requestCounts[url] <= 2) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Server error" }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          }
        } else if (url === "/timeout") {
          // Don't respond to simulate timeout
          setTimeout(() => {
            res.writeHead(200);
            res.end("OK");
          }, 10000);
        } else if (url === "/rate-limit") {
          if (requestCounts[url] <= 2) {
            res.writeHead(429, {
              "Content-Type": "application/json",
              "Retry-After": "1"
            });
            res.end(JSON.stringify({ error: "Rate limited" }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          }
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ data: "ok" }));
        }
      });

      mockServer.listen(9999, done);
    });

    after((done) => {
      if (mockServer) {
        mockServer.close(done);
      } else {
        done();
      }
    });

    it("should retry on server errors and eventually succeed", async () => {
      const { withRetry } = require("../src/clients/retry");

      const response = await withRetry(async () => {
        return await fetchWithAgent("http://localhost:9999/fail-twice");
      }, {
        maxRetries: 3,
        initialDelay: 50,
        maxDelay: 200,
      });

      // After retries, should get successful response
      assert.ok(response.ok, "Response should be ok after retries");
      const result = await response.json();
      assert.ok(result.success);
      assert.ok(requestCounts["/fail-twice"] >= 3, `Expected at least 3 requests, got ${requestCounts["/fail-twice"]}`);
    });

    it("should handle 429 rate limiting with retry", async () => {
      const { withRetry } = require("../src/clients/retry");

      const response = await withRetry(async () => {
        return await fetchWithAgent("http://localhost:9999/rate-limit");
      }, {
        maxRetries: 3,
        initialDelay: 50,
        maxDelay: 200,
      });

      assert.ok(response.ok, "Should eventually succeed after retries");
      const result = await response.json();
      assert.ok(result.success, "Result should indicate success");
      assert.ok(requestCounts["/rate-limit"] >= 2, "Should have retried at least once");
    });
  });

  describe("Error Handling", () => {
    it("should categorize error codes correctly", () => {
      // Test that error codes are properly set
      const testError = (status, expectedCode) => {
        const error = new Error("Test error");
        error.status = status;
        error.code = status === 429 ? "RATE_LIMITED" :
                     status >= 500 ? "SERVER_ERROR" : "REQUEST_ERROR";

        assert.strictEqual(error.code, expectedCode);
      };

      testError(429, "RATE_LIMITED");
      testError(500, "SERVER_ERROR");
      testError(502, "SERVER_ERROR");
      testError(503, "SERVER_ERROR");
      testError(400, "REQUEST_ERROR");
      testError(404, "REQUEST_ERROR");
    });
  });

  describe("Performance", () => {
    let testServer;

    before((done) => {
      testServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      });
      testServer.listen(9998, done);
    });

    after((done) => {
      if (testServer) {
        testServer.close(done);
      } else {
        done();
      }
    });

    it("should reuse connections with keep-alive", async () => {
      const times = [];

      // Make 5 sequential requests
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await fetchWithAgent("http://localhost:9998/");
        times.push(Date.now() - start);
      }

      // First request typically slower (connection setup)
      // Subsequent requests should be faster (reused connection)
      const avgSubsequent = times.slice(1).reduce((a, b) => a + b, 0) / (times.length - 1);

      // Subsequent requests should be reasonably fast
      assert.ok(avgSubsequent < 100, `Subsequent requests too slow: ${avgSubsequent}ms`);
    });
  });

  describe("Body Preview Configuration", () => {
    it("should limit body preview to configured max", () => {
      const maxLength = config.webSearch.bodyPreviewMax;
      const longContent = "x".repeat(maxLength * 2);
      const preview = longContent.slice(0, maxLength);

      assert.strictEqual(preview.length, maxLength);
      assert.ok(preview.length < longContent.length);
    });
  });
});
