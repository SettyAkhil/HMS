// The local LLM (vLLM serving a Qwen model) as the frontend reaches it.
//
// Always same-origin: vite.config.ts proxies /vllm-api to the vLLM server, so
// this works from a tunnel or another device, where "localhost:<port>" would
// be the viewer's own machine. The model name is asked from the server rather
// than hardcoded -- hardcoded names ("qwen", "qwen2.5-vl-7b") broke every call
// as soon as the served model changed.

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

export const LLM_CHAT_URL = env.VITE_QWEN_API_URL || "/vllm-api/v1/chat/completions"
export const LLM_API_KEY = env.VITE_QWEN_API_KEY || "local"

let modelPromise: Promise<string> | null = null

/** The served model id (cached). VITE_QWEN_MODEL overrides discovery. */
export function llmModel(): Promise<string> {
  if (env.VITE_QWEN_MODEL) return Promise.resolve(env.VITE_QWEN_MODEL)
  if (!modelPromise) {
    const modelsUrl = LLM_CHAT_URL.replace(/\/chat\/completions$/, "/models")
    modelPromise = fetch(modelsUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`models ${r.status}`))))
      .then((j: { data?: { id: string }[] }) => {
        const id = j.data?.[0]?.id
        if (!id) throw new Error("no model served")
        return id
      })
      .catch((e) => {
        modelPromise = null // retry next time instead of caching the failure
        throw e
      })
  }
  return modelPromise
}
