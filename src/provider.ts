import type { ScraperProvider, GameList, ScraperIdentifier, GameMetadata } from 'vnite-plugin-sdk'
import SearchGameResult from './types/search_game'
import * as cheerio from 'cheerio'
import { extractImagesFromUrl } from './utils'

// todo: 如果未来有配置项的话
const search_api_page = 1
const search_api_count = 10
const search_api_key = 'c542e67aec3a4340908f9de9e86038af'

/**
 * 根据游戏名称搜索游戏信息
 */
async function searchGamesByName(gameName: string): Promise<GameList> {
  try {
    const encodedGameName = encodeURIComponent(gameName)
    const url = `https://rawg.io/api/games?search=${encodedGameName}&page=${search_api_page}&page_size=${search_api_count}&key=${search_api_key}`

    const response = await fetch(url)
    const data = (await response.json()) as SearchGameResult
    
    const games = data.results.map((game) => ({ 
      id: game.slug,
      name: game.name,
      releaseDate: game.released,
      developers: []
    }))

    return games
  } catch (error) {
    console.error(`[RAWG 插件] 搜索游戏 [名称: ${gameName}] 时发生错误:`, error)
    throw new Error('搜索游戏失败')
  }
}

/**
 * 根据游戏slug搜索游戏元数据
 */
async function getGameMetadataBySlug(slug: string): Promise<GameMetadata> {
  try {
    const url = `https://rawg.io/games/${slug}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // 提取游戏基本信息
    const name = $('.game__title').text().trim()
    const originalName = name

    const metaBlocks = $('.game__meta-block')

    // 提取发布日期
    let releaseDate = ''
    if (metaBlocks.length > 2) {
      const releaseDateElement = metaBlocks.eq(2).find('div.game__meta-text')
      if (releaseDateElement.length) {
        const datetime = releaseDateElement.attr('datetime')
        if (datetime) {
          releaseDate = new Date(datetime).getTime().toString()
        }
      }
    }

    // 提取开发商信息
    const developers: string[] = []
    if (metaBlocks.length > 3) {
      metaBlocks.eq(3).find('a.game__meta-filter-link').each((_, element) => {
        const developerName = $(element).text().trim()
        if (developerName) developers.push(developerName)
      })
    }

    // 提取发行商信息
    const publishers: string[] = []
    if (metaBlocks.length > 4) {
      metaBlocks.eq(4).find('a.game__meta-filter-link').each((_, element) => {
        const publisherName = $(element).text().trim()
        if (publisherName) publishers.push(publisherName)
      })
    }

    // 提取游戏描述
    let description = ''
    const descriptionElement = $('.game__about-text p')
    if (descriptionElement.length) {
      description = descriptionElement.text().trim()
    }

    // 提取游戏标签
    const tags: string[] = []
    if (metaBlocks.length > 6) {
      metaBlocks.eq(6).find('a.game__meta-filter-link').each((_, element) => {
        const tagName = $(element).text().trim()
        if (tagName) tags.push(tagName)
      })
    }

    // 提取平台信息
    const platforms: string[] = []
    if (metaBlocks.length > 0) {
      metaBlocks.eq(0).find('a.game__meta-filter-link').each((_, element) => {
        const platformName = $(element).text().trim()
        if (platformName) platforms.push(platformName)
      })
    }

    // 相关站点和额外信息
    const relatedSites = [{ label: 'RAWG', url: url }]
    const extra = [{ key: 'slug', value: [slug] }]

    return {
      name,
      originalName,
      releaseDate,
      description,
      developers,
      relatedSites,
      tags,
      extra
    }
  } catch (error) {
    console.error(`[RAWG 插件] 通过 slug [${slug}] 搜索游戏元数据时发生错误:`, error)
    throw new Error('通过slug搜索游戏元数据失败')
  }
}

/**
 * 根据游戏slug获取所有图片链接
 */
async function getGameImages(slug: string): Promise<string[]> {
  try {
    const url = `https://rawg.io/games/${slug}`
  
    // const images = await extractImagesFromUrl(url, {
    //   extractImgTags: true,
    //   extractCssBackgrounds: true,
    //   extractJsonData: false,
    //   extractMetaImages: true,
    //   customSelectors: []
    // })

    const extraData = await extractImagesFromUrl(url, {
      extractImgTags: true,
      extractCssBackgrounds: true,
      extractMetaImages: true,
    })
    console.log(`[RAWG 插件] 通过 slug [${slug}] 搜索到的图片数量 ${extraData.total}`)

    console.log(`[RAWG 插件] 通过 slug [${slug}] 搜索到的图片链接:`, extraData.urls)

    if(extraData.total === 0) {
      throw new Error('没有搜索到游戏图片')
    }

    return extraData.urls
  } catch (error) {
    console.error(`[RAWG 插件] 通过 slug [${slug}] 搜索游戏图片时发生错误:`, error)
    throw new Error('通过slug搜索游戏图片失败')
  }
}

export const provider: ScraperProvider = {
  id: 'rawg-scraper',
  name: 'Rawg Scraper',

  /**
   * 搜索游戏信息
   */
async searchGames(gameName: string): Promise<GameList> {
    try {
      return await searchGamesByName(gameName)
    } catch (error) {
      console.error(`[RAWG 插件] 搜索游戏 [名称: ${gameName}] 时发生错误:`, error)
      throw new Error('搜索游戏失败')
    }
  },

  /**
   * 检查游戏是否存在
   */
async checkGameExists(identifier: ScraperIdentifier): Promise<boolean> {
    try {
      if (identifier.type === 'id') {
        const url = `https://rawg.io/games/${identifier.value}`
        const response = await fetch(url, {
          headers: {
            'User-Agent': 
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        })
        return response.ok
      } else if (identifier.type === 'name') {
        const games = await searchGamesByName(identifier.value)
        return games.length > 0
      } else {
        throw new Error('无效的标识符类型')
      }
    } catch (error) {
      console.error(
        `[RAWG 插件] 检查游戏 [${identifier.type}: ${identifier.value}] 是否存在时发生错误:`,
        error
      )
      return false
    }
  },

  /**
   * 获取游戏的详细元数据
   */
async getGameMetadata(identifier: ScraperIdentifier): Promise<GameMetadata> {
    try {
      let gameSlug: string
      if (identifier.type === 'name') {
        const games = await searchGamesByName(identifier.value)
        if (games.length === 0) {
          throw new Error('游戏不存在')
        }
        gameSlug = games[0].id
      } else {
        gameSlug = identifier.value
      }

      return await getGameMetadataBySlug(gameSlug)
    } catch (error) {
      console.error(
        `[RAWG 插件] 获取游戏 [${identifier.type}: ${identifier.value}] 元数据时发生错误:`,
        error
      )
      throw new Error('获取游戏元数据失败')
    }
  },

  /**
   * 获取游戏的背景图片URL列表
   */
async getGameBackgrounds(identifier: ScraperIdentifier): Promise<string[]> {
    try {
      let gameSlug: string
      if (identifier.type === 'name') {
        const metadata = await this.getGameMetadata!(identifier)
        gameSlug = metadata.extra!.find((item) => item.key === 'slug')?.value[0] || ''
      } else {
        gameSlug = identifier.value
      }
      return await getGameImages(gameSlug)
    } catch (error) {
      console.error(
        `[RAWG 插件] 获取游戏 [${identifier.type}: ${identifier.value}] 背景图时发生错误:`,
        error
      )
      return []
    }
  },

  /**
   * 获取游戏的封面图片URL列表
   */
async getGameCovers(identifier: ScraperIdentifier): Promise<string[]> {
    try {
      let gameSlug: string
      if (identifier.type === 'name') {
        const metadata = await this.getGameMetadata!(identifier)
        gameSlug = metadata.extra!.find((item) => item.key === 'slug')?.value[0] || ''
      } else {
        gameSlug = identifier.value
      }
      return await getGameImages(gameSlug)
    } catch (error) {
      console.error(
        `[RAWG 插件] 获取游戏 [${identifier.type}: ${identifier.value}] 封面图时发生错误:`,
        error
      )
      return []
    }
  },

  /**
   * 获取游戏的logo图片URL列表
   */
async getGameLogos(identifier: ScraperIdentifier): Promise<string[]> {
    try {
      let gameSlug: string
      if (identifier.type === 'name') {
        const metadata = await this.getGameMetadata!(identifier)
        gameSlug = metadata.extra!.find((item) => item.key === 'slug')?.value[0] || ''
      } else {
        gameSlug = identifier.value
      }
      return await getGameImages(gameSlug)
    } catch (error) {
      console.error(
        `[RAWG 插件] 获取游戏 [${identifier.type}: ${identifier.value}] logo时发生错误:`,
        error
      )
      return []
    }
  },

  /**
   * 获取游戏的图标图片URL列表
   */
async getGameIcons(identifier: ScraperIdentifier): Promise<string[]> {
    try {
      let gameSlug: string
      if (identifier.type === 'name') {
        const metadata = await this.getGameMetadata!(identifier)
        gameSlug = metadata.extra!.find((item) => item.key === 'slug')?.value[0] || ''
      } else {
        gameSlug = identifier.value
      }
      return await getGameImages(gameSlug)
    } catch (error) {
      console.error(
        `[RAWG 插件] 获取游戏 [${identifier.type}: ${identifier.value}] 图标时发生错误:`,
        error
      )
      return []
    }
  }
}