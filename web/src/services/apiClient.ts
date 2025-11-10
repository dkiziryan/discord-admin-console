import type { ApiError } from "../models/types";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  allowedStatuses?: number[];
  body?: BodyInit | null;
  errorMessage: string;
  json?: unknown;
};

const parseErrorMessage = async (
  response: Response,
  fallbackMessage: string,
): Promise<string> => {
  try {
    const payload: ApiError = await response.json();
    return payload.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const buildRequestInit = (requestOptions: ApiRequestOptions): RequestInit => {
  const { allowedStatuses, errorMessage, headers, json, ...options } =
    requestOptions;
  void allowedStatuses;
  void errorMessage;
  const requestHeaders = new Headers(headers);

  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    return {
      credentials: "include",
      ...options,
      headers: requestHeaders,
      body: JSON.stringify(json),
    };
  }

  return {
    credentials: "include",
    ...options,
    headers: requestHeaders,
  };
};

export const apiResponse = async (
  url: string,
  options: ApiRequestOptions,
): Promise<Response> => {
  const response = await fetch(url, buildRequestInit(options));

  if (!response.ok && !options.allowedStatuses?.includes(response.status)) {
    throw new Error(await parseErrorMessage(response, options.errorMessage));
  }

  return response;
};

export const apiJson = async <T>(
  url: string,
  options: ApiRequestOptions,
): Promise<T> => {
  const response = await apiResponse(url, options);
  return response.json() as Promise<T>;
};

export const apiVoid = async (
  url: string,
  options: ApiRequestOptions,
): Promise<void> => {
  await apiResponse(url, options);
};

export const tryApiJson = async <T>(
  url: string,
  options: ApiRequestOptions,
): Promise<T | null> => {
  try {
    return await apiJson<T>(url, options);
  } catch {
    return null;
  }
};
