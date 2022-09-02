import { nanoid } from "https://deno.land/x/nanoid/mod.ts";

const THREADS = 128;
const BASE_URL = "https://ru.wikipedia.org";
const TO_FETCH_URLS = [BASE_URL];
const UNIQUE_URLS = new Set(TO_FETCH_URLS);
const VISITED_URLS = new Set();

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

async function fetchPage(url: string) {
  return await fetch(url).then((res) => res.text());
}

function extractUrlParts(html: string) {
  try {
    return (
      html
        ?.match(/['"]\/wiki\/(.*?)[#'"]/g)
        ?.map((url) => decodeURIComponent(url.slice(1, -1)))
        ?.filter(
          (url) =>
            ![
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
            ].reduce((res, part) => res || url.startsWith(part), false)
        ) || []
    );
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function crawlLinks({
  url = BASE_URL,
  extract = extractUrlParts,
  transform = (urlPart: string) => BASE_URL + urlPart,
}) {
  try {
    if (VISITED_URLS.has(url)) throw "Already visited URL!";
    const html = await fetchPage(url);
    VISITED_URLS.add(url);
    // const title = html.match(/\<title\>(.*?)\<\/title\>/)?.[1];
    const extracted = extract(html);
    return extracted.map(transform);
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function* asyncLoop() {
  const PROMISES_MAP = new Map<string, Promise<string[]>>();
  while (TO_FETCH_URLS.length > 0) {
    while (TO_FETCH_URLS.length > 0 && PROMISES_MAP.size < THREADS) {
      const url = TO_FETCH_URLS.pop();
      const promise = crawlLinks({ url });
      PROMISES_MAP.set(nanoid(), promise);
    }
    const rivals = [...PROMISES_MAP].map(([key, promise]) =>
      promise.then((res) => [key, res] as [string, string[]])
    );
    const [key, res] = await Promise.race(rivals);
    PROMISES_MAP.delete(key);
    res.forEach((url) => {
      if (UNIQUE_URLS.has(url)) return;
      TO_FETCH_URLS.push(url);
      UNIQUE_URLS.add(url);
    });
    yield "KEEP IN LOOP!";
  }
  throw "END OF LOOP!";
}

(async function () {
  try {
    let base = 100000;
    for await (const res of asyncLoop()) {
      console.log(
        res,
        "   unique: ",
        UNIQUE_URLS.size,
        "   to fetch: ",
        TO_FETCH_URLS.length,
        "   visited: ",
        VISITED_URLS.size
      );
      if (UNIQUE_URLS.size < base) continue;
      base = base + 100000;
      writeToDisk({
        data: [...UNIQUE_URLS],
        name: "unique-" + UNIQUE_URLS.size,
      });
    }
  } catch (err) {
    console.error(err);
    writeToDisk({
      data: [...UNIQUE_URLS],
      name: "unique-" + UNIQUE_URLS.size,
    });
  }
})();
