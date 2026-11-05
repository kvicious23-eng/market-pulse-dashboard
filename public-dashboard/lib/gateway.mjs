// Only published dashboard files may cross into the external site.
const origin = 'https://kvicious23-eng.github.io/market-pulse-dashboard/';
const brands = new Set(['acer', 'lenovo', 'godox']);
const assets = new Set(['styles.css', 'app.js', 'xlsx-export.js', 'price-history.js', 'competitor-price-history.js']);
const sourceMarker = /github(?:usercontent)?\.(?:com|io)|github\s*pages|kvicious23-eng|market-pulse-dashboard/i;
const headers = {
  'Cache-Control': 'public, max-age=0, s-maxage=30, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};
function failure(status, message) {
  return new Response(message, {status, headers: {...headers, 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8'}});
}
export function createHandler(fetchPublished = fetch) {
  return async function handle(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return failure(405, 'Method not allowed');
    const url = new URL(request.url);
    if (url.searchParams.getAll('route').length !== 1) return failure(404, '페이지를 찾을 수 없습니다.');
    const route = url.searchParams.get('route');
    let upstream, kind, brand;
    const page = route.match(/^(acer|lenovo|godox)\/?$/);
    const data = route.match(/^(acer|lenovo|godox)\/market-data\.js$/);
    const asset = route.match(/^assets\/([^/]+)$/);
    if (page && brands.has(page[1])) { brand = page[1]; upstream = `brand/${brand}/index.html`; kind = 'html'; }
    else if (data && brands.has(data[1])) { upstream = `brand/${data[1]}/market-data.js`; kind = 'js'; }
    else if (asset && assets.has(asset[1])) { upstream = `dist/${asset[1]}`; kind = asset[1].endsWith('.css') ? 'css' : 'js'; }
    else return failure(404, '페이지를 찾을 수 없습니다.');
    try {
      const response = await fetchPublished(new URL(upstream, origin), {
        redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok || response.status !== 200) return failure(503, '대시보드를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.');
      let body = await response.text();
      if (Buffer.byteLength(body) > 4000000) return failure(503, '대시보드 응답을 확인하지 못했습니다.');
      if (kind === 'html') {
        body = body.replace(/<head>/i, `<head><base href="/publicmp/${brand}/">`)
          .replaceAll('../../dist/', '/publicmp/assets/');
      }
      body = body.replace(/GitHub Pages/gi, '대시보드');
      // Fail closed if a future internal template introduces a source link.
      if (sourceMarker.test(body)) return failure(503, '외부 대시보드 구성을 확인 중입니다. 잠시 후 다시 확인해 주세요.');
      const contentType = {html: 'text/html', css: 'text/css', js: 'text/javascript'}[kind];
      return new Response(request.method === 'HEAD' ? null : body, {headers: {...headers, 'Content-Type': `${contentType}; charset=utf-8`}});
    } catch {
      return failure(503, '대시보드를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.');
    }
  };
}
