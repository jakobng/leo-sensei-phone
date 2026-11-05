export const jsonMutationOptions = (method, body, desktop = globalThis.desktop) => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(desktop?.mutationHeaders?.() ?? {}),
  },
  body: JSON.stringify(body),
});
