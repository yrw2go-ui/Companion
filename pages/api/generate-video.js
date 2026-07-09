const ATLAS_API_KEY = process.env.ATLAS_API_KEY; // add to .env

const SPICY_MODELS = {
  wanTurbo: 'atlascloud/wan-2.2-turbo-spicy/image-to-video',
  wanLora: 'atlascloud/wan-2.2-turbo-spicy/image-to-video-lora',
  seedance: 'bytedance/seedance-v1.5-pro/image-to-video-spicy',
  // add more: wan-2.6-spicy etc.
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageUrl, prompt, modelKey = 'wanTurbo' } = req.body;
  const model = SPICY_MODELS[modelKey] || SPICY_MODELS.wanTurbo;

  try {
    const response = await fetch('https://api.atlascloud.ai/generate', { // confirm endpoint in docs
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        image_url: imageUrl, // adjust param name per docs
        prompt: prompt || 'gentle natural motion, subtle movement',
      }),
    });

    const data = await response.json();
    res.status(200).json({ videoUrl: data.video?.url || data.output_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
