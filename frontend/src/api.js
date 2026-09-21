export async function api(path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Check that it is running and try again.",
    );
  }
  const data = await response
    .json()
    .catch(() => ({ error: "Unexpected server response." }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error || "Request failed.");
  }
  return data;
}
export const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
export const date = (s) =>
  new Date(s).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
