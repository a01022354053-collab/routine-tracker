// 아티팩트 화면(artifact/)을 웹사이트용으로 public/에 옮긴다. `npm run build`·`npm run dev` 전에 저절로 돈다.
//   public/index.html      아티팩트 본문을 완전한 HTML 문서로 감싼 것 (주소 / 로 열림)
//   public/assets/         app.js, fx.js, style.css(웹에서는 Pretendard를 CDN으로)
//   public/private/        카드·은행 로고·물건 사진
//   public/web/            web.js(저장소·매니저 연결), web.css(로그인)
//   public/vendor/         supabase-js 브라우저용 파일
//   public/fonts/          artifact/fonts가 있을 때만(로컬). 없으면 CDN 글꼴을 쓴다
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'artifact');
const out = join(root, 'public');
const at = p => join(out, p);

for (const d of ['assets', 'private', 'web', 'vendor', 'fonts']) rmSync(at(d), { recursive: true, force: true });
rmSync(at('index.html'), { force: true });
mkdirSync(at('assets'), { recursive: true });
mkdirSync(at('vendor'), { recursive: true });

const localFonts = existsSync(join(src, 'fonts/PretendardVariable.woff2'));

// 화면 코드
cpSync(join(src, 'assets/app.js'), at('assets/app.js'));
cpSync(join(src, 'assets/fx.js'), at('assets/fx.js'));
let css = readFileSync(join(src, 'assets/style.css'), 'utf8');
if (!localFonts) {
  const before = css.length;
  css = css.replace(/@font-face\s*\{[^}]*PretendardVariable\.woff2[^}]*\}\s*/, '');
  if (css.length === before) throw new Error('style.css에서 Pretendard @font-face를 찾지 못했어요');
}
writeFileSync(at('assets/style.css'), css);
cpSync(join(src, 'private'), at('private'), { recursive: true });
cpSync(join(root, 'web'), at('web'), { recursive: true });
if (localFonts) cpSync(join(src, 'fonts'), at('fonts'), { recursive: true });
cpSync(join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), at('vendor/supabase.js'));

// 본문을 문서로 감싼다. 글꼴 줄은 웹에 맞게 바꾸고, 저장소 연결(supabase, web.js)은 화면 코드보다 먼저 읽는다
let body = readFileSync(join(src, 'index.html'), 'utf8');
const swap = (from, to) => {
  if (!body.includes(from)) throw new Error(`artifact/index.html에서 찾지 못했어요: ${from}`);
  body = body.replace(from, to);
};
swap('<link rel="stylesheet" href="fonts/tossface/tossface.css">', [
  localFonts ? '<link rel="stylesheet" href="/fonts/tossface/tossface.css">' : '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/toss/tossface@v1.6.1/dist/tossface.css">',
  localFonts ? '' : '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">',
].filter(Boolean).join('\n'));
swap('<link rel="stylesheet" href="assets/style.css">', '<link rel="stylesheet" href="/assets/style.css">\n<link rel="stylesheet" href="/web/web.css">');
swap('<script src="assets/fx.js"></script>', '<script src="/vendor/supabase.js"></script>\n<script src="/web/web.js"></script>\n<script src="/assets/fx.js"></script>');
swap('<script src="assets/app.js"></script>', '<script src="/assets/app.js"></script>');
body = body.replace(/<meta name="claude:[^>]*>\n?/g, '');
const title = body.match(/<title>[^<]*<\/title>\n?/)?.[0] || '<title>일상 매니저</title>\n';
body = body.replace(title, '');
const [head, rest] = (() => {
  const i = body.indexOf('<canvas id="sky"');
  if (i < 0) throw new Error('artifact/index.html에서 화면 시작(<canvas id="sky">)을 찾지 못했어요');
  return [body.slice(0, i), body.slice(i)];
})();

writeFileSync(at('index.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d0a22">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="일상 매니저">
<meta name="robots" content="noindex">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.png">
<link rel="manifest" href="/manifest.webmanifest">
${title.trim()}
${head.trim()}
</head>
<body>
${rest.trim()}
</body>
</html>
`);
console.log(`web build ready in public/ (글꼴: ${localFonts ? '로컬' : 'CDN'})`);
