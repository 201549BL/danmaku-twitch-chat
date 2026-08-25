import { mkdir, writeFile } from "node:fs/promises";

const projectRoot = new URL("../videos/danmaku-for-twitch-promo/", import.meta.url);
const framesDir = new URL("compositions/frames/", projectRoot);
await mkdir(framesDir, { recursive: true });

const commonCss = String.raw`
  * { box-sizing: border-box; }
  #root { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: hidden; color: #fff; background: #0e0e10; font-family: Inter, Arial, sans-serif; }
  .stage { position: absolute; inset: 0; overflow: hidden; background: #0e0e10; }
  .capture { position: absolute; inset: -18px; width: 1956px; height: 1116px; object-fit: cover; }
  .shade-left { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(14,14,16,.94) 0%, rgba(14,14,16,.65) 28%, rgba(14,14,16,.06) 58%, rgba(14,14,16,.02) 100%); }
  .shade-bottom { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(14,14,16,.9) 0%, rgba(14,14,16,.08) 38%, rgba(14,14,16,0) 65%); }
  .copy { position: absolute; left: 86px; top: 92px; width: 760px; z-index: 5; }
  .eyebrow { margin-bottom: 18px; color: #bf94ff; font-size: 22px; line-height: 1; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  h1 { margin: 0; max-width: 820px; font-size: 76px; line-height: .98; letter-spacing: -.045em; font-weight: 850; }
  .sub { margin-top: 24px; max-width: 650px; color: rgba(255,255,255,.84); font-size: 29px; line-height: 1.3; font-weight: 520; }
  .proof { position: absolute; left: 86px; bottom: 74px; z-index: 6; display: flex; gap: 12px; }
  .pill { padding: 13px 18px; border: 1px solid rgba(191,148,255,.7); border-radius: 10px; background: rgba(14,14,16,.86); font-size: 21px; font-weight: 720; }
  .focus { position: absolute; z-index: 4; border: 3px solid #a970ff; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(14,14,16,.34), 0 0 38px rgba(145,71,255,.44); }
  .brand-card { position: absolute; left: 94px; top: 145px; z-index: 7; width: 750px; padding: 42px; border: 1px solid rgba(191,148,255,.55); border-radius: 22px; background: rgba(14,14,16,.92); box-shadow: 0 30px 90px rgba(0,0,0,.45); }
  .brand-row { display: flex; align-items: center; gap: 24px; }
  .brand-row img { width: 92px; height: 92px; }
  .brand-name { font-size: 50px; line-height: 1.05; font-weight: 850; letter-spacing: -.035em; }
  .cta { display: inline-flex; margin-top: 32px; min-height: 58px; align-items: center; padding: 0 26px; border-radius: 10px; background: #9147ff; color: white; font-size: 23px; font-weight: 800; }
`;

function frame({ id, duration, css = "", body, timeline }) {
  return `<!doctype html><html><body><template><style>${commonCss}\n${css}</style>
<div id="root" data-composition-id="${id}" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080"><div id="frame-${id}-stage" class="clip stage" data-start="0" data-duration="${duration}" data-track-index="0">${body}</div></div>
<script>window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); ${timeline} window.__timelines["${id}"] = tl;</script>
</template></body></html>`;
}

const files = {
  "01-hook.html": frame({
    id: "01-hook", duration: 4,
    body: String.raw`<img class="capture" data-layout-allow-overflow src="assets/danmaku-live-normal.jpg" alt="Real Danmaku for Twitch overlay on a Twitch stream" /><div class="shade-left"></div><div class="copy"><div class="eyebrow">Danmaku for Twitch</div><h1>Keep your eyes on the stream.</h1><div class="sub">See the conversation without looking away from the action.</div></div>`,
    timeline: String.raw`tl.fromTo(".capture", { scale: 1.035, x: 18 }, { scale: 1, x: 0, duration: 4, ease: "power1.out" }, 0); tl.fromTo(".eyebrow", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .45, ease: "power3.out" }, .15); tl.fromTo("h1", { opacity: 0, x: -38 }, { opacity: 1, x: 0, duration: .65, ease: "power3.out" }, .42); tl.fromTo(".sub", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: .55, ease: "power3.out" }, .9);`,
  }),
  "02-hero.html": frame({
    id: "02-hero", duration: 6,
    css: String.raw`.copy { top: 720px; width: 1000px; } .copy h1 { font-size: 68px; } .focus { left: 990px; top: 44px; width: 850px; height: 190px; }`,
    body: String.raw`<img class="capture" data-layout-allow-overflow src="assets/danmaku-live-normal.jpg" alt="Real scrolling chat overlay" /><div class="shade-bottom"></div><div class="focus"></div><div class="copy"><div class="eyebrow">The real overlay</div><h1>Chat, directly on the action.</h1></div><div class="proof"><div class="pill">Usernames</div><div class="pill">Badges</div><div class="pill">Emotes</div></div>`,
    timeline: String.raw`tl.fromTo(".capture", { scale: 1 }, { scale: 1.055, x: -36, y: 5, duration: 6, ease: "power1.inOut" }, 0); tl.fromTo(".focus", { opacity: 0 }, { opacity: 1, duration: .55, ease: "power2.out" }, .6); tl.fromTo(".copy", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: .65, ease: "power3.out" }, 1.0); tl.fromTo(".pill", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .42, stagger: .15, ease: "power3.out" }, 1.55);`,
  }),
  "03-busy-chat.html": frame({
    id: "03-busy-chat", duration: 6,
    css: String.raw`.copy { top: 660px; width: 980px; } .copy h1 { font-size: 70px; } .focus { left: 310px; top: 28px; width: 1540px; height: 310px; }`,
    body: String.raw`<img class="capture" data-layout-allow-overflow src="assets/danmaku-live-burst.jpg" alt="Real busy Twitch chat shown in the Danmaku overlay" /><div class="shade-bottom"></div><div class="focus"></div><div class="copy"><div class="eyebrow">Built for busy chat</div><h1>Readable when chat explodes.</h1><div class="sub">Dynamic mode adapts the flow when activity spikes.</div></div>`,
    timeline: String.raw`tl.fromTo(".capture", { scale: 1.03, x: 22 }, { scale: 1.075, x: -38, duration: 6, ease: "power1.inOut" }, 0); tl.fromTo(".focus", { opacity: 0 }, { opacity: 1, duration: .55, ease: "power2.out" }, .45); tl.fromTo(".copy", { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: .7, ease: "power3.out" }, .9); tl.fromTo(".sub", { opacity: 0 }, { opacity: 1, duration: .5 }, 1.55);`,
  }),
  "04-placement.html": frame({
    id: "04-placement", duration: 6,
    css: String.raw`.copy { top: 115px; width: 700px; } .copy h1 { font-size: 66px; } .focus { left: 1372px; top: 74px; width: 438px; height: 900px; }`,
    body: String.raw`<img class="capture" data-layout-allow-overflow src="assets/settings-overview.jpg" alt="Real Danmaku settings panel" /><div class="shade-left"></div><div class="focus"></div><div class="copy"><div class="eyebrow">Settings on the player</div><h1>Tune it without leaving the stream.</h1><div class="sub">Size, rows, opacity, placement, motion, and busy-chat behavior.</div></div>`,
    timeline: String.raw`tl.fromTo(".capture", { scale: 1 }, { scale: 1.045, x: -48, duration: 6, ease: "power1.inOut" }, 0); tl.fromTo(".focus", { opacity: 0 }, { opacity: 1, duration: .6, ease: "power2.out" }, .35); tl.fromTo(".copy", { opacity: 0, x: -38 }, { opacity: 1, x: 0, duration: .7, ease: "power3.out" }, .75);`,
  }),
  "05-emotes-favorites.html": frame({
    id: "05-emotes-favorites", duration: 6,
    css: String.raw`.capture-a { clip-path: inset(0 50% 0 0); } .capture-b { clip-path: inset(0 0 0 50%); } .split { position: absolute; top: 0; bottom: 0; left: 50%; width: 3px; background: #9147ff; z-index: 4; } .copy { top: 730px; width: 1100px; } .copy h1 { font-size: 64px; }`,
    body: String.raw`<img class="capture capture-a" data-layout-allow-overflow src="assets/settings-favorite-chatters.jpg" alt="Real favorite chatters settings" /><img class="capture capture-b" data-layout-allow-overflow src="assets/settings-message-content.jpg" alt="Real message content settings" /><div class="split"></div><div class="shade-bottom"></div><div class="copy"><div class="eyebrow">Your chat, your priorities</div><h1>Keep important people and context visible.</h1></div><div class="proof"><div class="pill">Favorite chatters</div><div class="pill">Badges</div><div class="pill">Replies</div><div class="pill">VOD sync</div></div>`,
    timeline: String.raw`tl.fromTo(".capture-a", { x: -70 }, { x: 0, duration: 1, ease: "power3.out" }, 0); tl.fromTo(".capture-b", { x: 70 }, { x: 0, duration: 1, ease: "power3.out" }, 0); tl.fromTo(".split", { scaleY: 0 }, { scaleY: 1, duration: .7, ease: "power3.out", transformOrigin: "center" }, .3); tl.fromTo(".copy", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .65, ease: "power3.out" }, 1.05); tl.fromTo(".pill", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .4, stagger: .12, ease: "power3.out" }, 1.7);`,
  }),
  "06-trust-cta.html": frame({
    id: "06-trust-cta", duration: 5,
    css: String.raw`.capture { filter: brightness(.52); } .brand-card .sub { margin-top: 22px; } .trust { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 10px; }`,
    body: String.raw`<img class="capture" data-layout-allow-overflow src="assets/settings-advanced.jpg" alt="Real advanced Danmaku settings" /><div class="shade-left"></div><div class="brand-card"><div class="brand-row"><img src="assets/icon.svg" alt="" /><div class="brand-name">Danmaku for Twitch</div></div><div class="sub">Modern Twitch chat, directly on the video.</div><div class="trust"><div class="pill">Private local settings</div><div class="pill">Open source</div><div class="pill">Actively maintained</div></div><div class="cta">Add to Chrome</div></div>`,
    timeline: String.raw`tl.fromTo(".capture", { scale: 1 }, { scale: 1.04, x: -35, duration: 5, ease: "power1.inOut" }, 0); tl.fromTo(".brand-card", { opacity: 0, x: -55 }, { opacity: 1, x: 0, duration: .75, ease: "power3.out" }, .35); tl.fromTo(".brand-row img", { opacity: 0, scale: .84 }, { opacity: 1, scale: 1, duration: .55, ease: "power3.out" }, .75); tl.fromTo(".trust .pill", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .38, stagger: .13, ease: "power3.out" }, 1.25); tl.fromTo(".cta", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .5, ease: "power3.out" }, 2.05);`,
  }),
};

for (const [name, contents] of Object.entries(files)) await writeFile(new URL(name, framesDir), contents);
console.log(`Wrote ${Object.keys(files).length} real-product promo frames.`);
