# AI providers and privacy

AI is disabled by default. The provider URL and model are configured by the server
operator, not accepted from arbitrary browser requests or model output. HTTPS is
required except for loopback endpoints. The URL is the complete chat endpoint.

Example for an already running local Ollama model:

```sh
export COMMCODE_AI_PROVIDER=ollama
export COMMCODE_AI_URL=http://127.0.0.1:11434/api/chat
export COMMCODE_AI_MODEL=your-installed-model
npm start
```

Example for an OpenAI-compatible server:

```sh
export COMMCODE_AI_PROVIDER=compatible
export COMMCODE_AI_URL=https://your-provider.example/v1/chat/completions
export COMMCODE_AI_MODEL=your-supported-model
# Supply COMMCODE_AI_KEY securely in the environment.
npm start
```

The compatible adapter uses messages, `max_tokens`, non-streaming responses and
`response_format: {type: json_object}`. Providers/models that do not accept that
contract need an adapter change. This is not a claim that every OpenAI, Anthropic
or Gemini model supports that payload. Native Anthropic/Gemini adapters are planned.

Review the exact eligible context before authorising transmission. Context excludes
protected filenames and common secret patterns, but scanning cannot prove absence
of confidential data. Review objectives as well: the user can type sensitive text.
At most 30 files and 48,000 source characters are selected. A task makes one initial
call and, only if authorised, at most two repair calls. Each requests at most 4,096
output tokens. Actual provider accounting can differ. Returned usage is recorded;
no cost estimate or guaranteed monetary cap is claimed.

CommCode proposes complete file contents, never model-selected shell commands.
Review changes, especially test changes, before applying them. Only the configured
user test command determines its test result. Build/runtime/deployment verification
is separate. A model's prose cannot set a PASS state.

Local HTTP fixture tests verify adapter contracts. No live model call was made in
the initial authoring session. Do not describe those fixtures as model performance.
