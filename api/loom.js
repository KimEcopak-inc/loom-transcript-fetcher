// api/loom.js — fetches Loom video transcript
export default async function handler(req, res) {
  // Allow the evaluator (any origin) to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { url } = req.body || {};
    if (!url || !url.includes('loom.com')) {
      return res.status(400).json({ error: 'Invalid Loom URL' });
    }

    // Extract video ID from URL like https://www.loom.com/share/{id}
    const match = url.match(/loom\.com\/share\/([a-f0-9]+)/i);
    if (!match) return res.status(400).json({ error: 'Could not extract Loom video ID' });
    const videoId = match[1];

    // Fetch the Loom page
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!pageRes.ok) throw new Error(`Loom returned ${pageRes.status}`);
    const html = await pageRes.text();

    // Try to find transcript data in the page's embedded JSON
    // Loom embeds transcript in the page as JSON
    const transcriptMatch = html.match(/"transcript":\s*"((?:[^"\\]|\\.)*)"/);
    if (transcriptMatch) {
      const transcript = JSON.parse('"' + transcriptMatch[1] + '"');
      return res.status(200).json({ transcript, videoId });
    }

    // Fallback: try the captions endpoint
    const captionsRes = await fetch(`https://www.loom.com/api/campaigns/sessions/${videoId}/transcoded-captions`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (captionsRes.ok) {
      const captions = await captionsRes.text();
      // Parse VTT/SRT to plain text
      const lines = captions.split('\n')
        .filter(l => l.trim() && !l.match(/^\d+$/) && !l.match(/-->/) && !l.startsWith('WEBVTT'))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (lines) return res.status(200).json({ transcript: lines, videoId });
    }

    return res.status(404).json({ error: 'Transcript not found. The video may not have captions enabled, or may be private.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
