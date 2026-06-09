export async function handler(event) {
  const { draftId } = JSON.parse(event.body);

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

  return {
    statusCode: response.status,
    body: await response.text(),
  };
}