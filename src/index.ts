import { type IWebSocketData, Plugin, fetchPost } from "siyuan";
import { removeAllCronJob, scheduleCronJob } from "./libs/cron";

/** 对于一个 feed 最多只处理 100 条数据 */
const MAX_FEED_NUM = 100;
const SUMMARY_LENGTH = 150;
const DEFAULT_CRON = "1 * * * *";

export default class FeedPlugin extends Plugin {
  name = "feed plugin";
  /** 拉取feed链接并进行解析的函数 */
  _feedFetch: (() => void)[] = [];
  async onload() {
    /** 解析并注册定时任务 */
    const feedBlocks = await getAllFeedBlocks();
    feedBlocks.map(async (block) => {
      const feedDoc = await parseFeedBlock(block.block_id);
      if (feedDoc.attr.feed) {
        const cron = feedDoc.attr.cron?.value ?? DEFAULT_CRON;
        console.log(`注册 cron job 表达式:${cron}`, feedDoc);
        const feedFetch = async () => {
          const feed = await parseFeedByUrl(feedDoc.attr.feed!.value);
          if (feed instanceof Error) {
            throw feed;
          }
          console.log(feed);

          feed.entryList
            .sort((a, b) => {
              return Number(b.updated) - Number(a.updated);
            })
            .slice(0, MAX_FEED_NUM)
            /** 没有链接的不要 TODO 是否该给出提示 */
            .filter((el) => el.link)
            .filter(
              (el) =>
                /** 既然本地已经存在了，就不再插入，所以过滤掉  */
                !feedDoc.entryBlock.find(
                  /** 如果entryBlock 的第一行存在当前 entry 的链接就当他俩是同一个 entry
                   * TODO 如果有更新的话应该也要再次处理
                   */
                  (entryBlock) => el.link && entryBlock.content.split("\n")[0].includes(el.link),
                ),
            )
            .forEach(async (entry) => {
              console.log("insertBlock ", entry);
              if (feedDoc.attrBlock?.id) {
                let data = `* [ ] ###### [${entry.title ?? entry.link}](${entry.link})\n`;
                if (entry.published) data += `    - published:${entry.published}\n`;
                if (entry.updated) data += `    - updated:${entry.updated}\n`;
                if (entry.summary) data += `    > ${entry.summary}\n`;
                data += `  `;
                insertBlock({
                  dataType: "markdown",
                  previousID: feedDoc.attrBlock.id,
                  data,
                });
              }
            });
        };
        scheduleCronJob(cron, feedFetch);
        this._feedFetch.push(feedFetch);
      }
    });
    this.addCommand({
      hotkey: "",
      langKey: "_feedFetch",
      langText: "立刻对所有feed进行一次拉取",
      callback: () => {
        this._feedFetch.forEach((feedFetch) => feedFetch());
      },
    });
  }
  async onunload() {
    /** 取消注册的定时任务 */
    removeAllCronJob();
  }
}
interface block {
  alias: "";
  box: "20210816161940-zo21go1";
  content: "科技爱好者周刊（第 281 期）：新基建的政策选择 https://www.ruanyifeng.com/blog/2023/12/weekly-issue-281.html";
  created: "20231214140831";
  fcontent: "";
  hash: "2231b69";
  hpath: "/想法/siyuan rss插件";
  ial: '{: id="20231214140831-1bwt1jv" updated="20231214140918"}';
  id: "20231214140831-1bwt1jv";
  length: 87;
  markdown: "#### [科技爱好者周刊（第 281 期）：新基建的政策选择](https://www.ruanyifeng.com/blog/2023/12/weekly-issue-281.html)";
  memo: "";
  name: "";
  parent_id: string;
  path: string; // "/20231214112450-ndy3t2e.sy";
  root_id: "20231214112450-ndy3t2e";
  sort: 5;
  subtype: "h4";
  tag: "";
  type: "h";
  updated: "20231214140918";
}
interface feed {
  attr: {
    /** 订阅源 */
    feed?: { value: string; block: block };
    cron?: { value: string; block: block };
  };
  attrBlock?: block;
  /** 已经加载的笔记 */
  entryBlock: block[];
}
interface feedByUrl {
  title: string;
  subtitle: string;
  updated: string;
  entryList: entry[];
}
interface entry {
  title?: string;
  published?: string;
  updated?: string;
  summary?: string;
  link?: string | null;
}
/** 从 rss 链接解析 feed 对象 */
async function parseFeedByUrl(url: string): Promise<feedByUrl | Error> {
  url = url.trim();
  const feed = new Promise<Document>((r, _j) => {
    fetchPost(
      "/api/network/forwardProxy",
      {
        url: url,
        method: "GET",
        timeout: 7000,
        contentType: "application/xml",
        headers: [],
        payload: {},
        payloadEncoding: "text",
        responseEncoding: "text",
      },
      (res) => {
        if (res.code !== 0 && res.data.status !== 200) {
          _j(new Error(res.msg));
        } else {
          var parser = new DOMParser();
          var xmlDoc = parser.parseFromString(res.data.body, "text/xml");
          r(xmlDoc);
        }
      },
    );
  }).then((dom) => {
    if (dom.querySelector("feed")) {
      return {
        title: elText(dom, "feed > title"),
        subtitle: elText(dom, "feed > subtitle"),
        updated: elText(dom, "feed > updated"),
        entryList: Array.from(dom.querySelectorAll("feed > entry")).map((entry) => {
          return {
            title: elText(entry, "title"),
            published: elText(entry, "published"),
            updated: elText(entry, "updated"),
            summary: elText(entry, "summary"),
            link: xssDefend(entry.querySelector("link")?.getAttribute("href")),
          } as entry;
        }),
      };
    } else if (dom.querySelector("channel")) {
      return {
        title: elText(dom, "channel > title"),
        subtitle: elText(dom, "channel > description"),
        updated: elText(dom, "channel > lastBuildDate"),
        entryList: Array.from(dom.querySelectorAll("channel > item")).map((entry) => {
          return {
            title: elText(entry, "title"),
            published: elText(entry, "pubDate"),
            updated: elText(entry, "updated"),
            summary: elText(entry, "description"),
            link: elText(entry, "link"),
          } as entry;
        }),
      };
    } else {
      console.log("rss解析失败", url);
      return new Error(
        `未知的格式，可以将此消息发送给开发者 admin@shenzilong.cn (feed_siyuan_plugin):${url}`,
      );
    }
  });
  return feed;
  function elText(el: Element | Document, selectors: string) {
    return xssDefend(el.querySelector(selectors)?.textContent);
  }
  /** 简单的对输入进行过滤，防止可能存在的 xss 攻击 */
  function xssDefend(s?: string | null): string {
    if (!s) return "";
    let filteredStr = (
      new DOMParser().parseFromString(s, "text/html").documentElement.textContent ?? ""
    ).replace(/** 过滤特殊标记符 */ /[<>\[\]\n]/g, "");
    /** 避免过长的摘要 */
    if (filteredStr.length > SUMMARY_LENGTH) {
      filteredStr = filteredStr.substring(0, SUMMARY_LENGTH) + "...";
    }
    return filteredStr;
  }
}
/** 从块id 解析 feed 对象 */
async function parseFeedBlock(block_id: string) {
  const feedObj: feed = { attr: {}, entryBlock: [] };
  /** 寻找一个以 feed: 开头的子块。它将作为此 feed 的属性块，对它的子块进行解析，获取各种属性 */
  const feedAttrBlock = (
    await sql(
      `SELECT * FROM blocks WHERE parent_id="${block_id}" and content LIKE 'feed\:%' limit 1`,
    )
  ).data?.[0] as block;
  if (feedAttrBlock) {
    feedObj.attrBlock = feedAttrBlock;
    const feedAttrChildBlock = (
      await sql(`SELECT * FROM blocks WHERE parent_id="${feedAttrBlock?.id}" limit 20`)
    ).data as block[];
    Object.assign(feedObj.attr, blocksToObj(feedAttrChildBlock));
  }

  // 查找所有entry子块
  feedObj.entryBlock = (
    await sql(
      `SELECT * FROM blocks
      WHERE
       parent_id="${block_id}" AND (markdown LIKE "* [ ] #%" OR markdown LIKE "* [X] #%")
      ORDER BY created DESC
      LIMIT ${MAX_FEED_NUM}`,
    )
  ).data as block[];

  return feedObj;

  function blocksToObj(blocks: block[]) {
    const map = blocks
      .map(
        (el) =>
          [
            Array.from(el.content.match(/(.*?):(.*)/) ?? []) as [string, string, string],
            el,
          ] as const,
      )
      .filter((el) => el[0].length === 3);
    const obj = {} as any;
    for (const [[_rawContent, key, value], block] of map) {
      obj[key] = { value, block };
    }
    return obj as feed;
  }
}
interface attributes {
  block_id: string;
  box: string;
  id: string;
  name: string; // "bookmark";
  path: string; // "/20231214112450-ndy3t2e.sy";
  root_id: string; //"20231214112450-ndy3t2e";
  type: "b";
  value: "feed";
}
async function getAllFeedBlocks() {
  return (await sql(`SELECT * FROM attributes WHERE name="bookmark" and value="feed"`))
    .data as attributes[];
}

function insertBlock(par: {
  dataType: "markdown" | "dom";
  data: string;
  /** 下面三个id 三选一 */
  nextID?: string;
  previousID?: string;
  parentID?: string;
}): Promise<IWebSocketData> {
  return new Promise((r, _j) => {
    /** https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md#%E6%8F%92%E5%85%A5%E5%9D%97 */
    fetchPost("/api/block/insertBlock", par, (res) => {
      r(res);
    });
  });
}

function sql(stmt: string): Promise<IWebSocketData> {
  return new Promise((r, _j) => {
    fetchPost(
      "/api/query/sql",
      {
        stmt,
      },
      (res) => {
        r(res);
      },
    );
  });
}
