const fs = require('fs')
const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const request = require('./util/request')
const packageJSON = require('./package.json')
const exec = require('child_process').exec
const cache = require('./util/apicache').middleware
const { cookieToJson } = require('./util/index')
const fileUpload = require('express-fileupload')
// version check
exec('npm info NeteaseCloudMusicApi version', (err, stdout, stderr) => {
  if (!err) {
    let version = stdout.trim()
    if (packageJSON.version < version) {
      console.log(
        `最新版本: ${version}, 当前版本: ${packageJSON.version}, 请及时更新`,
      )
    }
  }
})

const app = express()

// CORS & Preflight request
app.use((req, res, next) => {
  if (req.path !== '/' && !req.path.includes('.')) {
    res.set({
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Headers': 'X-Requested-With,Content-Type',
      'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
    })
  }
  req.method === 'OPTIONS' ? res.status(204).end() : next()
})

// cookie parser
app.use((req, res, next) => {
  req.cookies = {}
  ;(req.headers.cookie || '').split(/\s*;\s*/).forEach((pair) => {
    let crack = pair.indexOf('=')
    if (crack < 1 || crack == pair.length - 1) return
    req.cookies[
      decodeURIComponent(pair.slice(0, crack)).trim()
    ] = decodeURIComponent(pair.slice(crack + 1)).trim()
  })
  next()
})

// body parser
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

app.use(fileUpload())

// static
app.use(express.static(path.join(__dirname, 'public')))

// cache
app.use(cache('2 minutes', (req, res) => res.statusCode === 200))
// router
const special = {
  'daily_signin.js': '/daily_signin',
  'fm_trash.js': '/fm_trash',
  'personal_fm.js': '/personal_fm',
}

fs.readdirSync(path.join(__dirname, 'module'))
  .reverse()
  .forEach((file) => {
    if (!file.endsWith('.js')) return
    let route =
      file in special
        ? special[file]
        : '/' + file.replace(/\.js$/i, '').replace(/_/g, '/')
    let question = require(path.join(__dirname, 'module', file))

    app.use(route, (req, res) => {
      ;[req.query, req.body].forEach((item) => {
        if (typeof item.cookie === 'string') {
          item.cookie = cookieToJson(decodeURIComponent(item.cookie))
        }
      })
      let query = Object.assign(
        {},
        { cookie: req.cookies },
        req.query,
        req.body,
        req.files,
      )

      question(query, request)
        .then((answer) => {
          console.log('[OK]', decodeURIComponent(req.originalUrl))
          res.append('Set-Cookie', answer.cookie)
          res.status(answer.status).send(answer.body)
        })
        .catch((answer) => {
          console.log('[ERR]', decodeURIComponent(req.originalUrl), {
            status: answer.status,
            body: answer.body,
          })
          if (answer.body.code == '301') answer.body.msg = '需要登录'
          res.append('Set-Cookie', answer.cookie)
          res.status(answer.status).send(answer.body)
        })
    })
  })

// ========== 自定义音频代理路由（优化版） ==========
// 注意：此路由必须放在所有动态路由之后，确保不会被覆盖
const port = process.env.PORT || 3000
const host = process.env.HOST || ''

app.get('/song/stream', async (req, res) => {
  const songId = req.query.id
  if (!songId) {
    return res.status(400).json({ error: 'Missing song id' })
  }

  // 1. 优先使用项目内置接口获取真实音频地址（最可靠）
  let audioUrl = null
  try {
    // 注意：此处调用本地服务，确保端口一致
    const songUrlRes = await fetch(`http://localhost:${port}/song/url?id=${songId}`)
    const songUrlData = await songUrlRes.json()
    if (songUrlData.code === 200 && songUrlData.data && songUrlData.data[0] && songUrlData.data[0].url) {
      audioUrl = songUrlData.data[0].url
    }
  } catch (err) {
    console.warn('通过内置接口获取音频地址失败:', err.message)
  }

  // 2. 如果内置接口失败，使用备用外链（可能被防盗链，但携带 Referer 后有一定几率成功）
  if (!audioUrl) {
    audioUrl = `https://music.163.com/song/media/outer/url?id=${songId}.mp3`
  }

  try {
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/'
      }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`)
    }
    // 检查响应类型是否为音频
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('audio')) {
      // 可能返回了 HTML 错误页，说明外链失效
      throw new Error('Response is not audio')
    }
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Stream error:', err)
    res.status(500).json({ error: 'Failed to stream audio', details: err.message })
  }
})

// ========== 启动服务器 ==========
app.server = app.listen(port, host, () => {
  console.log(`server running @ http://${host ? host : 'localhost'}:${port}`)
})

module.exports = app
