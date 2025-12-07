const config = require("../config");
const http = require("http");
const https = require("https");
const { withRetry } = require("./retry");
const { getCircuitBreakerRegistry } = require("./circuit-breaker");
const { getMetricsCollector } = require("../observability/metrics");
const logger = require("../logger");

if (typeof fetch !== "function") {
  throw new Error("Node 18+ is required for the built-in fetch API.");
}

// HTTP connection pooling for better performance
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAliveMsecs: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAliveMsecs: 30000,
});

async function performJsonRequest(url, { headers = {}, body }, providerLabel) {
  const agent = url.startsWith('https:') ? httpsAgent : httpAgent;

  // Wrap with retry logic
  return withRetry(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      agent,
    });
    const text = await response.text();

    logger.debug({
      provider: providerLabel,
      status: response.status,
      responseLength: text.length,
    }, `${providerLabel} API response`);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    const result = {
      ok: response.ok,
      status: response.status,
      json,
      text,
      contentType: response.headers.get("content-type"),
      headers: response.headers,
    };

    // Log errors for retry logic
    if (!response.ok) {
      logger.warn({
        provider: providerLabel,
        status: response.status,
        error: json?.error || text.substring(0, 200),
      }, `${providerLabel} API error`);
    }

    return result;
  }, {
    maxRetries: config.apiRetry?.maxRetries || 3,
    initialDelay: config.apiRetry?.initialDelay || 1000,
    maxDelay: config.apiRetry?.maxDelay || 30000,
  });
}

async function invokeDatabricks(body) {
  if (!config.databricks?.url) {
    throw new Error("Databricks configuration is missing required URL.");
  }
  const headers = {
    Authorization: `Bearer ${config.databricks.apiKey}`,
    "Content-Type": "application/json",
  };
  return performJsonRequest(config.databricks.url, { headers, body }, "Databricks");
}

async function invokeAzureAnthropic(body) {
  if (!config.azureAnthropic?.endpoint) {
    throw new Error("Azure Anthropic endpoint is not configured.");
  }
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": config.azureAnthropic.apiKey,
    "anthropic-version": config.azureAnthropic.version ?? "2023-06-01",
  };
  return performJsonRequest(
    config.azureAnthropic.endpoint,
    { headers, body },
    "Azure Anthropic",
  );
}

async function invokeModel(body) {
  const provider = config.modelProvider?.type ?? "databricks";

  // Get circuit breaker for this provider
  const registry = getCircuitBreakerRegistry();
  const breaker = registry.get(provider, {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
  });

  // Execute with circuit breaker protection
  const metricsCollector = getMetricsCollector();
  let retries = 0;

  try {
    const result = await breaker.execute(async () => {
      if (provider === "azure-anthropic") {
        return await invokeAzureAnthropic(body);
      }
      return await invokeDatabricks(body);
    });

    // Record success metrics
    metricsCollector.recordDatabricksRequest(true, retries);

    // Record token usage if present
    if (result.json?.usage) {
      metricsCollector.recordTokens(
        result.json.usage.input_tokens || 0,
        result.json.usage.output_tokens || 0
      );
    }

    return result;
  } catch (err) {
    // Record failure metrics
    metricsCollector.recordDatabricksRequest(false, retries);
    throw err;
  }
}

module.exports = {
  invokeModel,
};
