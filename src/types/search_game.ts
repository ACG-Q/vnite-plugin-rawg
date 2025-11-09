// 仅包含与 GameList 对应的必要字段
interface SearchGame {
    // 游戏ID（对应 GameList 中的 id）
    slug: string;
    // 游戏名称
    name: string;
    // 发布时间（对应 GameList 中的 releaseDate）
    released: string;
    // todo: 没有 对应 GameList 中的 developers 的值
}

// 游戏搜索结果类型
interface SearchGameResult {
    count: number;
    next: string | null;
    previous: string | null;
    results: SearchGame[];
    user_platforms: boolean;
}

// 默认导出 SearchGame 类型
export default SearchGameResult;