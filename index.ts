import { Krauler } from "./krauler.ts";
import type { HTML, URL } from "./krauler.ts";

const BASE_URL = "https://ru.wikipedia.org";
const THREADS = 64;
const STEP_TO_WRITE_TO_DISK = 100_000;

async function writeToDisk({
  data = "" as unknown,
  ext = "json",
  name = "output",
  path = "",
}) {
  try {
    path = path || name + "." + ext;
    const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    await Deno.writeFile(path, new TextEncoder().encode(str));
  } catch (err) {
    console.error(err);
  }
}

function filterUrl(url: URL) {
  return ![
    "/wiki/Википедия:",
    "/wiki/Категория:",
    "/wiki/Обсуждение:",
    "/wiki/Обсуждение_проекта:",
    "/wiki/Обсуждение_участника:",
    "/wiki/Обсуждение_участницы:",
    "/wiki/Портал:",
    "/wiki/Проект:",
    "/wiki/Служебная:",
    "/wiki/Справка:",
    "/wiki/Участник:",
    "/wiki/Участница:",
    "/wiki/Файл:",
    "/wiki/Шаблон:",
  ].reduce((res, part) => res || url.startsWith(part), false);
}

function extractWikiUrlParts(html: HTML): string[] {
  try {
    return (
      html
        ?.match(/['"]\/wiki\/(.*?)[#'"]/g)
        ?.map((url) => decodeURIComponent(url.slice(1, -1)))
        ?.filter(filterUrl) || []
    );
  } catch (err) {
    console.error(err);
    return [];
  }
}

function extractUrls(html: HTML): URL[] {
  return extractWikiUrlParts(html).map((urlPart) => BASE_URL + urlPart);
}

(async function () {
  try {
    const loop = Krauler({
      baseUrl: BASE_URL,
      threads: THREADS,
      extractUrls,
    });
    let base = STEP_TO_WRITE_TO_DISK;
    for await (const {
      toFetchStack,
      uniqueUrlsSet,
      visitedUrlsSet,
      done,
      message,
    } of loop()) {
      console.log(
        message,
        "      unique: ",
        uniqueUrlsSet.size,
        "      to fetch: ",
        toFetchStack.length,
        "      visited: ",
        visitedUrlsSet.size
      );
      if (uniqueUrlsSet.size >= base) {
        base = base + STEP_TO_WRITE_TO_DISK;
        writeToDisk({
          data: [...uniqueUrlsSet],
          name: "unique-" + uniqueUrlsSet.size,
        });
      }
      if (done) {
        writeToDisk({
          data: [...uniqueUrlsSet].sort(),
          name: "unique-" + uniqueUrlsSet.size,
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
})();
