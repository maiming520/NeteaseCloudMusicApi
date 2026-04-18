// 代理音频流 (增强版)
app.get('/song/stream', async (req, res) => {
    const id = req.query.id;
    if (!id) {
        return res.status(400).json({ error: 'Missing song id' });
    }
    const audioUrl = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
    try {
        const response = await fetch(audioUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://music.163.com/'
            }
        });
        if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        // 将响应数据作为缓冲区发送
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('Stream error:', err);
        res.status(500).json({ error: 'Failed to stream audio' });
    }
});
