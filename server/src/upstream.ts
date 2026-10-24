// Claude requests go through the residential proxy. We use undici's own fetch so
// the ProxyAgent dispatcher always matches. (Groq transcription goes direct.)
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { config } from "./config.ts";

export const proxyAgent = new ProxyAgent(config.llmProxy);

export const upstreamFetch = ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
  undiciFetch(input, { ...init, dispatcher: proxyAgent })) as unknown as typeof globalThis.fetch;
