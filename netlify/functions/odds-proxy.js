// Thin proxy — forwards requests to OpticOdds API with the key attached.
// The API key can be overridden via the OPTIC_ODDS_KEY environment variable
// in the Netlify dashboard (Settings → Environment variables).
const KEY = process.env.OPTIC_ODDS_KEY || "e69544ed-dadf-4260-9024-e83adfad1491";

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const path   = params._path || "";

  if (!path) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing _path" }) };
  }

  const url = new URL(`https://api.opticodds.com/api/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (k !== "_path") url.searchParams.append(k, v);
  });

  try {
    const res  = await fetch(url.toString(), {
      headers: { "X-Api-Key": KEY, "Accept": "application/json" },
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
