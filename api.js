async function callAPI(endpoint, data) {
  const response = await fetch(
    `https://linthu44045479-dc4.workers.dev${endpoint}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  if (!response.ok) {
    throw new Error("API request failed");
  }

  return await response.json();
}
