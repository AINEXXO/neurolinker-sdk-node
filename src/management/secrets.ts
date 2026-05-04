import { NeuroLinkerAPIError, NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson, fetchVoid } from "../http.js";

const REDACTED = "[REDACTED]";

function redactSecretInError(
  err: NeuroLinkerAPIError,
  value: string,
): NeuroLinkerAPIError {
  if (!value) return err;

  const redactedText = err.responseText.split(value).join(REDACTED);

  let redactedJson: unknown = err.responseJson;
  if (redactedJson !== undefined) {
    try {
      redactedJson = JSON.parse(JSON.stringify(redactedJson).split(value).join(REDACTED));
    } catch {
      redactedJson = err.responseJson;
    }
  }

  return new NeuroLinkerAPIError({
    statusCode: err.statusCode,
    method: err.method,
    url: err.url,
    responseText: redactedText,
    responseJson: redactedJson,
  });
}

async function withRedaction<T>(value: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof NeuroLinkerAPIError) {
      throw redactSecretInError(err, value);
    }
    throw err;
  }
}

export class SecretsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  async create(args: { name: string; value: string }): Promise<Record<string, unknown>> {
    if (!args.name) throw new NeuroLinkerConfigError("name must be a non-empty string.");
    if (!args.value) throw new NeuroLinkerConfigError("value must be a non-empty string.");

    return await withRedaction(args.value, () =>
      fetchJson({
        url: buildUrl(this.baseUrl, "/v1/management/secrets"),
        method: "POST",
        token: this.token,
        timeoutS: this.timeoutS,
        body: { name: args.name, value: args.value },
      }),
    );
  }

  async list(): Promise<Record<string, unknown>> {
    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/management/secrets"),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  async update(secretId: string, args: { value: string }): Promise<void> {
    if (!secretId) {
      throw new NeuroLinkerConfigError("secretId must be a non-empty string.");
    }
    if (!args.value) {
      throw new NeuroLinkerConfigError("value must be a non-empty string.");
    }

    return await withRedaction(args.value, () =>
      fetchVoid({
        url: buildUrl(this.baseUrl, `/v1/management/secrets/${secretId}`),
        method: "PUT",
        token: this.token,
        timeoutS: this.timeoutS,
        body: { value: args.value },
      }),
    );
  }

  async delete(secretId: string): Promise<void> {
    if (!secretId) {
      throw new NeuroLinkerConfigError("secretId must be a non-empty string.");
    }
    return await fetchVoid({
      url: buildUrl(this.baseUrl, `/v1/management/secrets/${secretId}`),
      method: "DELETE",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }
}
