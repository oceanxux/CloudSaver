import { AxiosInstance, AxiosHeaders } from "axios";
import { createAxiosInstance } from "../utils/axiosInstance";
import * as cheerio from "cheerio";
import { createCipheriv } from "crypto";
import { config } from "../config";
import { logger } from "../utils/logger";

interface CloudLinkItem {
  cloudType: string;
  link: string;
}

interface SourceItem {
  messageId?: string;
  title?: string;
  completeTitle?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  description?: string;
  image?: string;
  cloudLinks?: CloudLinkItem[];
  tags?: string[];
  cloudType?: string;
  sourceName?: string;
  articleUrl?: string;
}

interface SearchGroup {
  list: SourceItem[];
  channelInfo: {
    id?: string;
    name: string;
    channelLogo: string;
  };
  id: string;
  supportsLoadMore?: boolean;
}

interface ExternalPost {
  id: string;
  title: string;
  url: string;
  abstract: string;
}

interface TianyisoFetchResult {
  html: string;
  status: number;
  challenged: boolean;
}

interface SolverCookie {
  name: string;
  value: string;
}

interface SolverResponse {
  status?: string;
  message?: string;
  solution?: {
    response?: string;
    userAgent?: string;
    cookies?: SolverCookie[];
  };
}

export class Searcher {
  private static instance: Searcher;
  private api: AxiosInstance | null = null;
  private readonly leijingBaseUrl = "https://www.leijing2.com";
  private readonly leijingMaxPosts = 8;
  private readonly leijingRememberCookieHeader = [
    "33ee0edee363cf05042563418af465a8__typecho_remember_author=cloud189-user",
    "33ee0edee363cf05042563418af465a8__typecho_remember_mail=cloud189-user%40example.com",
  ].join("; ");
  private readonly tianyisoBaseUrl = "https://www.tianyiso.com";
  private readonly tianyisoMaxPosts = 12;
  private tianyisoRuntimeCookieHeader = "";
  private tianyisoRuntimeUserAgent = "";

  constructor() {
    this.initAxiosInstance();
    Searcher.instance = this;
  }

  private initAxiosInstance() {
    this.api = createAxiosInstance(
      config.telegram.baseUrl,
      AxiosHeaders.from({
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
        "cache-control": "max-age=0",
        priority: "u=0, i",
        "sec-ch-ua": '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      }),
      config.proxy.enabled,
      config.proxy.enabled ? { host: config.proxy.host, port: config.proxy.port } : undefined
    );
  }

  public static async updateAxiosInstance(): Promise<void> {
    Searcher.instance.initAxiosInstance();
  }

  private extractCloudLinks(text: string): { links: CloudLinkItem[]; cloudType: string } {
    const links = new Map<string, CloudLinkItem>();
    let cloudType = "";
    Object.entries(config.cloudPatterns).forEach(([type, pattern]) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((link) => {
          links.set(link, {
            cloudType: type,
            link,
          });
        });
        if (!cloudType) {
          cloudType = type;
        }
      }
    });
    return {
      links: Array.from(links.values()),
      cloudType,
    };
  }

  async searchAll(keyword: string, channelId?: string, messageId?: string) {
    const allResults: SearchGroup[] = [];
    const isLeijingOnly = channelId === "leijing2";
    const isTianyisoOnly = channelId === "tianyiso";

    const channelList: any[] = isLeijingOnly || isTianyisoOnly
      ? []
      : channelId
      ? config.telegram.channels.filter((channel: any) => channel.id === channelId)
      : config.telegram.channels;

    if (channelList.length === 0 && !isLeijingOnly && !isTianyisoOnly && channelId) {
      return {
        data: [],
      };
    }

    const searchPromises = channelList.map(async (channel) => {
      try {
        const messageIdparams = messageId ? `before=${messageId}` : "";
        const url = `/${channel.id}${keyword ? `?q=${encodeURIComponent(keyword)}&${messageIdparams}` : `?${messageIdparams}`}`;
        logger.info(`Searching in channel ${channel.name} with URL: ${url}`);
        return this.searchInWeb(url).then((results) => {
          logger.info(`Found ${results.items.length} items in channel ${channel.name}`);
          if (results.items.length > 0) {
            const channelResults = results.items
              .filter((item: SourceItem) => item.cloudLinks && item.cloudLinks.length > 0)
              .map((item: SourceItem) => ({
                ...item,
                channel: channel.name,
                channelId: channel.id,
              }));

            allResults.push({
              list: channelResults,
              channelInfo: {
                ...channel,
                channelLogo: results.channelLogo,
              },
              id: channel.id,
            });
          }
        });
      } catch (error) {
        logger.error(`搜索频道 ${channel.name} 失败:`, error);
      }
    });

    await Promise.all(searchPromises);

    if (!messageId && (!channelId || isLeijingOnly)) {
      try {
        const leijingGroup = await this.searchLeijing(keyword);
        if (leijingGroup.list.length > 0) {
          allResults.push(leijingGroup);
        }
      } catch (error) {
        logger.error("搜索雷鲸小站失败:", error);
      }
    }

    if (!messageId && (!channelId || isTianyisoOnly)) {
      try {
        const tianyisoGroup = await this.searchTianyiso(keyword);
        if (tianyisoGroup.list.length > 0) {
          allResults.push(tianyisoGroup);
        }
      } catch (error) {
        logger.error("搜索天翼搜失败:", error);
      }
    }

    return {
      data: allResults,
    };
  }

  async searchInWeb(url: string) {
    try {
      if (!this.api) {
        throw new Error("Axios instance is not initialized");
      }
      const response = await this.api.get(url);
      const html = response.data;
      const $ = cheerio.load(html);
      const items: SourceItem[] = [];
      let channelLogo = "";
      $(".tgme_header_link").each((_, element) => {
        channelLogo = $(element).find("img").attr("src") || "";
      });
      // 遍历每个消息容器
      $(".tgme_widget_message_wrap").each((_, element) => {
        const messageEl = $(element);

        const messageId = messageEl
          .find(".tgme_widget_message")
          .data("post")
          ?.toString()
          .split("/")[1];

        const title =
          messageEl
            .find(".js-message_text")
            .html()
            ?.split("<br>")[0]
            .replace(/<[^>]+>/g, "")
            .replace(/\n/g, "") || "";

        const content =
          messageEl
            .find(".js-message_text")
            .html()
            ?.replace(title, "")
            .split("<a")[0]
            .replace(/<br>/g, "")
            .trim() || "";

        const pubDate = messageEl.find("time").attr("datetime");

        const image = messageEl
          .find(".tgme_widget_message_photo_wrap")
          .attr("style")
          ?.match(/url\('(.+?)'\)/)?.[1];

        const tags: string[] = [];
        const links = messageEl
          .find(".tgme_widget_message_text a")
          .map((_, el) => $(el).attr("href"))
          .get();
        messageEl.find(".tgme_widget_message_text a").each((index, element) => {
          const tagText = $(element).text();
          if (tagText && tagText.startsWith("#")) {
            tags.push(tagText);
          }
        });
        const cloudInfo = this.extractCloudLinks(links.join(" "));
        items.unshift({
          messageId,
          title,
          pubDate,
          content,
          image,
          cloudLinks: cloudInfo.links,
          cloudType: cloudInfo.cloudType,
          tags,
        });
      });
      return { items: items, channelLogo };
    } catch (error) {
      logger.error(`搜索错误: ${url}`, error);
      return {
        items: [],
        channelLogo: "",
      };
    }
  }

  private async searchLeijing(keyword: string): Promise<SearchGroup> {
    const html = await this.fetchLeijingSearchPage(keyword);
    const posts = this.parseLeijingPosts(html).slice(0, this.leijingMaxPosts);
    const list: SourceItem[] = [];

    const detailResults = await Promise.allSettled(
      posts.map(async (post) => this.resolveLeijingPost(post))
    );

    detailResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        list.push(result.value);
      }
    });

    return {
      id: "leijing2",
      supportsLoadMore: false,
      channelInfo: {
        id: "leijing2",
        name: "雷鲸小站",
        channelLogo: "",
      },
      list,
    };
  }

  private async fetchLeijingSearchPage(keyword: string): Promise<string> {
    const url = `${this.leijingBaseUrl}/index.php/search/${encodeURIComponent(keyword)}/`;
    const response = await this.api?.get(url, {
      baseURL: undefined,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    return String(response?.data || "");
  }

  private async fetchLeijingArticlePage(url: string): Promise<string> {
    const response = await this.api?.get(url, {
      baseURL: undefined,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: this.leijingRememberCookieHeader,
      },
    });
    return String(response?.data || "");
  }

  private parseLeijingPosts(html: string): ExternalPost[] {
    const posts: ExternalPost[] = [];
    const pattern =
      /<a href="([^"]+\/archives\/(\d+)\/)" class="title" title="([^"]+)">[\s\S]*?<a class="abstract" href="[^"]+" title="文章摘要">([\s\S]*?)<\/a>/g;

    for (const match of html.matchAll(pattern)) {
      posts.push({
        id: match[2],
        title: this.decodeHtml(match[3]).trim(),
        url: new URL(match[1], this.leijingBaseUrl).toString(),
        abstract: this.stripTags(this.decodeHtml(match[4])).trim(),
      });
    }
    return posts;
  }

  private async resolveLeijingPost(post: {
    id: string;
    title: string;
    url: string;
    abstract: string;
  }): Promise<SourceItem | null> {
    const linkSet = new Map<string, CloudLinkItem>();

    this.extractTianyiShareLinks(post.abstract).forEach((link) => {
      linkSet.set(link, { cloudType: "tianyi", link });
    });

    try {
      const html = await this.fetchLeijingArticlePage(post.url);
      const content = this.extractLeijingArticleContent(html);
      this.extractTianyiShareLinks(content).forEach((link) => {
        linkSet.set(link, { cloudType: "tianyi", link });
      });
    } catch (error) {
      logger.warn(`抓取雷鲸文章失败: ${post.url}`);
    }

    const cloudLinks = Array.from(linkSet.values());
    if (!cloudLinks.length) {
      return null;
    }

    return {
      messageId: `leijing-${post.id}`,
      title: post.title,
      completeTitle: post.title,
      pubDate: "",
      content: "来自雷鲸小站的帖子分享链接",
      cloudLinks,
      cloudType: "tianyi",
      tags: ["#雷鲸小站"],
      sourceName: "雷鲸小站",
      articleUrl: post.url,
    };
  }

  private extractLeijingArticleContent(html: string): string {
    const match = html.match(/<article class="joe_detail__article"[^>]*>([\s\S]*?)<\/article>/);
    return match ? match[1] : html;
  }

  private async searchTianyiso(keyword: string): Promise<SearchGroup> {
    const html = await this.fetchTianyisoSearchPage(keyword);
    const posts = this.parseTianyisoPosts(html, keyword).slice(0, this.tianyisoMaxPosts);
    const list: SourceItem[] = [];

    const detailResults = await Promise.allSettled(
      posts.map(async (post) => this.resolveTianyisoPost(post, keyword))
    );

    detailResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        list.push(result.value);
      }
    });

    return {
      id: "tianyiso",
      supportsLoadMore: false,
      channelInfo: {
        id: "tianyiso",
        name: "天翼搜",
        channelLogo: "",
      },
      list,
    };
  }

  private async fetchTianyisoSearchPage(keyword: string): Promise<string> {
    const url = `${this.tianyisoBaseUrl}/search?k=${encodeURIComponent(keyword)}`;
    return this.fetchTianyisoPage(url, this.tianyisoBaseUrl);
  }

  private async fetchTianyisoArticlePage(url: string): Promise<string> {
    return this.fetchTianyisoPage(url, `${this.tianyisoBaseUrl}/`);
  }

  private async fetchTianyisoPage(url: string, referer: string): Promise<string> {
    const directResult = await this.fetchTianyisoDirect(url, referer);
    if (!directResult.challenged) {
      return directResult.html;
    }

    const legacyBypassCookie = this.createTianyisoBypassCookie(directResult.html);
    if (legacyBypassCookie) {
      logger.info(`检测到旧版天翼搜校验页，尝试注入绕过 cookie: ${url}`);
      const legacyResult = await this.fetchTianyisoDirect(url, referer, legacyBypassCookie);
      if (!legacyResult.challenged) {
        return legacyResult.html;
      }
    }

    const solverResult = await this.fetchTianyisoViaSolver(url);
    if (solverResult && !solverResult.challenged) {
      logger.info(`天翼搜已通过求解器返回可用页面: ${url}`);
      return solverResult.html;
    }

    logger.warn(
      `天翼搜仍处于 Cloudflare 校验状态，当前状态码: ${directResult.status}，URL: ${url}`
    );
    return directResult.html;
  }

  private async fetchTianyisoDirect(
    url: string,
    referer: string,
    extraCookieHeader: string = ""
  ): Promise<TianyisoFetchResult> {
    const response = await this.api?.get(url, {
      baseURL: undefined,
      headers: this.buildTianyisoHeaders(referer, extraCookieHeader),
      validateStatus: () => true,
    });

    const html = String(response?.data || "");
    const status = Number(response?.status || 0);
    return {
      html,
      status,
      challenged: this.isTianyisoChallengeResponse(status, response?.headers, html),
    };
  }

  private buildTianyisoHeaders(referer: string, extraCookieHeader: string = "") {
    const cookieHeader = this.mergeCookieHeaders(
      config.tianyiso.cookie,
      this.tianyisoRuntimeCookieHeader,
      extraCookieHeader
    );

    return {
      "User-Agent": this.getTianyisoUserAgent(),
      Referer: referer,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Upgrade-Insecure-Requests": "1",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
  }

  private getTianyisoUserAgent(): string {
    return this.tianyisoRuntimeUserAgent || config.tianyiso.userAgent;
  }

  private mergeCookieHeaders(...cookieHeaders: string[]): string {
    const cookieMap = new Map<string, string>();

    cookieHeaders
      .filter(Boolean)
      .flatMap((header) => header.split(";"))
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex <= 0) {
          return;
        }

        const name = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        if (name && value) {
          cookieMap.set(name, value);
        }
      });

    return Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private isTianyisoChallengeResponse(
    status: number,
    headers: Record<string, unknown> | undefined,
    html: string
  ): boolean {
    const cfMitigated = String(headers?.["cf-mitigated"] || "").toLowerCase();
    const server = String(headers?.server || "").toLowerCase();

    if (cfMitigated === "challenge") {
      return true;
    }

    return (
      (status === 403 && server.includes("cloudflare")) ||
      /<title>\s*(?:Just a moment|请稍候)/i.test(html) ||
      /Performing security verification/i.test(html) ||
      /cf-turnstile-response/i.test(html) ||
      /cdn-cgi\/challenge-platform/i.test(html)
    );
  }

  private async fetchTianyisoViaSolver(url: string): Promise<TianyisoFetchResult | null> {
    if (!config.tianyiso.solver.url) {
      return null;
    }

    try {
      logger.info(`检测到 Cloudflare 挑战，尝试调用天翼搜求解器: ${url}`);

      const response = await this.api?.post<SolverResponse>(
        config.tianyiso.solver.url,
        {
          cmd: "request.get",
          url,
          maxTimeout: config.tianyiso.solver.timeoutMs,
          session: config.tianyiso.solver.session || undefined,
          cookies: this.parseCookieHeader(config.tianyiso.cookie),
          waitInSeconds: config.tianyiso.solver.waitInSeconds,
          returnOnlyCookies: false,
          download: false,
          session_ttl_minutes: 30,
          tabsTillVerify: config.tianyiso.solver.tabsTillVerify,
        },
        {
          baseURL: undefined,
          validateStatus: () => true,
        }
      );

      const data = response?.data;
      const html = String(data?.solution?.response || "");
      const status = Number(response?.status || 0);

      if (data?.solution?.cookies?.length) {
        this.tianyisoRuntimeCookieHeader = this.cookiesToHeader(data.solution.cookies);
      }

      if (data?.solution?.userAgent) {
        this.tianyisoRuntimeUserAgent = data.solution.userAgent;
      }

      if (data?.status !== "ok" || !html) {
        logger.warn(
          `天翼搜求解器返回异常: HTTP ${status} / ${data?.status || "unknown"} / ${data?.message || "no message"}`
        );
        return null;
      }

      return {
        html,
        status,
        challenged: this.isTianyisoChallengeResponse(status, undefined, html),
      };
    } catch (error) {
      logger.warn(`调用天翼搜求解器失败: ${String(error)}`);
      return null;
    }
  }

  private parseCookieHeader(cookieHeader: string): SolverCookie[] {
    return cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex <= 0) {
          return null;
        }

        return {
          name: part.slice(0, separatorIndex).trim(),
          value: part.slice(separatorIndex + 1).trim(),
        };
      })
      .filter((item): item is SolverCookie => Boolean(item?.name && item?.value));
  }

  private cookiesToHeader(cookies: SolverCookie[]): string {
    return cookies
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  private parseTianyisoPosts(html: string, keyword: string): ExternalPost[] {
    const $ = cheerio.load(html);
    const posts = new Map<string, ExternalPost>();

    const addPost = (rawUrl?: string, rawTitle?: string, rawAbstract?: string) => {
      if (!rawUrl || !rawTitle) {
        return;
      }

      let absoluteUrl = "";
      try {
        absoluteUrl = new URL(rawUrl, this.tianyisoBaseUrl).toString();
      } catch (error) {
        return;
      }

      if (!this.isTianyisoDetailUrl(absoluteUrl)) {
        return;
      }

      const title = this.stripTags(this.decodeHtml(rawTitle)).trim();
      const abstract = this.stripTags(this.decodeHtml(rawAbstract || "")).trim();
      if (!title || !this.matchesKeyword(`${title} ${abstract}`, keyword)) {
        return;
      }

      const id = new URL(absoluteUrl).pathname.replace(/\/+$/g, "").split("/").pop() || "";
      if (!id || posts.has(absoluteUrl)) {
        return;
      }

      posts.set(absoluteUrl, {
        id,
        title,
        url: absoluteUrl,
        abstract,
      });
    };

    $("a[href]").each((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");
      const title =
        anchor.attr("title") ||
        anchor.attr("aria-label") ||
        anchor.find("img").attr("alt") ||
        anchor.text();
      const abstract = anchor
        .closest("article, li, .item, .post, .card, .entry, .search-item, .result-item, .panel")
        .text();

      addPost(href, title, abstract);
    });

    if (posts.size > 0) {
      return Array.from(posts.values());
    }

    const pattern = /<a[^>]+href="([^"]*\/s\/[A-Za-z0-9_-]+[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    for (const match of html.matchAll(pattern)) {
      addPost(match[1], match[2], match[0]);
    }

    return Array.from(posts.values());
  }

  private async resolveTianyisoPost(post: ExternalPost, keyword: string): Promise<SourceItem | null> {
    const linkSet = new Map<string, CloudLinkItem>();
    let content = post.abstract;

    this.extractTianyiShareLinks(post.abstract).forEach((link) => {
      linkSet.set(link, { cloudType: "tianyi", link });
    });

    try {
      const html = await this.fetchTianyisoArticlePage(post.url);
      content = this.extractTianyisoArticleContent(html);
      this.extractTianyiShareLinks(content).forEach((link) => {
        linkSet.set(link, { cloudType: "tianyi", link });
      });
    } catch (error) {
      logger.warn(`抓取天翼搜文章失败: ${post.url}`);
    }

    if (!this.matchesKeyword(`${post.title} ${post.abstract} ${this.stripTags(content)}`, keyword)) {
      return null;
    }

    const cloudLinks = Array.from(linkSet.values());
    if (!cloudLinks.length) {
      return null;
    }

    return {
      messageId: `tianyiso-${post.id}`,
      title: post.title,
      completeTitle: post.title,
      pubDate: "",
      content: "来自天翼搜的帖子分享链接",
      cloudLinks,
      cloudType: "tianyi",
      tags: ["#天翼搜"],
      sourceName: "天翼搜",
      articleUrl: post.url,
    };
  }

  private extractTianyisoArticleContent(html: string): string {
    const patterns = [
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<body[^>]*>([\s\S]*?)<\/body>/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return html;
  }

  private isTianyisoDetailUrl(url: string): boolean {
    try {
      const detailUrl = new URL(url);
      return detailUrl.hostname.endsWith("tianyiso.com") && /^\/s\/[A-Za-z0-9_-]+\/?$/.test(detailUrl.pathname);
    } catch (error) {
      return false;
    }
  }

  private extractTianyiShareLinks(content: string): string[] {
    const patterns = [
      /https?:\/\/cloud\.189\.cn\/web\/share\?[^\s"'<>（）()]+/g,
      /https?:\/\/cloud\.189\.cn\/t\/[A-Za-z0-9]+/g,
      /https?:\/\/h5\.cloud\.189\.cn\/share\.html#\/t\/[A-Za-z0-9]+/g,
    ];
    const normalizedContent = this.decodeHtml(content);
    const result = new Set<string>();

    patterns.forEach((pattern) => {
      const matches = normalizedContent.match(pattern) || [];
      matches.forEach((match) => {
        const cleaned = match.replace(/[（(].*$/g, "").replace(/[，。；、）》>\]]+$/g, "").trim();
        if (cleaned) {
          result.add(cleaned);
        }
      });
    });

    return Array.from(result);
  }

  private createTianyisoBypassCookie(html: string): string {
    const challengeToken = this.extractTianyisoChallengeToken(html);
    if (!challengeToken) {
      return "";
    }

    const key = Buffer.from("1234567812345678", "utf8");
    const cipher = createCipheriv("aes-128-cbc", key, key);
    const encrypted =
      cipher.update(challengeToken, "utf8", "hex") + cipher.final("hex");

    return `ck_ml_sea_=${encrypted}`;
  }

  private extractTianyisoChallengeToken(html: string): string {
    const match = html.match(/start_load\("([a-f0-9]{32,})"\)/i);
    return match?.[1] || "";
  }

  private matchesKeyword(text: string, keyword: string): boolean {
    const normalizedText = this.normalizeSearchText(text);
    const normalizedKeyword = this.normalizeSearchText(keyword);

    if (!normalizedKeyword) {
      return true;
    }

    if (!normalizedText) {
      return false;
    }

    if (normalizedText.includes(normalizedKeyword)) {
      return true;
    }

    const keywordTokens = this.getKeywordTokens(keyword);
    return keywordTokens.length > 0 && keywordTokens.every((token) => normalizedText.includes(token));
  }

  private getKeywordTokens(keyword: string): string[] {
    const tokens = keyword
      .split(/[\s\-_.·•:：;；,，/\\|()[\]{}"'“”‘’<>《》【】!?！？]+/)
      .map((item) => this.normalizeSearchText(item))
      .filter((item) => item.length > 1);

    if (tokens.length > 0) {
      return tokens;
    }

    const fallback = this.normalizeSearchText(keyword);
    return fallback ? [fallback] : [];
  }

  private normalizeSearchText(value: string): string {
    return this.decodeHtml(value)
      .toLowerCase()
      .replace(/<[^>]*>/g, " ")
      .replace(/[\s\-_.·•:：;；,，/\\|()[\]{}"'“”‘’<>《》【】!?！？]+/g, "");
  }

  private stripTags(value: string): string {
    return value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }
}

export default new Searcher();
