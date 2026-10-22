// Converted from Landing Page-html.zip/Main.dc.html; original SVG paths, layout and motion preserved.
import React from 'react';
import './landing.css';

export function LandingSplash({ vals }) {
  return <>{vals.splashOn ? <>
<div className={vals.splashClass} aria-hidden={"true"}>
<div className={"sp-in"}>
<div className={"sp-iso"}>
<i style={{"background": "#4f7cff", "animationDelay": ".05s"}}></i>
<i style={{"background": "#ff8a3d", "animationDelay": ".15s"}}></i>
<i style={{"background": "#ff5fa2", "animationDelay": ".25s"}}></i>

<i style={{"background": "#2fbf71", "animationDelay": ".15s"}}></i>
<i style={{"background": "#8a5cf6", "animationDelay": ".25s"}}></i>
<i style={{"background": "#14b8a6", "animationDelay": ".35s"}}></i>

<i style={{"background": "#f5b82e", "animationDelay": ".25s"}}></i>
<i style={{"background": "#64748b", "animationDelay": ".35s"}}></i>
<i style={{"border": "2px dashed var(--mute)", "animationDelay": ".45s"}}></i>
</div>

<div className={"sp-word"}><span className={"sp-mark"}><svg width={"18"} height={"18"} viewBox={"0 0 32 32"}><rect x={"5"} y={"6"} width={"22"} height={"15"} rx={"3"} fill={"#fff"}></rect>
<rect x={"11"} y={"24"} width={"10"} height={"3"} rx={"1.5"} fill={"#fff"}></rect></svg></span>
{"Virtual Office"}</div>

<div className={"sp-msg"}>{"Menyiapkan kantor…"}</div>

<div className={"sp-bar"}><i ></i></div>
</div>
</div>
</> : null}</>;
}

export function LandingNavigation({ vals }) {
  return <><header style={{"position": "sticky", "top": "0", "zIndex": "50", "borderBottom": "1px solid var(--line)", "background": "var(--glass)", "backdropFilter": "saturate(180%) blur(14px)", "WebkitBackdropFilter": "saturate(180%) blur(14px)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto", "padding": "16px 24px", "display": "flex", "alignItems": "center", "gap": "32px"}}>
<a href={"#top"} style={{"display": "flex", "alignItems": "center", "gap": "10px", "fontWeight": "800", "fontSize": "18px", "letterSpacing": "-.01em", "color": "var(--ink)"}}>
<span style={{"width": "32px", "height": "32px", "borderRadius": "9px", "background": "#4f7cff", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}} aria-hidden={"true"}>
<svg width={"18"} height={"18"} viewBox={"0 0 32 32"}><rect x={"5"} y={"6"} width={"22"} height={"15"} rx={"3"} fill={"#fff"}></rect>
<rect x={"11"} y={"24"} width={"10"} height={"3"} rx={"1.5"} fill={"#fff"}></rect></svg>
</span>
{" Virtual Office "}</a>

<nav className={"navlinks"} aria-label={"Navigasi utama"} style={{"display": "flex", "gap": "28px", "fontSize": "14px", "fontWeight": "600", "color": "var(--soft)", "marginLeft": "8px"}}>
<a href={"#fitur"}>{"Fitur"}</a>

<a href={"#kantor"}>{"Kantor 3D"}</a>

<a href={"#harga"}>{"Harga"}</a>

<a href={"#faq"}>{"FAQ"}</a>

<a href={"#dokumentasi"}>{"Dokumentasi"}</a>
</nav>

<div style={{"marginLeft": "auto", "display": "flex", "alignItems": "center", "gap": "10px"}}>
<button type={"button"} onClick={vals.toggleTheme} aria-label={"Ganti mode tampilan"} style={{"width": "40px", "height": "40px", "borderRadius": "10px", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--soft)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "cursor": "pointer"}}>
<svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={vals.themeIcon}></path></svg>
</button>

<a className={"btns hide-sm"} href={"/auth/login"} style={{"padding": "10px 16px", "borderRadius": "10px", "fontSize": "14px", "fontWeight": "700", "color": "var(--ink)"}}>{"Masuk"}</a>

<a className={"btnp"} href={"/onboarding"} style={{"padding": "11px 18px", "borderRadius": "10px", "fontSize": "14px", "fontWeight": "700", "background": "var(--accent)", "color": "var(--onAccent)"}}>{"Mulai sekarang"}</a>
</div>
</div>
</header></>;
}

export function LandingHero({ vals }) {
  return <><section style={{"position": "relative", "overflow": "hidden", "background": "linear-gradient(180deg,var(--bg2) 0%,var(--bg) 100%)", "padding": "80px 24px 0"}}>
<div className={"gridbg"} aria-hidden={"true"}></div>

<div className={"orb"} aria-hidden={"true"} style={{"width": "420px", "height": "420px", "left": "-120px", "top": "-100px", "background": "#4f7cff"}}></div>

<div className={"orb"} aria-hidden={"true"} style={{"width": "380px", "height": "380px", "right": "-100px", "top": "60px", "background": "#b18cff", "animationDelay": "-5s"}}></div>

<div className={"orb"} aria-hidden={"true"} style={{"width": "300px", "height": "300px", "left": "42%", "top": "-140px", "background": "#ff9cc4", "animationDelay": "-9s"}}></div>

<div style={{"position": "relative", "zIndex": "1", "maxWidth": "1200px", "margin": "0 auto", "textAlign": "center"}}>
<span className={"fu"} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "7px 15px", "borderRadius": "999px", "background": "var(--glass)", "border": "1px solid var(--line)", "backdropFilter": "blur(8px)", "color": "var(--accentText)", "fontSize": "13px", "fontWeight": "700"}}>
<span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "var(--accentText)"}}></span>
{" Kantor virtual berbasis AI untuk tim dan agensi "}</span>

<h1 className={"fu d1"} style={{"margin": "22px auto 0", "maxWidth": "860px", "fontSize": "clamp(36px,5.6vw,72px)", "lineHeight": "1.04", "letterSpacing": "-.04em", "fontWeight": "800"}}>{"Satu kantor virtual untuk seluruh "}
<span className={"gtext"}>{"tim AI Anda."}</span></h1>

<p className={"fu d2"} style={{"margin": "22px auto 0", "maxWidth": "640px", "fontSize": "clamp(16px,1.6vw,19px)", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Virtual Office mengumpulkan agent, perintah, dan hasil kerja di satu ruang kerja 3D. Beri perintah, pantau prosesnya, lalu tinjau dan setujui hasilnya."}</p>

<div className={"fu d3"} style={{"marginTop": "34px", "display": "flex", "gap": "12px", "justifyContent": "center", "flexWrap": "wrap"}}>
<a className={"btnp"} href={"/onboarding"} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "15px 26px", "borderRadius": "12px", "fontSize": "16px", "fontWeight": "700", "background": "var(--accent)", "color": "var(--onAccent)"}}>{" Mulai sekarang "}
<svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M5 12h14M13 6l6 6-6 6"}></path></svg>
</a>

<a className={"btns"} href={"#kantor"} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "15px 26px", "borderRadius": "12px", "fontSize": "16px", "fontWeight": "700", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--ink)"}}>{"Lihat kantor 3D"}</a>
</div>

<p className={"fu d3"} style={{"margin": "16px 0 0", "fontSize": "13px", "color": "var(--mute)"}}>{"Semua hasil AI berupa draft. Selalu ditinjau manusia sebelum dipakai."}</p>
</div>



<div className={"fu d4"} style={{"position": "relative", "zIndex": "1", "maxWidth": "1200px", "margin": "56px auto 0", "border": "1px solid var(--line)", "borderBottom": "0", "borderRadius": "24px 24px 0 0", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "8px", "padding": "12px 16px", "borderBottom": "1px solid var(--line)", "background": "var(--bg2)"}}>
<span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "var(--line)"}}></span>

<span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "var(--line)"}}></span>

<span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "var(--line)"}}></span>

<span style={{"margin": "0 auto", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{"Kantor · Workspace Contoh"}</span>
</div>

<div style={{"display": "flex", "flexWrap": "wrap", "alignItems": "stretch"}}>
<div style={{"flex": "1 1 560px", "minWidth": "0", "background": "var(--floor)", "position": "relative", "padding": "8px 8px 0"}}>
<svg viewBox={"0 0 960 520"} role={"img"} aria-label={"Ilustrasi kantor isometrik berisi delapan divisi agent"} style={{"width": "100%", "height": "auto", "display": "block"}}>
<defs >
<g id={"deskA"}><rect width={"52"} height={"26"} rx={"5"} style={{"fill": "var(--desk)", "stroke": "var(--line)", "strokeWidth": "1.5"}}></rect>
<rect x={"17"} y={"6"} width={"18"} height={"11"} rx={"2.5"} style={{"fill": "var(--ink)", "opacity": ".82"}}></rect></g>
</defs>

<g transform={"translate(480 80)"}>
<g transform={"translate(0 16)"}><g transform={"matrix(0.866 0.5 -0.866 0.5 0 0)"}><rect x={"-8"} y={"-8"} width={"388"} height={"388"} rx={"18"} style={{"fill": "var(--floor2)"}}></rect></g></g>

<g transform={"matrix(0.866 0.5 -0.866 0.5 0 0)"}>
<rect x={"-8"} y={"-8"} width={"388"} height={"388"} rx={"18"} style={{"fill": "var(--surface)", "stroke": "var(--line)", "strokeWidth": "1.5"}}></rect>

<rect x={"0"} y={"0"} width={"112"} height={"112"} rx={"10"} fill={"#4f7cff"} fillOpacity={".14"} stroke={"#4f7cff"} strokeOpacity={".55"} strokeWidth={"2"}></rect>

<rect x={"124"} y={"0"} width={"112"} height={"112"} rx={"10"} fill={"#ff8a3d"} fillOpacity={".14"} stroke={"#ff8a3d"} strokeOpacity={".6"} strokeWidth={"2"}></rect>

<rect x={"248"} y={"0"} width={"112"} height={"112"} rx={"10"} fill={"#ff5fa2"} fillOpacity={".14"} stroke={"#ff5fa2"} strokeOpacity={".6"} strokeWidth={"2"}></rect>

<rect x={"0"} y={"124"} width={"112"} height={"112"} rx={"10"} fill={"#2fbf71"} fillOpacity={".14"} stroke={"#2fbf71"} strokeOpacity={".6"} strokeWidth={"2"}></rect>

<rect x={"124"} y={"124"} width={"112"} height={"112"} rx={"10"} fill={"#8a5cf6"} fillOpacity={".14"} stroke={"#8a5cf6"} strokeOpacity={".6"} strokeWidth={"2"}></rect>

<rect x={"248"} y={"124"} width={"112"} height={"112"} rx={"10"} fill={"#14b8a6"} fillOpacity={".14"} stroke={"#14b8a6"} strokeOpacity={".6"} strokeWidth={"2"}></rect>

<rect x={"0"} y={"248"} width={"112"} height={"112"} rx={"10"} fill={"#f5b82e"} fillOpacity={".16"} stroke={"#f5b82e"} strokeOpacity={".7"} strokeWidth={"2"}></rect>

<rect x={"124"} y={"248"} width={"112"} height={"112"} rx={"10"} fill={"#64748b"} fillOpacity={".14"} stroke={"#64748b"} strokeOpacity={".6"} strokeWidth={"2"}></rect>

<rect x={"248"} y={"248"} width={"112"} height={"112"} rx={"10"} style={{"fill": "none", "stroke": "var(--line)", "strokeWidth": "2", "strokeDasharray": "6 6"}}></rect>

<use href={"#deskA"} x={"10"} y={"12"}></use>
<use href={"#deskA"} x={"50"} y={"62"}></use>

<use href={"#deskA"} x={"134"} y={"12"}></use>
<use href={"#deskA"} x={"174"} y={"62"}></use>

<use href={"#deskA"} x={"258"} y={"12"}></use>
<use href={"#deskA"} x={"298"} y={"62"}></use>

<use href={"#deskA"} x={"10"} y={"136"}></use>
<use href={"#deskA"} x={"50"} y={"186"}></use>

<use href={"#deskA"} x={"134"} y={"136"}></use>
<use href={"#deskA"} x={"174"} y={"186"}></use>

<use href={"#deskA"} x={"258"} y={"136"}></use>
<use href={"#deskA"} x={"298"} y={"186"}></use>

<use href={"#deskA"} x={"10"} y={"260"}></use>
<use href={"#deskA"} x={"50"} y={"310"}></use>

<use href={"#deskA"} x={"134"} y={"260"}></use>
<use href={"#deskA"} x={"174"} y={"310"}></use>
</g>

<g transform={"translate(-480 -80)"}>
<g className={"bob"} fontFamily={"Plus Jakarta Sans,system-ui,sans-serif"} fontSize={"12"} fontWeight={"700"}>


<circle cx={"480"} cy={"114"} r={"8"} fill={"#e3b48a"}></circle>
<rect x={"471"} y={"123"} width={"18"} height={"22"} rx={"8"} fill={"#4f7cff"}></rect>

<rect x={"440"} y={"80"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"454"} cy={"92"} r={"4.5"} fill={"#4f7cff"}></circle>
<text x={"465"} y={"96"} style={{"fill": "var(--ink)"}}>{"Proposal"}</text>



<circle cx={"587"} cy={"176"} r={"8"} fill={"#f3d2b3"}></circle>
<rect x={"578"} y={"185"} width={"18"} height={"22"} rx={"8"} fill={"#ff8a3d"}></rect>

<rect x={"547"} y={"142"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"561"} cy={"154"} r={"4.5"} fill={"#ff8a3d"}></circle>
<text x={"572"} y={"158"} style={{"fill": "var(--ink)"}}>{"Ads"}</text>



<circle cx={"695"} cy={"238"} r={"8"} fill={"#c98f62"}></circle>
<rect x={"686"} y={"247"} width={"18"} height={"22"} rx={"8"} fill={"#ff5fa2"}></rect>

<rect x={"655"} y={"204"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"669"} cy={"216"} r={"4.5"} fill={"#ff5fa2"}></circle>
<text x={"680"} y={"220"} style={{"fill": "var(--ink)"}}>{"Social"}</text>



<circle cx={"373"} cy={"176"} r={"8"} fill={"#e3b48a"}></circle>
<rect x={"364"} y={"185"} width={"18"} height={"22"} rx={"8"} fill={"#2fbf71"}></rect>

<rect x={"333"} y={"142"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"347"} cy={"154"} r={"4.5"} fill={"#2fbf71"}></circle>
<text x={"358"} y={"158"} style={{"fill": "var(--ink)"}}>{"QA"}</text>



<circle cx={"480"} cy={"238"} r={"8"} fill={"#a97047"}></circle>
<rect x={"471"} y={"247"} width={"18"} height={"22"} rx={"8"} fill={"#8a5cf6"}></rect>

<rect x={"440"} y={"204"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"454"} cy={"216"} r={"4.5"} fill={"#8a5cf6"}></circle>
<text x={"465"} y={"220"} style={{"fill": "var(--ink)"}}>{"Dev"}</text>



<circle cx={"587"} cy={"300"} r={"8"} fill={"#f3d2b3"}></circle>
<rect x={"578"} y={"309"} width={"18"} height={"22"} rx={"8"} fill={"#14b8a6"}></rect>

<rect x={"547"} y={"266"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"561"} cy={"278"} r={"4.5"} fill={"#14b8a6"}></circle>
<text x={"572"} y={"282"} style={{"fill": "var(--ink)"}}>{"Report"}</text>



<circle cx={"265"} cy={"238"} r={"8"} fill={"#e3b48a"}></circle>
<rect x={"256"} y={"247"} width={"18"} height={"22"} rx={"8"} fill={"#f5b82e"}></rect>

<rect x={"225"} y={"204"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"239"} cy={"216"} r={"4.5"} fill={"#f5b82e"}></circle>
<text x={"250"} y={"220"} style={{"fill": "var(--ink)"}}>{"Account"}</text>



<circle cx={"373"} cy={"300"} r={"8"} fill={"#f3d2b3"}></circle>
<rect x={"364"} y={"309"} width={"18"} height={"22"} rx={"8"} fill={"#64748b"}></rect>

<rect x={"333"} y={"266"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--line)"}}></rect>
<circle cx={"347"} cy={"278"} r={"4.5"} fill={"#64748b"}></circle>
<text x={"358"} y={"282"} style={{"fill": "var(--ink)"}}>{"Finance"}</text>



<rect x={"532"} y={"76"} width={"168"} height={"30"} rx={"15"} style={{"fill": "var(--accent)"}}></rect>

<path d={"M546 91l4 4 8-8"} fill={"none"} style={{"stroke": "var(--onAccent)"}} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"}></path>

<text x={"566"} y={"95"} style={{"fill": "var(--onAccent)"}} fontSize={"12"}>{"Draft proposal selesai"}</text>
</g>
</g>
</g>
</svg>

<div style={{"position": "absolute", "left": "20px", "bottom": "14px", "padding": "6px 12px", "borderRadius": "999px", "background": "var(--surface)", "border": "1px solid var(--line)", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{"Klik karakter untuk ngobrol · geser untuk pindah · scroll untuk zoom"}</div>
</div>



<aside style={{"flex": "1 1 340px", "maxWidth": "100%", "borderLeft": "1px solid var(--line)", "display": "flex", "flexDirection": "column", "textAlign": "left"}} aria-label={"Contoh panel chat agent"}>
<div style={{"display": "flex", "alignItems": "center", "gap": "12px", "padding": "16px", "borderBottom": "1px solid var(--line)"}}>
<span style={{"width": "40px", "height": "40px", "borderRadius": "50%", "background": "#4f7cff", "color": "#fff", "fontWeight": "800", "fontSize": "15px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{"BP"}</span>

<div style={{"lineHeight": "1.3"}}><div style={{"fontWeight": "800", "fontSize": "15px"}}>{"Bagas Prasetyo"}</div>
<div style={{"fontSize": "12px", "color": "var(--mute)", "fontWeight": "600"}}>{"Client Research · Divisi Proposal"}</div></div>

<span style={{"marginLeft": "auto", "display": "inline-flex", "alignItems": "center", "gap": "6px", "fontSize": "12px", "fontWeight": "700", "color": "var(--ok)"}}><span style={{"width": "7px", "height": "7px", "borderRadius": "50%", "background": "var(--ok)"}}></span>
{"Aktif"}</span>
</div>

<div style={{"display": "flex", "gap": "4px", "padding": "10px 16px 0"}}>
<span style={{"padding": "7px 14px", "borderRadius": "9px", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontSize": "13px", "fontWeight": "700"}}>{"Chat"}</span>

<span style={{"padding": "7px 14px", "borderRadius": "9px", "color": "var(--mute)", "fontSize": "13px", "fontWeight": "700"}}>{"Perintah"}</span>
</div>

<div style={{"flex": "1", "padding": "16px", "display": "flex", "flexDirection": "column", "gap": "12px", "fontSize": "14px", "lineHeight": "1.55"}}>
<div className={"pop1"} style={{"alignSelf": "flex-end", "maxWidth": "86%", "padding": "11px 14px", "borderRadius": "14px 14px 4px 14px", "background": "var(--accent)", "color": "var(--onAccent)"}}>{"Analisis brief client ini: toko kopi lokal butuh website dan iklan Meta."}</div>

<div className={"typing"} aria-hidden={"true"} style={{"alignSelf": "flex-start", "padding": "12px 14px", "borderRadius": "14px 14px 14px 4px", "background": "var(--bg2)", "border": "1px solid var(--line)", "overflow": "hidden"}}><span ></span>
<span ></span>
<span ></span></div>

<div className={"pop2"} style={{"alignSelf": "flex-start", "maxWidth": "90%", "padding": "11px 14px", "borderRadius": "14px 14px 14px 4px", "background": "var(--bg2)", "border": "1px solid var(--line)"}}>{"Siap. Saya pisahkan jadi pain point, pertanyaan discovery call, dan risiko scope. Draf masuk ke board setelah selesai."}</div>

<div className={"pop3"} style={{"display": "flex", "flexWrap": "wrap", "gap": "8px", "marginTop": "4px"}}>
<span style={{"padding": "7px 12px", "borderRadius": "999px", "border": "1px solid var(--line)", "fontSize": "12px", "fontWeight": "600", "color": "var(--soft)"}}>{"Pertanyaan discovery call"}</span>

<span style={{"padding": "7px 12px", "borderRadius": "999px", "border": "1px solid var(--line)", "fontSize": "12px", "fontWeight": "600", "color": "var(--soft)"}}>{"Riset bisnis klien"}</span>
</div>
</div>

<div style={{"padding": "12px 16px 16px", "borderTop": "1px solid var(--line)", "display": "flex", "gap": "10px", "alignItems": "center"}}>
<div style={{"flex": "1", "padding": "12px 14px", "borderRadius": "12px", "border": "1px solid var(--line)", "fontSize": "14px", "color": "var(--mute)"}}>{"Tulis pesan…"}</div>

<span style={{"width": "44px", "height": "44px", "borderRadius": "12px", "background": "var(--accent)", "color": "var(--onAccent)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}} aria-hidden={"true"}><svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"}><path d={"M5 12h14M13 6l6 6-6 6"}></path></svg></span>
</div>
</aside>
</div>
</div>
</section></>;
}

export function LandingAgentMarquee({ vals }) {
  return <><section style={{"padding": "44px 0 8px", "background": "var(--bg)"}}>
<div style={{"textAlign": "center", "fontSize": "13px", "fontWeight": "700", "color": "var(--mute)", "marginBottom": "22px"}}>{"23 agent siap bekerja untuk Anda"}</div>

<div className={"marq"} aria-hidden={"true"}><div className={"track"}>
{vals.marquee.map((m, index1) => <React.Fragment key={index1}>
<span style={{"display": "inline-flex", "alignItems": "center", "gap": "10px", "padding": "8px 18px 8px 8px", "borderRadius": "999px", "border": "1px solid var(--line)", "background": "var(--surface)", "fontSize": "14px", "fontWeight": "700", "whiteSpace": "nowrap"}}><span style={{"width": "30px", "height": "30px", "borderRadius": "50%", "background": m.tint, "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "fontSize": "11px", "fontWeight": "800"}}>{m.ini}</span>
{m.name}
<span style={{"fontWeight": "600", "color": "var(--mute)"}}>{m.role}</span></span>
</React.Fragment>)}
</div></div>
</section></>;
}

export function LandingStatistics({ vals }) {
  return <><section style={{"borderBottom": "1px solid var(--line)", "background": "var(--bg)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto", "padding": "40px 24px", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(200px,1fr))", "gap": "24px"}}>
{vals.stats.map((s, index2) => <React.Fragment key={index2}>
<div style={{"textAlign": "center"}}>
<div style={{"fontSize": "40px", "fontWeight": "800", "letterSpacing": "-.03em"}}>{s.value}</div>

<div style={{"marginTop": "4px", "fontSize": "14px", "fontWeight": "600", "color": "var(--mute)"}}>{s.label}</div>
</div>
</React.Fragment>)}
</div>
</section></>;
}

export function LandingFeatures({ vals }) {
  return <><section id={"fitur"} style={{"padding": "104px 24px 96px", "background": "var(--bg)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<div style={{"maxWidth": "620px"}}>
<div style={{"fontSize": "13px", "fontWeight": "800", "letterSpacing": ".08em", "textTransform": "uppercase", "color": "var(--accentText)"}}>{"Fitur"}</div>

<h2 style={{"margin": "12px 0 0", "fontSize": "clamp(30px,3.6vw,44px)", "lineHeight": "1.1", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Semua yang dibutuhkan untuk menjalankan kerja berbasis AI."}</h2>

<p style={{"margin": "16px 0 0", "fontSize": "17px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Dari memberi perintah sampai menyetujui hasil, tanpa pindah-pindah alat."}</p>
</div>

<div style={{"marginTop": "52px", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(300px,1fr))", "gap": "20px"}}>
{vals.features.map((f, index3) => <React.Fragment key={index3}>
<article className={"lift reveal"} style={{"padding": "28px", "border": "1px solid var(--line)", "borderRadius": "22px", "background": "var(--surface)"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between"}}>
<span style={{"width": "46px", "height": "46px", "borderRadius": "13px", "background": "var(--accentSoft)", "color": "var(--accentText)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>
<svg width={"22"} height={"22"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={f.icon}></path></svg>
</span>

{f.soon ? <><span style={{"padding": "4px 10px", "borderRadius": "999px", "background": "var(--bg2)", "border": "1px solid var(--line)", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"Segera hadir"}</span></> : null}
</div>

<h3 style={{"margin": "20px 0 0", "fontSize": "19px", "letterSpacing": "-.015em", "fontWeight": "800"}}>{f.title}</h3>

<p style={{"margin": "10px 0 0", "fontSize": "15px", "lineHeight": "1.65", "color": "var(--soft)"}}>{f.body}</p>
</article>
</React.Fragment>)}
</div>
</div>
</section></>;
}

export function LandingHowItWorks({ vals }) {
  return <><section style={{"padding": "96px 24px", "background": "var(--bg2)", "borderTop": "1px solid var(--line)", "borderBottom": "1px solid var(--line)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<div style={{"textAlign": "center", "maxWidth": "620px", "margin": "0 auto"}}>
<div style={{"fontSize": "13px", "fontWeight": "800", "letterSpacing": ".08em", "textTransform": "uppercase", "color": "var(--accentText)"}}>{"Cara kerja"}</div>

<h2 style={{"margin": "12px 0 0", "fontSize": "clamp(30px,3.6vw,44px)", "lineHeight": "1.1", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Dari perintah ke hasil dalam tiga langkah."}</h2>
</div>

<div style={{"marginTop": "56px", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(280px,1fr))", "gap": "32px"}}>
{vals.steps.map((s, index4) => <React.Fragment key={index4}>
<div >
<div style={{"display": "flex", "alignItems": "center", "gap": "14px"}}>
<span style={{"width": "44px", "height": "44px", "borderRadius": "50%", "background": "var(--accent)", "color": "var(--onAccent)", "fontWeight": "800", "fontSize": "18px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{s.n}</span>

<span style={{"flex": "1", "height": "2px", "background": "var(--line)"}}></span>
</div>

<h3 style={{"margin": "20px 0 0", "fontSize": "20px", "fontWeight": "800", "letterSpacing": "-.015em"}}>{s.title}</h3>

<p style={{"margin": "10px 0 0", "fontSize": "15px", "lineHeight": "1.65", "color": "var(--soft)"}}>{s.body}</p>
</div>
</React.Fragment>)}
</div>
</div>
</section></>;
}

export function LandingDivisions({ vals }) {
  return <><section id={"kantor"} style={{"padding": "104px 24px", "background": "var(--bg)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "24px", "alignItems": "flex-end", "justifyContent": "space-between"}}>
<div style={{"maxWidth": "640px"}}>
<div style={{"fontSize": "13px", "fontWeight": "800", "letterSpacing": ".08em", "textTransform": "uppercase", "color": "var(--accentText)"}}>{"Kantor 3D"}</div>

<h2 style={{"margin": "12px 0 0", "fontSize": "clamp(30px,3.6vw,44px)", "lineHeight": "1.1", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Satu kantor, delapan divisi."}</h2>

<p style={{"margin": "16px 0 0", "fontSize": "17px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Setiap divisi punya ruang dan agent sendiri. Klik karakter untuk ngobrol atau beri perintah."}</p>
</div>

<a className={"btns"} href={"/app"} style={{"padding": "13px 22px", "borderRadius": "12px", "fontSize": "15px", "fontWeight": "700", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--ink)"}}>{"Coba di dashboard"}</a>
</div>

<div style={{"marginTop": "48px", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(250px,1fr))", "gap": "16px"}}>
{vals.divisions.map((d, index5) => <React.Fragment key={index5}>
<article className={"lift reveal"} style={{"padding": "22px", "border": "1px solid var(--line)", "borderRadius": "18px", "background": "var(--surface)"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "10px"}}>
<span style={{"width": "12px", "height": "12px", "borderRadius": "4px", "background": d.color}}></span>

<h3 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{d.name}</h3>

<span style={{"marginLeft": "auto", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{d.count}</span>
</div>

<p style={{"margin": "12px 0 0", "fontSize": "14px", "lineHeight": "1.6", "color": "var(--soft)"}}>{d.agents}</p>
</article>
</React.Fragment>)}
</div>
</div>
</section></>;
}

export function LandingPricing({ vals }) {
  return <><section id={"harga"} style={{"padding": "104px 24px", "background": "var(--bg2)", "borderTop": "1px solid var(--line)", "borderBottom": "1px solid var(--line)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto"}}>
<div style={{"textAlign": "center", "maxWidth": "640px", "margin": "0 auto"}}>
<div style={{"fontSize": "13px", "fontWeight": "800", "letterSpacing": ".08em", "textTransform": "uppercase", "color": "var(--accentText)"}}>{"Harga"}</div>

<h2 style={{"margin": "12px 0 0", "fontSize": "clamp(30px,3.6vw,44px)", "lineHeight": "1.1", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Mulai dari template, berkembang sesuai kebutuhan."}</h2>

<p style={{"margin": "16px 0 0", "fontSize": "17px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Paket dibedakan lewat kemampuan dan kuota penggunaan. Harga dan angka kuota final menyusul."}</p>
</div>

<div style={{"marginTop": "56px", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(300px,1fr))", "gap": "20px", "alignItems": "stretch"}}>
{vals.plans.map((p, index6) => <React.Fragment key={index6}>
<article style={{"padding": "32px", "borderRadius": "20px", "background": "var(--surface)", "border": p.border, "display": "flex", "flexDirection": "column", "position": "relative"}}>
{p.popular ? <><span style={{"position": "absolute", "top": "-13px", "left": "32px", "padding": "5px 12px", "borderRadius": "999px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "12px", "fontWeight": "800"}}>{"Paling banyak dipilih"}</span></> : null}

<h3 style={{"margin": "0", "fontSize": "20px", "fontWeight": "800"}}>{p.name}</h3>

<p style={{"margin": "8px 0 0", "fontSize": "14px", "lineHeight": "1.55", "color": "var(--soft)", "minHeight": "44px"}}>{p.tagline}</p>

<div style={{"marginTop": "22px", "display": "flex", "alignItems": "baseline", "gap": "6px"}}>
<span style={{"fontSize": "34px", "fontWeight": "800", "letterSpacing": "-.03em"}}>{p.price}</span>

<span style={{"fontSize": "14px", "fontWeight": "600", "color": "var(--mute)"}}>{p.per}</span>
</div>

<a className={p.btnClass} href={"/onboarding"} style={{"marginTop": "22px", "padding": "13px 18px", "borderRadius": "12px", "fontSize": "15px", "fontWeight": "700", "textAlign": "center", "background": p.btnBg, "color": p.btnInk, "border": "1px solid " + (p.btnLine)}}>{p.cta}</a>

<ul style={{"listStyle": "none", "margin": "26px 0 0", "padding": "26px 0 0", "borderTop": "1px solid var(--line)", "display": "flex", "flexDirection": "column", "gap": "14px"}}>
{p.rows.map((r, index7) => <React.Fragment key={index7}>
<li style={{"display": "flex", "gap": "12px", "alignItems": "flex-start", "fontSize": "14px", "lineHeight": "1.5", "color": r.ink}}>
<svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.4"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"} style={{"flex": "none", "marginTop": "1px", "color": r.mark}}><path d={r.icon}></path></svg>

<span ><span style={{"fontWeight": "700"}}>{r.label}</span>
<span style={{"color": "var(--mute)"}}>{" " + (r.note)}</span></span>
</li>
</React.Fragment>)}
</ul>
</article>
</React.Fragment>)}
</div>

<p style={{"margin": "28px 0 0", "textAlign": "center", "fontSize": "13px", "color": "var(--mute)"}}>{"Nama paket, harga, dan kuota di atas masih placeholder sampai keputusan bisnis ditetapkan."}</p>
</div>
</section></>;
}

export function LandingSecurity({ vals }) {
  return <><section style={{"padding": "104px 24px", "background": "var(--bg)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto", "display": "flex", "flexWrap": "wrap", "gap": "56px", "alignItems": "center"}}>
<div style={{"flex": "1 1 420px", "minWidth": "0"}}>
<div style={{"fontSize": "13px", "fontWeight": "800", "letterSpacing": ".08em", "textTransform": "uppercase", "color": "var(--accentText)"}}>{"Kontrol & keamanan"}</div>

<h2 style={{"margin": "12px 0 0", "fontSize": "clamp(30px,3.6vw,44px)", "lineHeight": "1.1", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Data tim Anda tetap milik tim Anda."}</h2>

<p style={{"margin": "16px 0 0", "fontSize": "17px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Virtual Office dirancang multi-tenant. Setiap organisasi dan workspace dipisahkan, dan hak akses diperiksa di server, bukan hanya di tampilan."}</p>

<ul style={{"listStyle": "none", "margin": "28px 0 0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "16px"}}>
{vals.security.map((s, index8) => <React.Fragment key={index8}>
<li style={{"display": "flex", "gap": "14px", "alignItems": "flex-start"}}>
<span style={{"flex": "none", "width": "28px", "height": "28px", "borderRadius": "50%", "background": "var(--okSoft)", "color": "var(--ok)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.6"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M20 6L9 17l-5-5"}></path></svg></span>

<div ><div style={{"fontSize": "16px", "fontWeight": "800"}}>{s.title}</div>
<div style={{"marginTop": "3px", "fontSize": "14px", "lineHeight": "1.6", "color": "var(--soft)"}}>{s.body}</div></div>
</li>
</React.Fragment>)}
</ul>
</div>

<div style={{"flex": "1 1 400px", "minWidth": "0"}}>
<div style={{"border": "1px solid var(--line)", "borderRadius": "20px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "padding": "24px"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between"}}><div style={{"fontSize": "15px", "fontWeight": "800"}}>{"Sumber model AI"}</div>
<span style={{"fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"Hybrid"}</span></div>

<div style={{"marginTop": "16px", "padding": "16px", "borderRadius": "14px", "border": "2px solid var(--accent)", "background": "var(--accentSoft)"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "10px"}}><span style={{"width": "10px", "height": "10px", "borderRadius": "50%", "background": "var(--accentText)"}}></span>
<span style={{"fontSize": "15px", "fontWeight": "800"}}>{"Dikelola platform"}</span></div>

<p style={{"margin": "8px 0 0", "fontSize": "14px", "lineHeight": "1.55", "color": "var(--soft)"}}>{"Langsung pakai. Penggunaan dihitung terhadap kuota paket."}</p>
</div>

<div style={{"marginTop": "12px", "padding": "16px", "borderRadius": "14px", "border": "1px solid var(--line)"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "10px"}}><span style={{"width": "10px", "height": "10px", "borderRadius": "50%", "border": "2px solid var(--mute)"}}></span>
<span style={{"fontSize": "15px", "fontWeight": "800"}}>{"API key sendiri (BYOK)"}</span>
<span style={{"marginLeft": "auto", "padding": "3px 9px", "borderRadius": "999px", "background": "var(--bg2)", "border": "1px solid var(--line)", "fontSize": "11px", "fontWeight": "700", "color": "var(--mute)"}}>{"Segera hadir"}</span></div>

<p style={{"margin": "8px 0 0", "fontSize": "14px", "lineHeight": "1.55", "color": "var(--soft)"}}>{"Biaya provider ditagihkan ke akun Anda. Key tidak pernah ditampilkan utuh."}</p>

<div style={{"marginTop": "12px", "padding": "11px 14px", "borderRadius": "10px", "background": "var(--bg2)", "fontSize": "13px", "fontWeight": "600", "color": "var(--mute)", "letterSpacing": ".06em"}}>{"sk-ant-••••••••••••3f2a"}</div>
</div>
</div>
</div>
</div>
</section></>;
}

export function LandingDocumentation({ vals }) {
  return <><section id={"dokumentasi"} style={{"padding": "0 24px 104px", "background": "var(--bg)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto", "padding": "32px", "border": "1px solid var(--line)", "borderRadius": "20px", "background": "var(--bg2)", "display": "flex", "flexWrap": "wrap", "gap": "20px", "alignItems": "center", "justifyContent": "space-between"}}>
<div style={{"maxWidth": "620px"}}><div style={{"fontSize": "18px", "fontWeight": "800"}}>{"Dokumentasi"}</div>
<p style={{"margin": "6px 0 0", "fontSize": "15px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Panduan memulai, daftar agent dan perintah, serta cara kerja kuota. Tersedia bertahap seiring fitur dirilis."}</p></div>

<a className={"btns"} href={"#faq"} style={{"padding": "13px 22px", "borderRadius": "12px", "fontSize": "15px", "fontWeight": "700", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--ink)"}}>{"Baca FAQ"}</a>
</div>
</section></>;
}

export function LandingFaq({ vals }) {
  return <><section id={"faq"} style={{"padding": "0 24px 104px", "background": "var(--bg)"}}>
<div style={{"maxWidth": "860px", "margin": "0 auto"}}>
<div style={{"textAlign": "center"}}>
<div style={{"fontSize": "13px", "fontWeight": "800", "letterSpacing": ".08em", "textTransform": "uppercase", "color": "var(--accentText)"}}>{"FAQ"}</div>

<h2 style={{"margin": "12px 0 0", "fontSize": "clamp(30px,3.6vw,44px)", "lineHeight": "1.1", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Pertanyaan yang sering muncul."}</h2>
</div>

<div style={{"marginTop": "44px", "borderTop": "1px solid var(--line)"}}>
{vals.faqs.map((q, index9) => <React.Fragment key={index9}>
<div style={{"borderBottom": "1px solid var(--line)"}}>
<button type={"button"} onClick={q.toggle} aria-expanded={q.open} style={{"width": "100%", "display": "flex", "alignItems": "center", "gap": "16px", "padding": "22px 0", "background": "none", "border": "0", "cursor": "pointer", "textAlign": "left", "fontSize": "17px", "fontWeight": "700", "color": "var(--ink)"}}>
<span style={{"flex": "1"}}>{q.q}</span>

<svg width={"20"} height={"20"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"} style={{"flex": "none", "color": "var(--mute)", "transform": q.rot, "transition": "transform .2s"}}><path d={"M6 9l6 6 6-6"}></path></svg>
</button>

{q.open ? <><p style={{"margin": "0", "padding": "0 40px 24px 0", "fontSize": "15px", "lineHeight": "1.7", "color": "var(--soft)"}}>{q.a}</p></> : null}
</div>
</React.Fragment>)}
</div>
</div>
</section></>;
}

export function LandingFinalCallToAction({ vals }) {
  return <><section style={{"padding": "0 24px 96px", "background": "var(--bg)"}}>
<div className={"reveal"} style={{"maxWidth": "1200px", "margin": "0 auto", "padding": "80px 32px", "borderRadius": "32px", "background": "linear-gradient(135deg,#1b2a5e 0%,#3a2f93 100%)", "color": "#fff", "textAlign": "center", "position": "relative", "overflow": "hidden", "isolation": "isolate"}}>
<div className={"orb"} aria-hidden={"true"} style={{"zIndex": "-1", "width": "320px", "height": "320px", "left": "-80px", "top": "-120px", "background": "#4f7cff", "opacity": ".5"}}></div>

<div className={"orb"} aria-hidden={"true"} style={{"zIndex": "-1", "width": "300px", "height": "300px", "right": "-60px", "bottom": "-140px", "background": "#ff5fa2", "opacity": ".4", "animationDelay": "-6s"}}></div>

<h2 style={{"margin": "0 auto", "maxWidth": "640px", "fontSize": "clamp(30px,4vw,48px)", "lineHeight": "1.1", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Buka kantor virtual Anda hari ini."}</h2>

<p style={{"margin": "18px auto 0", "maxWidth": "520px", "fontSize": "17px", "lineHeight": "1.6", "color": "#c9d4f5"}}>{"Buat organisasi, pilih agent pertama, dan kirim perintah pertama dalam beberapa menit."}</p>

<div style={{"marginTop": "32px", "display": "flex", "gap": "12px", "justifyContent": "center", "flexWrap": "wrap"}}>
<a href={"/onboarding"} style={{"padding": "15px 28px", "borderRadius": "12px", "fontSize": "16px", "fontWeight": "700", "background": "#ffffff", "color": "#1b2a5e"}}>{"Mulai sekarang"}</a>

<a href={"/auth/login"} style={{"padding": "15px 28px", "borderRadius": "12px", "fontSize": "16px", "fontWeight": "700", "border": "1px solid #5a6fb5", "color": "#fff"}}>{"Masuk"}</a>
</div>
</div>
</section></>;
}

export function LandingFooter({ vals }) {
  return <><footer style={{"borderTop": "1px solid var(--line)", "background": "var(--bg2)"}}>
<div style={{"maxWidth": "1200px", "margin": "0 auto", "padding": "56px 24px 40px", "display": "flex", "flexWrap": "wrap", "gap": "40px", "justifyContent": "space-between"}}>
<div style={{"maxWidth": "320px"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "10px", "fontWeight": "800", "fontSize": "17px"}}>
<span style={{"width": "30px", "height": "30px", "borderRadius": "8px", "background": "#4f7cff", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}} aria-hidden={"true"}><svg width={"16"} height={"16"} viewBox={"0 0 32 32"}><rect x={"5"} y={"6"} width={"22"} height={"15"} rx={"3"} fill={"#fff"}></rect>
<rect x={"11"} y={"24"} width={"10"} height={"3"} rx={"1.5"} fill={"#fff"}></rect></svg></span>
{" Virtual Office "}</div>

<p style={{"margin": "14px 0 0", "fontSize": "14px", "lineHeight": "1.65", "color": "var(--soft)"}}>{"Kantor virtual berbasis AI untuk tim dan agensi."}</p>
</div>

<div style={{"display": "flex", "flexWrap": "wrap", "gap": "56px", "fontSize": "14px"}}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "12px"}}><div style={{"fontWeight": "800"}}>{"Produk"}</div>
<a href={"#fitur"} style={{"color": "var(--soft)"}}>{"Fitur"}</a>
<a href={"#kantor"} style={{"color": "var(--soft)"}}>{"Kantor 3D"}</a>
<a href={"#harga"} style={{"color": "var(--soft)"}}>{"Harga"}</a></div>

<div style={{"display": "flex", "flexDirection": "column", "gap": "12px"}}><div style={{"fontWeight": "800"}}>{"Sumber"}</div>
<a href={"#dokumentasi"} style={{"color": "var(--soft)"}}>{"Dokumentasi"}</a>
<a href={"#faq"} style={{"color": "var(--soft)"}}>{"FAQ"}</a></div>

<div style={{"display": "flex", "flexDirection": "column", "gap": "12px"}}><div style={{"fontWeight": "800"}}>{"Legal"}</div>
<a href={"#top"} style={{"color": "var(--soft)"}}>{"Kebijakan Privasi"}</a>
<a href={"#top"} style={{"color": "var(--soft)"}}>{"Syarat & Ketentuan"}</a></div>
</div>
</div>

<div style={{"maxWidth": "1200px", "margin": "0 auto", "padding": "20px 24px 32px", "borderTop": "1px solid var(--line)", "fontSize": "13px", "color": "var(--mute)"}}>{"© 2026 Virtual Office. Hak cipta dilindungi."}</div>
</footer></>;
}

export function LandingLayout({ vals }) { return <div className={vals.rootClass} style={{"position": "relative"}}>


<LandingSplash vals={vals} />



<LandingNavigation vals={vals} />

<main id={"top"}>


<LandingHero vals={vals} />



<LandingAgentMarquee vals={vals} />



<LandingStatistics vals={vals} />



<LandingFeatures vals={vals} />



<LandingHowItWorks vals={vals} />



<LandingDivisions vals={vals} />



<LandingPricing vals={vals} />



<LandingSecurity vals={vals} />



<LandingDocumentation vals={vals} />



<LandingFaq vals={vals} />



<LandingFinalCallToAction vals={vals} />
</main>



<LandingFooter vals={vals} />
</div>; }

export class LandingDesign extends React.Component {
  constructor(props) {
    super(props);
    let sys = false;
    try { sys = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { sys = false; }
    const splash = !(props && props.splash === false);
    this.state = { dark: !!(props && props.dark) || sys, faq: 0, sp: splash ? 'on' : 'off', splash };
  }
  componentDidMount() {
    if (!this.state.splash) return;
    this._t1 = setTimeout(() => this.setState({ sp: 'out' }), 2000);
    this._t2 = setTimeout(() => this.setState({ sp: 'off' }), 2700);
  }
  componentWillUnmount() {
    clearTimeout(this._t1); clearTimeout(this._t2);
  }
  renderVals() {
    const dark = this.state.dark;
    const AGM = [
      ['Roy Ahmad', 'Head of Proposals', '#4f7cff'], ['Bagas Prasetyo', 'Client Research', '#4f7cff'], ['Siti Nurhaliza', 'Proposal Writer', '#4f7cff'], ['Dimas Aryanto', 'Pricing & Scope', '#4f7cff'],
      ['Putri Maharani', 'Head of Ads Copy', '#ff8a3d'], ['Fajar Nugroho', 'Meta Ads Copy', '#ff8a3d'], ['Anisa Rahmawati', 'Google Ads Copy', '#ff8a3d'], ['Yoga Pratama', 'Landing & CTA Tester', '#ff8a3d'],
      ['Dewi Kartika', 'Head of Social', '#ff5fa2'], ['Raka Wijaya', 'Content Planner', '#ff5fa2'], ['Nadia Safitri', 'Caption Writer', '#ff5fa2'], ['Eko Saputra', 'Video Script', '#ff5fa2'],
      ['Hendra Gunawan', 'QA Lead', '#2fbf71'], ['Laras Ayuningtyas', 'Visual QA', '#2fbf71'], ['Andi Kurniawan', 'Functional QA', '#2fbf71'], ['Maya Anggraini', 'Performance & SEO', '#2fbf71'],
      ['Arief Setiawan', 'Tech Lead', '#8a5cf6'], ['Citra Lestari', 'WordPress & Elementor', '#8a5cf6'], ['Bayu Firmansyah', 'Backend Developer', '#8a5cf6'], ['Tari Susanti', 'Webflow & Frontend', '#8a5cf6'],
      ['Kirana Dewanti', 'Reporting Analyst', '#14b8a6'], ['Rizky Ramadhan', 'Account Manager', '#f5b82e'], ['Melati Handayani', 'Finance & Admin', '#64748b'],
    ].map((a) => ({ name: a[0], role: a[1], ini: a[0].split(' ').map((w) => w[0]).slice(0, 2).join(''), tint: a[2] + '33' }));
    const marquee = AGM.concat(AGM);
    const sp = this.state.sp;
    const sunPath = 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4';
    const moonPath = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';
    const tick = 'M20 6L9 17l-5-5';
    const dash = 'M5 12h14';

    const stats = [
      { value: '8', label: 'divisi kerja' },
      { value: '23', label: 'agent siap pakai' },
      { value: '26', label: 'jenis perintah' },
      { value: '1', label: 'board untuk review dan persetujuan' },
    ];

    const features = [
      { icon: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', title: 'Agent siap kerja', body: '23 agent di 8 divisi, dari proposal, iklan, dan konten sampai QA, developer, dan finance. Mulai dari template tanpa konfigurasi rumit.', soon: false },
      { icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', title: 'Perintah terstruktur', body: 'Isi form singkat, agent mengerjakan, dan hasilnya masuk ke board sebagai draft. Cocok untuk pekerjaan berulang.', soon: false },
      { icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', title: 'Board review', body: 'Setujui, tolak, atau minta revisi. Setiap versi dan alasan revisi tercatat, jadi mudah dilacak.', soon: false },
      { icon: 'M12 2l9 5v10l-9 5-9-5V7l9-5zM12 12l9-5M12 12v10M12 12L3 7', title: 'Kantor 3D interaktif', body: 'Lihat siapa mengerjakan apa. Klik karakter untuk ngobrol atau beri perintah langsung dari kantor.', soon: false },
      { icon: 'M18 20V10M12 20V4M6 20v-6', title: 'Kuota dan penggunaan', body: 'Pantau pemakaian per periode dan atur batas biaya tambahan agar pengeluaran tetap terkendali.', soon: true },
      { icon: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9', title: 'Workflow kustom', body: 'Rangkai beberapa agent dan perintah menjadi alur kerja yang bisa dijalankan ulang.', soon: true },
    ];

    const steps = [
      { n: '1', title: 'Pilih agent', body: 'Buka kantor atau daftar agent, lalu pilih divisi dan orang yang tepat untuk pekerjaannya.' },
      { n: '2', title: 'Beri perintah', body: 'Isi form singkat atau ngobrol langsung. Agent memakai konteks klien yang sudah Anda simpan.' },
      { n: '3', title: 'Tinjau dan setujui', body: 'Hasil masuk ke board sebagai draft. Revisi, setujui, atau tolak sebelum dipakai.' },
    ];

    const divisions = [
      { name: 'Proposal Writer', color: '#4f7cff', count: '4 agent', agents: 'Roy, Bagas, Siti, Dimas' },
      { name: 'Ads Copywriter', color: '#ff8a3d', count: '4 agent', agents: 'Putri, Fajar, Anisa, Yoga' },
      { name: 'Social Media', color: '#ff5fa2', count: '4 agent', agents: 'Dewi, Raka, Nadia, Eko' },
      { name: 'Web QA', color: '#2fbf71', count: '4 agent', agents: 'Hendra, Laras, Andi, Maya' },
      { name: 'Developer Helper', color: '#8a5cf6', count: '4 agent', agents: 'Arief, Citra, Bayu, Tari' },
      { name: 'Reporting', color: '#14b8a6', count: '1 agent', agents: 'Kirana' },
      { name: 'Account Manager', color: '#f5b82e', count: '1 agent', agents: 'Rizky' },
      { name: 'Finance', color: '#64748b', count: '1 agent', agents: 'Melati' },
    ];

    const row = (label, note, kind) => ({
      label, note,
      icon: kind === 'yes' ? tick : (kind === 'soon' ? dash : dash),
      mark: kind === 'yes' ? 'var(--ok)' : 'var(--mute)',
      ink: kind === 'yes' ? 'var(--ink)' : 'var(--mute)',
    });
    const plans = [
      {
        name: 'Dasar', tagline: 'Untuk mencoba dan tim kecil yang butuh template siap pakai.', price: '[Rp —]', per: '/ bulan', popular: false,
        border: '1px solid var(--line)', cta: 'Mulai dengan Dasar', btnClass: 'btns', btnBg: 'var(--surface)', btnInk: 'var(--ink)', btnLine: 'var(--line)',
        rows: [
          row('Template agent', '', 'yes'), row('Template workflow', '', 'yes'), row('Kantor 3D dan board', '', 'yes'),
          row('Kuota', '[unit dan jumlah menyusul]', 'yes'), row('Kustomisasi agent', 'tidak tersedia', 'no'), row('API key sendiri', 'tidak tersedia', 'no'),
        ],
      },
      {
        name: 'Pro', tagline: 'Untuk tim yang ingin menyesuaikan agent dan alur kerjanya.', price: '[Rp —]', per: '/ bulan', popular: true,
        border: '2px solid var(--accent)', cta: 'Mulai dengan Pro', btnClass: 'btnp', btnBg: 'var(--accent)', btnInk: 'var(--onAccent)', btnLine: 'var(--accent)',
        rows: [
          row('Semua fitur Dasar', '', 'yes'), row('Kustomisasi agent', 'sesuai entitlement', 'yes'), row('Workflow builder', 'segera hadir', 'yes'),
          row('Kuota lebih besar', '[menyusul]', 'yes'), row('Biaya tambahan (overage)', 'dengan batas pengeluaran', 'yes'), row('API key sendiri (BYOK)', 'segera hadir', 'yes'),
        ],
      },
      {
        name: 'Enterprise', tagline: 'Untuk organisasi dengan kebutuhan khusus dan banyak anggota.', price: 'Hubungi kami', per: '', popular: false,
        border: '1px solid var(--line)', cta: 'Bicara dengan kami', btnClass: 'btns', btnBg: 'var(--surface)', btnInk: 'var(--ink)', btnLine: 'var(--line)',
        rows: [
          row('Semua fitur Pro', '', 'yes'), row('Batas anggota dan workspace', '[menyusul]', 'yes'), row('Dukungan prioritas', '', 'yes'),
          row('Kontrol administrasi lanjutan', '', 'yes'), row('Audit trail', '', 'yes'), row('Retensi data kustom', '', 'yes'),
        ],
      },
    ];

    const security = [
      { title: 'Terisolasi per organisasi', body: 'Data, anggota, dan resource tiap organisasi dan workspace dipisahkan.' },
      { title: 'Peran yang jelas', body: 'Owner, member, dan viewer punya hak akses berbeda, diperiksa di server.' },
      { title: 'Kunci dilindungi', body: 'API key tidak ditampilkan ulang secara utuh dan tidak dicatat di log.' },
      { title: 'Penggunaan terlacak', body: 'Setiap pemakaian dicatat per workspace, jadi biaya mudah ditelusuri.' },
    ];

    const faqData = [
      { q: 'Apa itu Virtual Office?', a: 'Platform kerja berbasis AI. Anda mengelola agent, memberi perintah, dan meninjau hasilnya dalam satu aplikasi, dengan kantor 3D sebagai antarmuka visualnya.' },
      { q: 'Apakah hasil AI langsung dikirim ke klien?', a: 'Tidak. Semua hasil berupa draft di board. Tim Anda yang meninjau, merevisi, dan menyetujuinya sebelum dipakai.' },
      { q: 'Apakah data tim saya terpisah dari pelanggan lain?', a: 'Ya. Virtual Office dirancang multi-tenant: data dan hak akses setiap organisasi dipisahkan dan diperiksa di sisi server.' },
      { q: 'Bisakah memakai API key sendiri?', a: 'Dukungan API key sendiri (BYOK) sedang disiapkan. Biaya provider akan ditagihkan ke akun pemilik key.' },
      { q: 'Bagaimana kuota dan biaya tambahan dihitung?', a: 'Unit kuota, tarif, dan aturan biaya tambahan diumumkan bersama paket final. Anda akan bisa memantau pemakaian dan menetapkan batas pengeluaran.' },
      { q: 'Apakah ada aplikasi desktop?', a: 'Saat ini Virtual Office berjalan di web. Aplikasi desktop dipertimbangkan setelah versi web stabil.' },
    ];
    const faqs = faqData.map((f, i) => ({
      ...f,
      open: this.state.faq === i,
      rot: this.state.faq === i ? 'rotate(180deg)' : 'rotate(0deg)',
      toggle: () => this.setState({ faq: this.state.faq === i ? -1 : i }),
    }));

    return {
      rootClass: 'vo' + (dark ? ' dark' : '') + (this.state.splash ? '' : ' nosp'),
      themeIcon: dark ? sunPath : moonPath,
      toggleTheme: () => this.setState({ dark: !this.state.dark }),
      splashOn: sp !== 'off', splashClass: sp === 'out' ? 'splash out' : 'splash',
      marquee,
      stats, features, steps, divisions, plans, security, faqs,
    };
  }

  render() {
    const vals = this.props.decorate ? this.props.decorate(this.renderVals(), this) : this.renderVals();
    vals.rootClass += ' reference-page reference-landing';
    return <LandingLayout vals={vals} />;
  }
}
