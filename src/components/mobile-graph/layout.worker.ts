import { computeLayout, type LayoutRequest } from "./layouts";

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  try { self.postMessage({ result: computeLayout(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Layout failed" }); }
};
