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

  it("lets explicit otlpHeaders override generated Authorization", () => {
    const { Exporter } = require("../dist/exporter/exporter.js");

    const headers = Exporter.buildHeaders({
      apiKey: "generated-key",
      otlpHeaders: {
        Authorization: "Bearer explicit-key",
        "x-custom": "yes",
      },
    });

    assert.equal(headers.Authorization, "Bearer explicit-key");
    assert.equal(headers["x-custom"], "yes");
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
