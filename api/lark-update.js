// api/lark-update.js — Updates Lark Base record after evaluation

// Read config from Vercel Environment Variables (set in Step 7)
const LARK_APP_ID = process.env.LARK_APP_ID;
const LARK_APP_SECRET = process.env.LARK_APP_SECRET;
const LARK_APP_TOKEN = process.env.LARK_APP_TOKEN;
const LARK_TABLE_ID = process.env.LARK_TABLE_ID;
// Detect Lark region — most SEA users: "larksuite.com". China: "feishu.cn"
const LARK_HOST = process.env.LARK_HOST || 'https://open.larksuite.com';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const data = req.body || {};
    if (!data.email) return res.status(400).json({ error: 'email is required to match record' });

    // 1. Get tenant access token
    const tokenRes = await fetch(`${LARK_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: LARK_APP_ID, app_secret: LARK_APP_SECRET })
    });
    const tokenJson = await tokenRes.json();
    if (tokenJson.code !== 0) throw new Error(`Auth failed: ${tokenJson.msg}`);
    const token = tokenJson.tenant_access_token;

    // 2. Search record by Email Address
    const searchRes = await fetch(
      `${LARK_HOST}/open-apis/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: 'Email Address',
                operator: 'is',
                value: [data.email]
              }
            ]
          },
          automatic_fields: false
        })
      }
    );
    const searchJson = await searchRes.json();
    if (searchJson.code !== 0) throw new Error(`Search failed: ${searchJson.msg}`);
    if (!searchJson.data?.items?.length) {
      return res.status(404).json({
        error: `No candidate found with email: ${data.email}`,
        hint: 'The candidate must exist in the Base first (from the application form)'
      });
    }

    const recordId = searchJson.data.items[0].record_id;

    // 3. Update record with evaluation results
    const fields = {
      'Status': data.verdict, // 'PASS' or 'FAIL'
      'Evaluation Date': Date.now(), // Lark expects epoch milliseconds
      'Verdict': data.verdict,
      'Weighted Score': Number(data.weightedScore),
      'Part 1 Score': Number(data.part1),
      'Part 2 Score': Number(data.part2),
      'Part 3 Score': Number(data.part3),
      'Part 4 Score': Number(data.part4),
      'Recommendation': String(data.recommendation || ''),
      'Evaluated Loom URL': data.loomUrl ? { link: data.loomUrl, text: 'View Loom' } : undefined
    };

    // Remove undefined
    Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k]);

    const updateRes = await fetch(
      `${LARK_HOST}/open-apis/bitable/v1/apps/${LARK_APP_TOKEN}/tables/${LARK_TABLE_ID}/records/${recordId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      }
    );
    const updateJson = await updateRes.json();
    if (updateJson.code !== 0) throw new Error(`Update failed: ${updateJson.msg}`);

    return res.status(200).json({
      success: true,
      recordId,
      candidate: data.candidate,
      verdict: data.verdict
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
