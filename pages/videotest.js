// /api/generate-video.js
// ... models same

try {
  const response = await fetch('https://api.atlascloud.ai/v1/generations', { // common Atlas endpoint
    method: 'POST',
    headers: { /* same */ },
    body: JSON.stringify({ model, image: imageUrl, prompt }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return res.status(500).json({ error: 'Invalid JSON from Atlas: ' + text.slice(0, 500) });
  }

  const videoUrl = data.video_url || data.output?.[0]?.url || data.url;
  res.status(200).json({ videoUrl, fullResponse: data });
} catch (e) {
  res.status(500).json({ error: e.message });
}
