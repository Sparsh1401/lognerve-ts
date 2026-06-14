const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { ExportResultCode } = require("@opentelemetry/core");

describe("Exporter headers", () => {
  it("adds SDK identity and Authorization from apiKey", () => {
    const { Exporter } = require("../dist/exporter/exporter.js");

    const headers = Exporter.buildHeaders({ apiKey: "test-key" });

    assert.equal(headers["x-lognerve-sdk-name"], "lognerve-typescript-sdk");
    assert.equal(headers["x-lognerve-sdk-version"], "0.1.0");
    assert.equal(headers.Authorization, "Bearer test-key");
  });

  it("does not let otlpHeaders override the apiKey Authorization, but keeps custom headers", () => {
    const { Exporter } = require("../dist/exporter/exporter.js");

    const headers = Exporter.buildHeaders({
      apiKey: "generated-key",
      otlpHeaders: {
        Authorization: "Bearer attacker-key",
        "x-custom": "yes",
      },
    });

    // The configured apiKey is security-critical and must win over an injected
    // Authorization header (e.g. via LOGNERVE_OTLP_HEADERS).
    assert.equal(headers.Authorization, "Bearer generated-key");
    assert.equal(headers["x-custom"], "yes");
  });

  it("still applies otlpHeaders Authorization when no apiKey is configured", () => {
    const { Exporter } = require("../dist/exporter/exporter.js");

    const headers = Exporter.buildHeaders({
      otlpHeaders: { Authorization: "Bearer explicit-key" },
    });

    assert.equal(headers.Authorization, "Bearer explicit-key");
  });

  it("handles exporter failures without surfacing processor errors", async () => {
    const { Exporter } = require("../dist/exporter/exporter.js");
    const exporter = Exporter.withSafeFailureHandling({
      export(_spans, callback) {
        callback({
          code: ExportResultCode.FAILED,
          error: new Error("Not Found"),
        });
      },
      forceFlush() {
        return Promise.reject(new Error("flush failed"));
      },
      shutdown() {
        return Promise.reject(new Error("shutdown failed"));
      },
    });

    const result = await new Promise((resolve) => {
      exporter.export([], resolve);
    });

    assert.equal(result.code, ExportResultCode.SUCCESS);
    await assert.doesNotReject(() => exporter.forceFlush());
    await assert.doesNotReject(() => exporter.shutdown());
  });
});
