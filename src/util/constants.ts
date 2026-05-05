export const SPAN_OUTPUT = "output.value";
export const SPAN_INPUT = "input.value";

export const LLM_MODEL = "lognerve.llm.model";
export const LLM_MESSAGE = "lognerve.llm.message";
export const LLM_TOKEN_COUNT = "lognerve.token.count";
export const LLM_MODEL_PARAMETERS = "lognerve.model.parameters";

export const TRACE_METADATA = "lognerve.trace.metadata";
export const TRACE_TAGS = "lognerve.trace.tags";

export const SPAN_PATH     = "lognerve.span.path";
export const SPAN_IDS_PATH = "lognerve.span.ids_path";

export const SpanAttributes = {
  // LLM
  LLM_MODEL,
  LLM_MESSAGE,
  LLM_TOKEN_COUNT,

  //SPAN
  SPAN_INPUT,
  SPAN_OUTPUT,

  TRACE_USER_ID: "user.id",
  TRACE_SESSION_ID: "session.id",
  TRACE_METADATA,
  TRACE_TAGS,
  SPAN_PATH,
  SPAN_IDS_PATH,
} as const;
