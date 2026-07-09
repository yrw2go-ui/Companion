const ATLAS_API_KEY = process.env.ATLAS_API_KEY;

const SPICY_MODELS = {
  wanTurbo: 'atlascloud/wan-2.2-turbo-spicy/image-to-video',
  wanLora: 'atlascloud/wan-2.2-turbo-spicy/image-to-video-lora',
  wan26: 'atlascloud/wan-2.6-spicy/image-to-video',
  seedance: 'bytedance/seedance-v1.5-pro/image-to-video-spicy',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageUrl, prompt, modelKey = 'wanTurbo' } = req.body;
  const model = SPICY_MODELS[modelKey] || SPICY_MODELS.wanTurbo;

  try {
    const response = await fetch('https://api.atlascloud.ai/v1/generations/video', { // try variants
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        image: imageUrl,
        prompt: prompt || 'gentle natural motion',
      }),
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      const text = await response.text();
      return res.status(500).json({ error: 'Non-JSON response: ' + text.slice(0, 200) });
    }

    const videoUrl = data.video_url || data.output?.url || data.url || data.data?.[0]?.url;
    res.status(200).json({ videoUrl: videoUrl || null, full: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
