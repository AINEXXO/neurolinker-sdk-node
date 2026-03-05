/* eslint-disable @typescript-eslint/no-explicit-any */

export class NeuroLinkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeuroLinkerConfigError";
  }
}

export class NeuroLinkerAPIError extends Error {
  public readonly statusCode: number;
  public readonly method: string;
  public readonly url: string;
  public readonly responseText: string;
  public readonly responseJson?: any;

  constructor(args: {
    statusCode: number;
    method: string;
    url: string;
    responseText: string;
    responseJson?: any;
  }) {
    super(
      `NeuroLinker API request failed: ${args.statusCode} ${args.method} ${args.url}\n` +
        `Response: ${args.responseText.slice(0, 2000)}`
    );
    this.name = "NeuroLinkerAPIError";
    this.statusCode = args.statusCode;
    this.method = args.method;
    this.url = args.url;
    this.responseText = args.responseText;
    this.responseJson = args.responseJson;
  }
}