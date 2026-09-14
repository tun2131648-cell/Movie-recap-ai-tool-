const API_BASE_URL = "https://linthu44045479-dc4.workers.dev";

async function callAPI(endpoint, data) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error("API request failed");
  }

  return await response.json();
}
