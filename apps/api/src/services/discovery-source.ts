import type { SearchInput } from "../../../../packages/shared/src/index.js";
import type { AIProvider } from "../providers/gemini.js";
import type { BusinessSearchProvider } from "../providers/overpass.js";
import { AppError } from "./leads.js";

export async function discoverBusinesses(
  workspaceId: string,
  input: SearchInput,
  ai: AIProvider,
  signal: AbortSignal,
  injectedSearch?: BusinessSearchProvider,
) {
  // Explicit provider injection is reserved for integration tests and local adapters.
  if (injectedSearch)
    return {
      leads: await injectedSearch.search(input, signal),
      report: undefined,
    };
  if (!ai.discoverBusinesses)
    throw new AppError(
      409,
      "Configure Gemini para descobrir empresas com Google Search e Google Maps.",
    );
  return ai.discoverBusinesses(workspaceId, input, signal);
}
