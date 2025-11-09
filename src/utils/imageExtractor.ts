import * as cheerio from 'cheerio';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

/**
 * 图片提取选项
 */
export interface ImageExtractOptions {
  /** 是否提取img标签中的图片 */
  extractImgTags?: boolean;
  /** 是否提取CSS背景图片 */
  extractCssBackgrounds?: boolean;
  /** 是否提取meta标签中的图片 */
  extractMetaImages?: boolean;
  /** 是否从JS代码中提取图片 */
  extractJsImages?: boolean;
  /** 图片URL过滤函数 */
  urlFilter?: (url: string) => boolean;
  /** 请求超时时间（毫秒） */
  timeout?: number;
  /** User-Agent */
  userAgent?: string;
}

/**
 * 提取结果
 */
export interface ExtractResult {
  /** 图片URL列表 */
  urls: string[];
  /** 总数量 */
  total: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 从HTML字符串中提取所有图片URL
 * @param html HTML字符串
 * @param baseUrl 基础URL，用于处理相对路径
 * @param options 提取选项
 * @returns 图片URL集合
 */
export async function extractImagesFromHtml(
  html: string,
  baseUrl: string,
  options: ImageExtractOptions = {}
): Promise<ExtractResult> {
  try {
    // 设置默认选项
    const defaultOptions = {
      extractImgTags: true,
      extractCssBackgrounds: true,
      extractMetaImages: true,
      extractJsImages: true, // 新增：默认从JS代码中提取图片
      urlFilter: () => true,
      timeout: 10000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const mergedOptions = { ...defaultOptions, ...options };
    const { 
      extractImgTags, 
      extractCssBackgrounds, 
      extractMetaImages, 
      extractJsImages,
      urlFilter 
    } = mergedOptions;

    const $ = cheerio.load(html);
    const imageUrls: Set<string> = new Set();

    // 1. 提取标准img标签图片
    if (extractImgTags) {
      $('img').each((_, element) => {
        const $img = $(element);
        
        // 检查多个可能的src属性
        const srcAttributes = [
          'src', 
          'data-src', 
          'data-original', 
          'data-lazy-src',
          'data-srcset',
          'data-original-src',
          'data-lazyload',
          'data-url',
          'data-image'
        ];
        
        const elementImageUrls = new Set<string>();
        
        for (const attr of srcAttributes) {
          const imgSrc = $img.attr(attr);
          if (imgSrc) {
            const fullUrl = normalizeUrl(imgSrc, baseUrl);
            if (fullUrl && isValidImageUrl(fullUrl) && urlFilter(fullUrl)) {
              elementImageUrls.add(fullUrl);
            }
          }
        }

        // 检查srcset属性
        const srcset = $img.attr('srcset');
        if (srcset) {
          const srcsetUrls = parseSrcset(srcset);
          srcsetUrls.forEach((url) => {
            const fullUrl = normalizeUrl(url, baseUrl);
            if (fullUrl && isValidImageUrl(fullUrl) && urlFilter(fullUrl)) {
              elementImageUrls.add(fullUrl);
            }
          });
        }

        // 将所有找到的图片URL添加到主集合中
        elementImageUrls.forEach(url => imageUrls.add(url));
      });
    }

    // 2. 提取CSS背景图片
    if (extractCssBackgrounds) {
      // 提取内联样式中的背景图片
      $('[style*="background"]').each((_, element) => {
        const style = $(element).attr('style');
        if (style) {
          const backgroundImages = extractBackgroundImages(style);
          backgroundImages.forEach((imgUrl) => {
            const fullUrl = normalizeUrl(imgUrl, baseUrl);
            if (fullUrl && isValidImageUrl(fullUrl) && urlFilter(fullUrl)) {
              imageUrls.add(fullUrl);
            }
          });
        }
      });

      // 提取style标签中的背景图片
      $('style').each((_, styleElement) => {
        const styleContent = $(styleElement).html() || '';
        const backgroundImages = extractBackgroundImages(styleContent);
        backgroundImages.forEach((imgUrl) => {
          const fullUrl = normalizeUrl(imgUrl, baseUrl);
          if (fullUrl && isValidImageUrl(fullUrl) && urlFilter(fullUrl)) {
            imageUrls.add(fullUrl);
          }
        });
      });
    }

    // 3. 提取meta标签中的图片
    if (extractMetaImages) {
      const metaSelectors = [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:secure_url"]',
        'meta[name="og:image"]'
      ];
      
      metaSelectors.forEach(selector => {
        $(selector).each((_, element) => {
          const imgUrl = $(element).attr('content');
          if (imgUrl) {
            const fullUrl = normalizeUrl(imgUrl, baseUrl);
            if (fullUrl && isValidImageUrl(fullUrl) && urlFilter(fullUrl)) {
              imageUrls.add(fullUrl);
            }
          }
        });
      });
    }

    // 4. 新增：从JS代码中提取图片
    if (extractJsImages) {
      const jsImages = extractImagesFromScriptTags(html, baseUrl);
      jsImages.forEach(url => {
        if (urlFilter(url)) {
          imageUrls.add(url);
        }
      });
    }

    return {
      urls: Array.from(imageUrls),
      total: imageUrls.size
    };
  } catch (error) {
    return {
      urls: [],
      total: 0,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 从URL加载网页并提取图片
 * @param url 网页URL
 * @param options 提取选项
 * @returns 图片URL集合
 */
export async function extractImagesFromUrl(
  url: string,
  options: ImageExtractOptions = {}
): Promise<ExtractResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

  try {
    // 验证URL格式
    if (!url.startsWith('http')) {
      throw new Error('URL必须以http://或https://开头');
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP错误! 状态: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('text/html')) {
      throw new Error(`不支持的内容类型: ${contentType}`);
    }

    const html = await response.text();
    const baseUrl = new URL(url).origin;

    return await extractImagesFromHtml(html, baseUrl, options);
  } catch (error) {
    clearTimeout(timeoutId);
    
    let errorMessage = '未知错误';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = '请求超时';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      urls: [],
      total: 0,
      error: `提取URL [${url}] 中的图片时发生错误: ${errorMessage}`
    };
  }
}

/**
 * 规范化URL，处理相对路径
 */
export function normalizeUrl(url: string, baseUrl: string): string {
  if (!url || url.trim() === '') return '';

  let fullUrl = url.trim();

  // 处理data URL（直接返回，但通常会被过滤掉）
  if (fullUrl.startsWith('data:')) {
    return fullUrl;
  }

  try {
    // 处理协议相对URL
    if (fullUrl.startsWith('//')) {
      fullUrl = `https:${fullUrl}`;
    }
    
    // 处理锚点链接和JavaScript链接
    if (fullUrl.startsWith('#') || fullUrl.startsWith('javascript:')) {
      return '';
    }
    
    const base = new URL(baseUrl);
    
    if (fullUrl.startsWith('/')) {
      fullUrl = `${base.origin}${fullUrl}`;
    } else if (!fullUrl.startsWith('http')) {
      const basePath = base.pathname.endsWith('/') 
        ? base.pathname 
        : base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
      fullUrl = `${base.origin}${basePath}${fullUrl}`;
    }

    // 创建URL对象验证格式
    new URL(fullUrl);
    return fullUrl;
  } catch (error) {
    console.warn(`无法规范化URL: ${url}`, error);
    return '';
  }
}

/**
 * 检查是否为有效的图片URL（不验证图片是否存在）
 */
function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  
  // 检查data URL（通常不提取，但保留判断逻辑）
  if (url.startsWith('data:')) {
    return url.startsWith('data:image/');
  }
  
  // 检查常见图片扩展名
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'];
  const urlLower = url.toLowerCase();
  
  // 检查扩展名
  if (imageExtensions.some(ext => urlLower.includes(ext))) {
    return true;
  }
  
  // 检查常见的图片路径模式
  const imagePatterns = ['/images/', '/img/', '/assets/', '/static/', 'image=', 'img='];
  if (imagePatterns.some(pattern => urlLower.includes(pattern))) {
    return true;
  }
  
  return false;
}

/**
 * 从CSS文本中提取背景图片URL
 */
function extractBackgroundImages(cssText: string): string[] {
  const backgroundImageRegex = /url\(['"]?([^'")]+)['"]?\)/gi;
  const urls: string[] = [];
  let match;

  while ((match = backgroundImageRegex.exec(cssText)) !== null) {
    let url = match[1].trim();
    // 移除可能的引号
    if (url.startsWith('"') && url.endsWith('"')) {
      url = url.slice(1, -1);
    } else if (url.startsWith("'") && url.endsWith("'")) {
      url = url.slice(1, -1);
    }
    urls.push(url);
  }

  return urls;
}

/**
 * 解析srcset属性，提取所有图片URL
 */
function parseSrcset(srcset: string): string[] {
  const urls: string[] = [];
  const entries = srcset.split(',');

  entries.forEach((entry) => {
    const trimmed = entry.trim();
    // 提取URL部分（第一个非空白字符序列）
    const urlMatch = trimmed.match(/^([^\s]+)/);
    if (urlMatch) {
      urls.push(urlMatch[1]);
    }
  });

  return urls;
}

// ================ 新增：JS代码图片提取功能 ================

/**
 * 从JavaScript代码中提取图片URL
 */
function extractImagesFromJsCode(
  jsCode: string,
  baseUrl: string = ''
): string[] {
  const imageUrls: Set<string> = new Set();
  
  // 方法1: 静态正则匹配（快速，覆盖广）
  const regexMatches = extractImagesWithRegex(jsCode, baseUrl);
  regexMatches.forEach(url => imageUrls.add(url));
  
  // 方法2: AST语法分析（精确，避免误匹配）
  const astMatches = extractImagesWithAST(jsCode, baseUrl);
  astMatches.forEach(url => imageUrls.add(url));
  
  return Array.from(imageUrls);
}

/**
 * 使用正则表达式提取图片URL
 */
function extractImagesWithRegex(jsCode: string, baseUrl: string): string[] {
  const urls: string[] = [];
  
  // 1. 匹配完整的图片URL
  const httpPatterns = [
    /(https?:\/\/[^\s"'<>{}()]+\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))(?![\w])/gi,
    /(https?:\/\/[^\s"'<>{}()]*\/[^\s"'<>{}()]*\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))(?:\?[^\s"'<>{}()]*)?/gi
  ];
  
  // 2. 匹配相对路径图片
  const relativePatterns = [
    /['"`](\.\.?\/[^\s"'`<>{}()]*\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))['"`]/gi,
    /['"`](\/[^\s"'`<>{}()]*\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))['"`]/gi,
    /['"`]([^\s"'`<>{}()]*\/(images?|img|assets|static)\/[^\s"'`<>{}()]*\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))['"`]/gi
  ];
  
  // 3. 匹配常见的图片配置模式
  const configPatterns = [
    /(?:src|url|image|img|background|bg)[\s]*:[\s]*['"`]([^\s"'`<>{}()]+\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))['"`]/gi,
    /(?:src|url|image|img|background|bg)[\s]*=[\s]*['"`]([^\s"'`<>{}()]+\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))['"`]/gi,
    /(?:images?|pictures?|photos?)[\s]*:[\s]*\[[^\]]*['"`]([^\s"'`<>{}()]+\.(jpg|jpeg|png|gif|webp|bmp|svg|ico))['"`]/gi
  ];
  
  // 4. 匹配base64图片
  const base64Pattern = /data:image\/(png|jpg|jpeg|gif|webp|bmp|svg\+xml);base64,[^"']+/gi;
  
  // 执行所有正则匹配
  const allPatterns = [
    ...httpPatterns,
    ...relativePatterns, 
    ...configPatterns,
    base64Pattern
  ];
  
  allPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(jsCode)) !== null) {
      // 提取匹配组中的URL（通常是第一个捕获组）
      const url = match[1] || match[0];
      if (url && isValidImageUrl(url)) {
        const fullUrl = normalizeUrl(url, baseUrl);
        if (fullUrl) {
          urls.push(fullUrl);
        }
      }
    }
  });
  
  return urls;
}

/**
 * 使用AST语法分析提取图片URL
 */
function extractImagesWithAST(jsCode: string, baseUrl: string): string[] {
  const urls: string[] = [];
  
  try {
    // 解析JavaScript代码为AST
    const ast = parse(jsCode, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'] // 支持JSX和TypeScript
    });
    
    // 遍历AST节点
    traverse(ast, {
      // 处理字符串字面量
      StringLiteral(path) {
        const value = path.node.value;
        if (isValidImageUrl(value)) {
          const fullUrl = normalizeUrl(value, baseUrl);
          if (fullUrl) {
            urls.push(fullUrl);
          }
        }
      },
      
      // 处理模板字面量
      TemplateLiteral(path) {
        // 检查模板字符串是否包含图片扩展名
        const quasis = path.node.quasis;
        quasis.forEach(quasi => {
          const value = quasi.value.raw;
          if (isValidImageUrl(value)) {
            const fullUrl = normalizeUrl(value, baseUrl);
            if (fullUrl) {
              urls.push(fullUrl);
            }
          }
        });
      },
      
      // 处理对象属性（配置对象中的图片）
      ObjectProperty(path) {
        const key = path.node.key;
        const value = path.node.value;
        
        // 检查键名是否与图片相关
        if (t.isIdentifier(key) && isImageRelatedKey(key.name)) {
          if (t.isStringLiteral(value)) {
            const url = value.value;
            if (isValidImageUrl(url)) {
              const fullUrl = normalizeUrl(url, baseUrl);
              if (fullUrl) {
                urls.push(fullUrl);
              }
            }
          }
        }
      },
      
      // 处理变量声明（可能包含图片URL）
      VariableDeclarator(path) {
        const id = path.node.id;
        const init = path.node.init;
        
        // 检查变量名是否与图片相关
        if (t.isIdentifier(id) && isImageRelatedKey(id.name)) {
          if (t.isStringLiteral(init)) {
            const url = init.value;
            if (isValidImageUrl(url)) {
              const fullUrl = normalizeUrl(url, baseUrl);
              if (fullUrl) {
                urls.push(fullUrl);
              }
            }
          }
        }
      },
      
      // 处理赋值表达式
      AssignmentExpression(path) {
        const left = path.node.left;
        const right = path.node.right;
        
        // 检查左侧是否为成员表达式（如 obj.src, element.background）
        if (t.isMemberExpression(left)) {
          const property = left.property;
          if (t.isIdentifier(property) && isImageRelatedKey(property.name)) {
            if (t.isStringLiteral(right)) {
              const url = right.value;
              if (isValidImageUrl(url)) {
                const fullUrl = normalizeUrl(url, baseUrl);
                if (fullUrl) {
                  urls.push(fullUrl);
                }
              }
            }
          }
        }
      },
      
      // 处理函数调用（如 setAttribute, style.setProperty）
      CallExpression(path) {
        const callee = path.node.callee;
        const args = path.node.arguments;
        
        // 处理 setAttribute('src', url) 模式
        if (t.isMemberExpression(callee) && 
            t.isIdentifier(callee.property) && 
            callee.property.name === 'setAttribute') {
          
          if (args.length >= 2 && 
              t.isStringLiteral(args[0]) && 
              isImageRelatedKey(args[0].value) && 
              t.isStringLiteral(args[1])) {
            
            const url = args[1].value;
            if (isValidImageUrl(url)) {
              const fullUrl = normalizeUrl(url, baseUrl);
              if (fullUrl) {
                urls.push(fullUrl);
              }
            }
          }
        }
        
        // 处理 require() 和 import() 中的图片
        if (t.isIdentifier(callee) && 
            (callee.name === 'require' || callee.name === 'import')) {
          
          if (args.length > 0 && t.isStringLiteral(args[0])) {
            const modulePath = args[0].value;
            if (isValidImageUrl(modulePath)) {
              const fullUrl = normalizeUrl(modulePath, baseUrl);
              if (fullUrl) {
                urls.push(fullUrl);
              }
            }
          }
        }
      }
    });
    
  } catch (error) {
    // 如果AST解析失败，静默失败，依赖正则匹配
    console.warn('AST解析失败，回退到正则匹配:', error);
  }
  
  return urls;
}

/**
 * 检查键名是否与图片相关
 */
function isImageRelatedKey(key: string): boolean {
  const imageKeys = [
    'src', 'url', 'image', 'img', 'background', 'bg', 
    'picture', 'photo', 'icon', 'avatar', 'logo',
    'backgroundImage', 'srcset', 'dataSrc', 'dataUrl'
  ];
  
  return imageKeys.some(imageKey => 
    key.toLowerCase().includes(imageKey)
  );
}

/**
 * 从script标签中提取图片URL
 */
function extractImagesFromScriptTags(
  html: string,
  baseUrl: string
): string[] {
  const $ = cheerio.load(html);
  const allImageUrls: string[] = [];
  
  // 提取所有script标签中的JS代码
  $('script').each((_, element) => {
    const $script = $(element);
    const scriptContent = $script.html() || '';
    
    // 跳过空内容和外部脚本（有src属性的）
    if (scriptContent.trim() && !$script.attr('src')) {
      const result = extractImagesFromJsCode(scriptContent, baseUrl);
      allImageUrls.push(...result);
    }
  });
  
  return [...new Set(allImageUrls)]; // 去重
}

export default {
  extractImagesFromHtml,
  extractImagesFromUrl,
  normalizeUrl
};