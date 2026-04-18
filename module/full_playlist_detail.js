// 完整歌单（自动分页聚合）
module.exports = async (query, request) => {
    const playlistId = query.id;
    const limit = 100;          // 每页数量（网易云最大支持 1000，但建议 100）
    let allTracks = [];
    
    // 1. 先获取歌单基本信息，得到总歌曲数
    const detailData = await request(
        'POST', 
        `https://music.163.com/api/v6/playlist/detail`,
        { id: playlistId, n: 1, offset: 0 },
        { crypto: 'api', cookie: query.cookie, proxy: query.proxy, realIP: query.realIP }
    );
    if (detailData.body.code !== 200) {
        return detailData;
    }
    const total = detailData.body.playlist.trackCount;
    const pages = Math.ceil(total / limit);
    
    // 2. 循环请求每一页
    for (let i = 0; i < pages; i++) {
        const offset = i * limit;
        const pageData = await request(
            'POST',
            `https://music.163.com/api/v6/playlist/detail`,
            { id: playlistId, n: limit, offset: offset },
            { crypto: 'api', cookie: query.cookie, proxy: query.proxy, realIP: query.realIP }
        );
        if (pageData.body.code === 200 && pageData.body.playlist.tracks) {
            allTracks = allTracks.concat(pageData.body.playlist.tracks);
        } else {
            break;
        }
    }
    
    // 3. 构造完整返回数据
    const result = detailData.body;
    result.playlist.tracks = allTracks;
    result.playlist.trackCount = allTracks.length;
    return result;
};
