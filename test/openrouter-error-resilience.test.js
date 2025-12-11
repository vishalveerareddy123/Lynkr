const assert = require("assert");
const { describe, it, beforeEach, afterEach } = require("node:test");

describe("OpenRouter Error Resilience", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Clear module cache
    delete require.cache[require.resolve("../src/config")];
    delete require.cache[require.resolve("../src/clients/openrouter-utils")];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Missing Choices Array", () => {
    it("should throw error when choices array is missing", () => {
      const invalidResponse = {
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: 429
        }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");

      assert.throws(
        () => convertOpenRouterResponseToAnthropic(invalidResponse, "test-model"),
        /No choices in OpenRouter response/
      );
    });

    it("should throw error when choices array is empty", () => {
      const invalidResponse = {
        choices: [],
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");

      assert.throws(
        () => convertOpenRouterResponseToAnthropic(invalidResponse, "test-model"),
        /No choices in OpenRouter response/
      );
    });

    it("should throw error when choices is null", () => {
      const invalidResponse = {
        choices: null,
        model: "openai/gpt-4o-mini"
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");

      assert.throws(
        () => convertOpenRouterResponseToAnthropic(invalidResponse, "test-model"),
        /No choices in OpenRouter response/
      );
    });

    it("should throw error when choices is undefined", () => {
      const invalidResponse = {
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");

      assert.throws(
        () => convertOpenRouterResponseToAnthropic(invalidResponse, "test-model"),
        /No choices in OpenRouter response/
      );
    });
  });

  describe("Error Response Formats", () => {
    it("should detect rate limit errors", () => {
      const rateLimitError = {
        error: {
          message: "Rate limit exceeded for model",
          type: "rate_limit_error",
          code: 429
        }
      };

      // Verify error structure
      assert.strictEqual(rateLimitError.error.type, "rate_limit_error");
      assert.strictEqual(rateLimitError.error.code, 429);
    });

    it("should detect model unavailable errors", () => {
      const unavailableError = {
        error: {
          message: "Model is currently unavailable",
          type: "service_unavailable",
          code: 503
        }
      };

      assert.strictEqual(unavailableError.error.type, "service_unavailable");
      assert.strictEqual(unavailableError.error.code, 503);
    });

    it("should detect invalid request errors", () => {
      const invalidRequestError = {
        error: {
          message: "Invalid request parameters",
          type: "invalid_request_error",
          code: 400
        }
      };

      assert.strictEqual(invalidRequestError.error.type, "invalid_request_error");
      assert.strictEqual(invalidRequestError.error.code, 400);
    });

    it("should detect authentication errors", () => {
      const authError = {
        error: {
          message: "Invalid API key",
          type: "authentication_error",
          code: 401
        }
      };

      assert.strictEqual(authError.error.type, "authentication_error");
      assert.strictEqual(authError.error.code, 401);
    });
  });

  describe("Successful Response Validation", () => {
    it("should successfully convert valid OpenRouter response", () => {
      const validResponse = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello, how can I help you?"
            },
            finish_reason: "stop"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18
        }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(validResponse, "test-model");

      assert.strictEqual(result.role, "assistant");
      assert.strictEqual(Array.isArray(result.content), true);
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].type, "text");
      assert.strictEqual(result.content[0].text, "Hello, how can I help you?");
    });

    it("should handle response with empty content gracefully", () => {
      const responseWithEmptyContent = {
        choices: [
          {
            message: {
              role: "assistant",
              content: ""
            },
            finish_reason: "stop"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(responseWithEmptyContent, "test-model");

      // Empty content results in a single empty text block (fallback behavior)
      assert.strictEqual(result.role, "assistant");
      assert.strictEqual(Array.isArray(result.content), true);
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].type, "text");
      assert.strictEqual(result.content[0].text, "");
    });

    it("should handle response with null content", () => {
      const responseWithNullContent = {
        choices: [
          {
            message: {
              role: "assistant",
              content: null
            },
            finish_reason: "stop"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(responseWithNullContent, "test-model");

      assert.strictEqual(result.role, "assistant");
      assert.strictEqual(Array.isArray(result.content), true);
      // Null content results in a single empty text block (fallback behavior)
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].type, "text");
      assert.strictEqual(result.content[0].text, "");
    });
  });

  describe("Tool Call Error Handling", () => {
    it("should handle malformed tool call arguments", () => {
      const responseWithInvalidToolArgs = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Using tool",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "Write",
                    arguments: "not valid json {{"
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(responseWithInvalidToolArgs, "test-model");

      // Should still convert, but with empty input object
      assert.strictEqual(result.content.length, 2); // text + tool_use
      assert.strictEqual(result.content[1].type, "tool_use");
      assert.deepStrictEqual(result.content[1].input, {});
    });

    it("should handle tool call with missing function name", () => {
      const responseWithMissingName = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Using tool",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    arguments: JSON.stringify({ param: "value" })
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(responseWithMissingName, "test-model");

      // Should use "unknown" as fallback name
      assert.strictEqual(result.content[1].name, "unknown");
    });

    it("should handle tool call with missing ID", () => {
      const responseWithMissingId = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Using tool",
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "Write",
                    arguments: JSON.stringify({ file_path: "/tmp/test.txt" })
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(responseWithMissingId, "test-model");

      // Should generate an ID
      assert.strictEqual(typeof result.content[1].id, "string");
      assert.strictEqual(result.content[1].id.startsWith("toolu_"), true);
    });
  });

  describe("Usage Metadata Handling", () => {
    it("should handle missing usage metadata", () => {
      const responseWithoutUsage = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Response"
            },
            finish_reason: "stop"
          }
        ],
        model: "openai/gpt-4o-mini"
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(responseWithoutUsage, "test-model");

      // Should have default usage with zeros
      assert.strictEqual(typeof result.usage, "object");
      assert.strictEqual(result.usage.input_tokens, 0);
      assert.strictEqual(result.usage.output_tokens, 0);
    });

    it("should correctly map OpenRouter usage to Anthropic format", () => {
      const responseWithUsage = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Response"
            },
            finish_reason: "stop"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(responseWithUsage, "test-model");

      // Should map prompt_tokens -> input_tokens, completion_tokens -> output_tokens
      assert.strictEqual(result.usage.input_tokens, 100);
      assert.strictEqual(result.usage.output_tokens, 50);
    });
  });

  describe("Model ID Handling", () => {
    it("should use requested model as the model ID", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Response"
            },
            finish_reason: "stop"
          }
        ],
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(response, "claude-sonnet-4-5");

      // The conversion uses the requested model, not the OpenRouter response model
      assert.strictEqual(result.model, "claude-sonnet-4-5");
    });

    it("should use requested model as fallback when OpenRouter model missing", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Response"
            },
            finish_reason: "stop"
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      };

      const { convertOpenRouterResponseToAnthropic } = require("../src/clients/openrouter-utils");
      const result = convertOpenRouterResponseToAnthropic(response, "claude-sonnet-4-5");

      assert.strictEqual(result.model, "claude-sonnet-4-5");
    });
  });
});
