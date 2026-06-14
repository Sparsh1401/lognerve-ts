export const SPAN_OUTPUT = "output.value";
export const SPAN_INPUT = "input.value";

export const SDK_NAME = "lognerve-typescript-sdk";
export const SDK_VERSION = "0.1.1";
export const TRACER_NAME = "lognerve";

export const LLM_MODEL = "lognerve.llm.model";
export const LLM_MESSAGE = "lognerve.llm.message";
export const LLM_TOKEN_COUNT = "lognerve.token.count";
export const LLM_MODEL_PARAMETERS = "lognerve.model.parameters";

export const TRACE_METADATA = "lognerve.trace.metadata";
export const TRACE_TAGS = "lognerve.trace.tags";

export const SPAN_PATH = "lognerve.span.path";
export const SPAN_IDS_PATH = "lognerve.span.ids_path";
export const SPAN_SOURCE_FILE = "lognerve.git.source_file";
export const SPAN_SOURCE_LINE = "lognerve.git.source_line";
export const SPAN_SOURCE_FUNCTION = "lognerve.git.source_function";

export const GIT_REPO = "lognerve.git.repo";
export const GIT_REF = "lognerve.git.ref";

export const SpanAttributes = {
  // LLM
  SDK_NAME,
  SDK_VERSION,
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
  SPAN_SOURCE_FILE,
  SPAN_SOURCE_LINE,
  SPAN_SOURCE_FUNCTION,
  GIT_REPO,
  GIT_REF,
} as const;
