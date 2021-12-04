import { createApi } from 'unsplash-js'
import fetch from 'node-fetch'
import http from 'http'
import sharp from 'sharp'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { imageSize } from 'image-size'

dotenv.config()

const unsplash = createApi({
  accessKey: process.env.UNSPLASH_API_ACCESS_KEY,
  fetch,
})

async function searchImage(query) {
  const result = await unsplash.search.getPhotos({ query })
  // console.log(result.response?.results)

  if (!result.response) {
    throw new Error('failed to search image.')
  }

  const image = result.response.results[0]

  // console.log('25', image)

  if (!image) {
    throw new Error('image not found')
  }

  return {
    description: image.description || image.alt_description,
    url: image.urls.regular,
  }
}

async function getCachedImageOrSearchedImage(query) {
  const __dirname = path.resolve()
  const imageFilePath = path.resolve(__dirname, `../images/${query}`)

  if (fs.existsSync(imageFilePath)) {
    return {
      message: 'from file',
      stream: fs.createReadStream(imageFilePath),
    }
  }

  const result = await searchImage(query)
  const resp = await fetch(result.url)

  await promisify(pipeline)(resp.body, fs.createWriteStream(imageFilePath))

  const size = imageSize(imageFilePath)

  return {
    message: `from web new image: ${query}, width: ${size.width}, height: ${size.height}`,
    stream: fs.createReadStream(imageFilePath),
  }
}

function convertURLToImageInfo(url) {
  const urlObj = new URL(url, 'http://localhost:5000')

  function getSearchParam(name, defaultValue) {
    const str = urlObj.searchParams.get(name)
    return str ? parseInt(str, 10) : defaultValue
  }

  const width = getSearchParam('width', 400)
  const height = getSearchParam('height', 400)

  return {
    query: urlObj.pathname.slice(1),
    width,
    height,
  }
}

const server = http.createServer((req, res) => {
  async function main() {
    if (!req.url) {
      res.statusCode = 400
      res.end('Needs URL.')
      return
    }

    const { query, width, height } = convertURLToImageInfo(req.url)
    try {
      const { message, stream } = await getCachedImageOrSearchedImage(query)

      console.log(message)

      await promisify(pipeline)(
        stream,
        sharp()
          .resize(width, height, {
            fill: 'cover',
            background: '#ffffff',
          })
          .png(),
        res
      )
    } catch (err) {
      res.statusCode = 400
      res.end()
    }
  }

  main()
})

const PORT = 5000

server.listen(PORT, () => {
  console.log(`server is started [${PORT}]`)
})
