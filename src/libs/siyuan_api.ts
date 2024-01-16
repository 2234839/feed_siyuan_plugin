import { IWebSocketData, fetchPost } from "siyuan";


export function insertBlock(par: {
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
}export interface attributes {
  block_id: string;
  box: string;
  id: string;
  name: string; // "bookmark";
  path: string; // "/20231214112450-ndy3t2e.sy";
  root_id: string; //"20231214112450-ndy3t2e";
  type: "b";
  value: "feed";
}
export function sqlQuery(stmt: string): Promise<IWebSocketData> {
  return new Promise((r, _j) => {
    fetchPost(
      "/api/query/sql",
      {
        stmt,
      },
      (res) => {
        r(res);
      }
    );
  });
}

