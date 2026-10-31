// Concept 27 · Error handling: callers get one typed error that carries the server's problem details.

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly details: {
      /** HTTP status of the last response, or 0 when no response ever arrived. */
      status: number;
      problem?: ProblemDetails;
      attempts: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: details.cause });
    this.name = 'ApiError';
  }

  get status(): number {
    return this.details.status;
  }

  get problem(): ProblemDetails | undefined {
    return this.details.problem;
  }

  get attempts(): number {
    return this.details.attempts;
  }
}
