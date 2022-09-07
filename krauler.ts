export type HTML = string;
export type URL = string;

export interface Crawled {
  html: HTML;
  title: string;
  urls: URL[];
}

export function Krauler({
  baseUrl = "",
  threads = 8,
  extractTitle = (html: HTML) =>
    html?.match(/\<title\>(.*?)\<\/title\>/)?.[1] || "",
  extractUrls = (html: HTML) =>
    html?.match(/href=['"](.*?)[#'"]/g)?.map((matched) => {
      const urlPart = decodeURIComponent(matched.slice(6, -1));
      if (urlPart.startsWith("//")) return "https:" + urlPart;
      if (urlPart.startsWith("/")) return baseUrl + urlPart;
      if (urlPart.startsWith("http")) return urlPart;
      return "";
    }) || [],
  filterUrl = Boolean,
} = {}) {
  if (!baseUrl) throw "'baseUrl' option is required!";

  while (baseUrl.at(-1) === "/") baseUrl = baseUrl.slice(0, -1);

  const toFetchStack: URL[] = [baseUrl];
  const uniqueUrlsSet = new Set<URL>(toFetchStack);
  const visitedUrlsSet = new Set<URL>();
  const promisesMap = new Map<URL, Promise<Crawled>>();

  const fetchPage = async (url: string) => {
    try {
      return await fetch(url).then((res) => res.text());
    } catch (err) {
      console.error("Failed to fetch! ", err);
      return "";
    }
  };

  const crawl = async (url: URL = baseUrl): Promise<Crawled> => {
    try {
      if (visitedUrlsSet.has(url)) throw "Already visited URL: " + url;
      const html = await fetchPage(url);
      visitedUrlsSet.add(url);
      return {
        html,
        title: extractTitle(html),
        urls: extractUrls(html).filter(filterUrl),
      };
    } catch (err) {
      console.error("Failed to crawl! ", err);
      return {
        html: "",
        title: "",
        urls: [],
      };
    }
  };

  return async function* loop() {
    while (toFetchStack.length > 0) {
      while (toFetchStack.length > 0 && promisesMap.size < threads) {
        const url = toFetchStack.pop();
        if (!url) continue;
        const promise = crawl(url);
        promisesMap.set(url, promise);
      }
      const rivals = [...promisesMap].map(([key, promise]) =>
        promise.then((crawled) => [key, crawled] as [URL, Crawled])
      );
      const [key, crawled] = await Promise.race(rivals);
      promisesMap.delete(key);
      crawled.urls.forEach((url) => {
        if (uniqueUrlsSet.has(url)) return;
        toFetchStack.push(url);
        uniqueUrlsSet.add(url);
      });
      yield {
        crawled,
        toFetchStack,
        uniqueUrlsSet,
        visitedUrlsSet,
        promisesMap,
        done: false,
        message: "KEEP IN LOOP!",
      };
    }
    yield {
      crawled: {
        html: "",
        title: "",
        urls: [],
      },
      toFetchStack,
      uniqueUrlsSet,
      visitedUrlsSet,
      promisesMap,
      done: true,
      message: "END OF LOOP!",
    };
  };
}
