export async function handler(event) {
  console.log("🚀 Function triggerWorkflow avviata");

  const { draftId } = JSON.parse(event.body);

  console.log("📦 Draft ID:", draftId);

  const response = await fetch(
    "https://api.github.com/repos/FrenckOfficial/temp.myfrem.friuliemergenze.it/actions/workflows/push-vehicle-github.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          draftId,
        },
      }),
    }
  );

  console.log("📨 GitHub response:", response);

  return {
    body: await response.text(),
    console: console.log("📨 GitHub body:", body)
  };
}