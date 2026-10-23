// Converted from Dashboard (interaktif)-html.zip/Dashboard.dc.html; original SVG paths, layout and motion preserved.
import React from 'react';
import './dashboard.css';

export function DashboardSplash({ vals }) {
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

<div className={"sp-msg"}>{"Menyiapkan dashboard…"}</div>

<div className={"sp-bar"}><i ></i></div>
</div>
</div>
</> : null}</>;
}

export function DashboardSidebar({ vals }) {
  return <><aside className={"sbar"} style={{"flex": "1 1 248px", "maxWidth": "272px", "background": "var(--surface)", "borderRight": "1px solid var(--line)", "padding": "20px 14px", "display": "flex", "flexDirection": "column", "gap": "18px"}} aria-label={"Navigasi dashboard"}>
<a href={"/"} style={{"display": "flex", "alignItems": "center", "gap": "10px", "padding": "0 8px", "fontWeight": "800", "fontSize": "17px", "letterSpacing": "-.01em"}}>
<span style={{"width": "30px", "height": "30px", "borderRadius": "9px", "background": "#4f7cff", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}} aria-hidden={"true"}><svg width={"17"} height={"17"} viewBox={"0 0 32 32"}><rect x={"5"} y={"6"} width={"22"} height={"15"} rx={"3"} fill={"#fff"}></rect>
<rect x={"11"} y={"24"} width={"10"} height={"3"} rx={"1.5"} fill={"#fff"}></rect></svg></span>
{" Virtual Office "}</a>

<button type={"button"} aria-label={"Ganti workspace"} style={{"display": "flex", "alignItems": "center", "gap": "10px", "padding": "10px 12px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--ink)", "textAlign": "left"}}>
<span style={{"width": "32px", "height": "32px", "borderRadius": "9px", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontWeight": "800", "fontSize": "13px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{"WC"}</span>

<span style={{"flex": "1", "lineHeight": "1.25", "minWidth": "0"}}><span style={{"display": "block", "fontSize": "14px", "fontWeight": "800", "whiteSpace": "nowrap", "overflow": "hidden", "textOverflow": "ellipsis"}}>{vals.workspaceName ?? "Workspace Contoh"}</span>
<span style={{"display": "block", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{vals.organizationName ?? "Organisasi Contoh"}</span></span>

<svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"var(--mute)"} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M7 9l5-5 5 5M7 15l5 5 5-5"}></path></svg>
</button>

<nav style={{"display": "flex", "flexDirection": "column", "gap": "20px", "flex": "1"}}>
{vals.navGroups.map((g, index1) => <React.Fragment key={index1}>
<div style={{"display": "flex", "flexDirection": "column", "gap": "2px"}}>
<div style={{"padding": "0 12px 6px", "fontSize": "11px", "fontWeight": "800", "letterSpacing": ".08em", "textTransform": "uppercase", "color": "var(--mute)"}}>{g.title}</div>

{g.items.map((n, index2) => <React.Fragment key={index2}>
<button className={"navb"} type={"button"} onClick={n.go} aria-current={n.current} style={{"display": "flex", "alignItems": "center", "gap": "12px", "width": "100%", "padding": "10px 12px", "border": "0", "borderRadius": "10px", "background": n.bg, "color": n.ink, "fontSize": "14px", "fontWeight": n.weight, "textAlign": "left", "boxShadow": n.shadow}}>
<svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={n.icon}></path></svg>

<span style={{"flex": "1"}}>{n.label}</span>

{n.badge ? <><span style={{"padding": "2px 8px", "borderRadius": "999px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "11px", "fontWeight": "800"}}>{n.badge}</span></> : null}

{n.soon ? <><span style={{"fontSize": "10px", "fontWeight": "700", "color": "var(--mute)"}}>{"Segera"}</span></> : null}
</button>
</React.Fragment>)}
</div>
</React.Fragment>)}
</nav>

<div style={{"padding": "14px", "borderRadius": "14px", "border": "1px solid var(--line)", "background": "var(--surface2)"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between"}}><span style={{"fontSize": "13px", "fontWeight": "800"}}>{vals.live ? "Langganan belum tersedia" : "Paket Dasar"}</span>
<span style={{"fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{vals.live ? "—" : "62%"}</span></div>

<div style={{"marginTop": "10px", "height": "8px", "borderRadius": "999px", "background": "var(--line)", "overflow": "hidden"}}><div className={"fill"} style={{"width": vals.live ? "0%" : "62%", "height": "100%", "background": "var(--grad)"}}></div></div>

<p style={{"margin": "10px 0 0", "fontSize": "12px", "lineHeight": "1.5", "color": "var(--mute)"}}>{vals.live ? "Paket dan kuota akun belum ditetapkan." : "Kuota periode ini terpakai 62%."}</p>
</div>

<div style={{"display": "flex", "alignItems": "center", "gap": "10px", "padding": "4px 8px"}}>
<span style={{"width": "36px", "height": "36px", "borderRadius": "50%", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontWeight": "800", "fontSize": "13px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{vals.live ? vals.userInitials : "NP"}</span>

<span style={{"flex": "1", "lineHeight": "1.3", "minWidth": "0"}}><span style={{"display": "block", "fontSize": "13px", "fontWeight": "800"}}>{vals.userName ?? "Nama Pengguna"}</span>
<span style={{"display": "block", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{vals.roleLabel}</span></span>

<a href={"/"} aria-label={"Keluar"} style={{"width": "36px", "height": "36px", "borderRadius": "10px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "color": "var(--mute)"}} onClick={vals.logout}><svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"}></path></svg></a>
</div>
</aside></>;
}

export function DashboardTopbar({ vals }) {
  return <><header style={{"position": "sticky", "top": "0", "zIndex": "20", "display": "flex", "flexWrap": "wrap", "alignItems": "center", "gap": "14px", "padding": "14px 32px", "borderBottom": "1px solid var(--line)", "background": "var(--glass)", "backdropFilter": "saturate(180%) blur(14px)", "WebkitBackdropFilter": "saturate(180%) blur(14px)"}}>
<div style={{"minWidth": "0"}}>
<div style={{"fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{vals.workspaceName ?? "Workspace Contoh"}</div>

<div style={{"fontSize": "18px", "fontWeight": "800", "letterSpacing": "-.015em"}}>{vals.pageTitle}</div>
</div>

<label className={"hide-sm"} style={{"flex": "1 1 240px", "maxWidth": "380px", "marginLeft": "16px", "display": "flex", "alignItems": "center", "gap": "10px", "padding": "0 14px", "height": "42px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--mute)"}}>
<svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"}></path></svg>

<input type={"search"} placeholder={"Cari agent, perintah, atau item…"} aria-label={"Cari"} style={{"flex": "1", "border": "0", "background": "transparent", "outline": "none", "fontSize": "14px", "color": "var(--ink)", "minWidth": "0"}} />
</label>

<div style={{"marginLeft": "auto", "display": "flex", "flexWrap": "wrap", "alignItems": "center", "gap": "10px"}}>
<button className={"btns hide-sm"} type={"button"} onClick={vals.replaySplash} aria-label={"Putar ulang splash screen"} title={"Putar ulang splash"} style={{"width": "42px", "height": "42px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--soft)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"17"} height={"17"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M3 12a9 9 0 1 0 3-6.7M3 4v5h5"}></path></svg></button>

<span className={"hide-sm"} style={{"padding": "5px 11px", "borderRadius": "999px", "background": "var(--warnSoft)", "color": "var(--warn)", "fontSize": "12px", "fontWeight": "700"}}>{vals.live ? "Workspace aktif" : "Data contoh"}</span>

{!vals.live && <div role={"group"} aria-label={"Lihat sebagai"} style={{"display": "flex", "padding": "3px", "borderRadius": "11px", "background": "var(--surface2)", "border": "1px solid var(--line)"}}>
<button type={"button"} onClick={vals.asOwner} aria-pressed={vals.isOwner} style={{"padding": "7px 12px", "border": "0", "borderRadius": "8px", "fontSize": "13px", "fontWeight": "700", "background": vals.ownerBg, "color": vals.ownerInk}}>{"Owner"}</button>

<button type={"button"} onClick={vals.asAdmin} aria-pressed={vals.isAdmin} style={{"padding": "7px 12px", "border": "0", "borderRadius": "8px", "fontSize": "13px", "fontWeight": "700", "background": vals.adminBg, "color": vals.adminInk}}>{"Admin platform"}</button>
</div>}

<button className={"btns"} type={"button"} onClick={vals.toggleTheme} aria-label={"Ganti mode tampilan"} style={{"width": "42px", "height": "42px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--soft)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={vals.themeIcon}></path></svg></button>

<button className={"btns"} type={"button"} aria-label={"Notifikasi"} style={{"position": "relative", "width": "42px", "height": "42px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--soft)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"}></path></svg>
<span style={{"position": "absolute", "top": "9px", "right": "10px", "width": "8px", "height": "8px", "borderRadius": "50%", "background": "var(--accent)", "border": "2px solid var(--surface)"}}></span></button>
{vals.profileMenu}
</div>
</header></>;
}

export function DashboardOverview({ vals }) {
  return <>{vals.v.overview ? <>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "flex-end", "justifyContent": "space-between"}}>
<div >
<h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{vals.greeting ?? "Selamat siang, Nama"}</h1>

<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"Ringkasan aktivitas workspace Anda bulan ini."}</p>
</div>

<button className={"btnp"} type={"button"} onClick={vals.goAgents} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "12px 18px", "border": "0", "borderRadius": "12px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "14px", "fontWeight": "700"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.4"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M12 5v14M5 12h14"}></path></svg>
{"Perintah baru"}</button>
</div>

<div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(220px,1fr))", "gap": "16px"}}>
{vals.kpis.map((k, index3) => <React.Fragment key={index3}>
<div className={"kpi"} style={{"padding": "20px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<div style={{"fontSize": "13px", "fontWeight": "700", "color": "var(--mute)"}}>{k.label}</div>

<div style={{"marginTop": "10px", "display": "flex", "alignItems": "baseline", "gap": "10px"}}>
<span style={{"fontSize": "32px", "fontWeight": "800", "letterSpacing": "-.03em"}}>{k.value}</span>

<span style={{"padding": "3px 8px", "borderRadius": "999px", "background": k.bg, "color": k.ink, "fontSize": "12px", "fontWeight": "700"}}>{k.note}</span>
</div>
</div>
</React.Fragment>)}
</div>

<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "flex-start"}}>
<div style={{"flex": "2 1 520px", "minWidth": "0", "display": "flex", "flexDirection": "column", "gap": "16px"}}>
<section style={{"padding": "22px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "12px", "flexWrap": "wrap"}}>
<div ><h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Perintah per hari"}</h2>
<p style={{"margin": "4px 0 0", "fontSize": "13px", "color": "var(--mute)"}}>{"7 hari terakhir"}</p></div>

<span style={{"fontSize": "13px", "fontWeight": "700", "color": "var(--soft)"}}>{"Total 48"}</span>
</div>

<div style={{"marginTop": "22px", "height": "190px", "display": "flex", "alignItems": "flex-end", "gap": "14px"}}>
{vals.bars.map((b, index4) => <React.Fragment key={index4}>
<div style={{"flex": "1", "display": "flex", "flexDirection": "column", "alignItems": "center", "justifyContent": "flex-end", "gap": "8px", "height": "100%"}}>
<span style={{"fontSize": "12px", "fontWeight": "700", "color": "var(--soft)"}}>{b.v}</span>

<div className={"bar"} style={{"width": "100%", "maxWidth": "56px", "height": b.h, "borderRadius": "8px 8px 3px 3px", "background": "var(--grad)", "opacity": b.o, "animationDelay": b.delay}}></div>

<span style={{"fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{b.d}</span>
</div>
</React.Fragment>)}
</div>
</section>

<section style={{"border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between", "padding": "20px 22px 14px"}}><h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Perintah terbaru"}</h2>
<button className={"btns"} type={"button"} onClick={vals.goJobs} style={{"padding": "7px 12px", "border": "1px solid var(--line)", "borderRadius": "9px", "background": "var(--surface)", "color": "var(--ink)", "fontSize": "13px", "fontWeight": "700"}}>{"Lihat board"}</button></div>

<div >
{vals.recent.map((r, index5) => <React.Fragment key={index5}>
<div className={"rowb"} style={{"display": "flex", "alignItems": "center", "gap": "14px", "padding": "14px 22px", "borderTop": "1px solid var(--line)"}}>
<span style={{"flex": "none", "width": "38px", "height": "38px", "borderRadius": "50%", "background": r.tint, "color": "var(--ink)", "fontWeight": "800", "fontSize": "13px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{r.ini}</span>

<div style={{"flex": "1", "minWidth": "0"}}><div style={{"fontSize": "14px", "fontWeight": "700", "whiteSpace": "nowrap", "overflow": "hidden", "textOverflow": "ellipsis"}}>{r.title}</div>
<div style={{"marginTop": "2px", "fontSize": "12px", "color": "var(--mute)", "fontWeight": "600"}}>{(r.agent) + " · " + (r.when)}</div></div>

<span style={{"flex": "none", "display": "inline-flex", "alignItems": "center", "gap": "6px", "padding": "4px 10px", "borderRadius": "999px", "background": r.sbg, "color": r.sink, "fontSize": "12px", "fontWeight": "700"}}><span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "currentColor"}}></span>
{r.status}</span>
</div>
</React.Fragment>)}
</div>
</section>
</div>

<div style={{"flex": "1 1 300px", "minWidth": "0", "display": "flex", "flexDirection": "column", "gap": "16px"}}>
<section style={{"padding": "22px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between"}}><h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Kuota periode ini"}</h2>
<span style={{"fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"Reset 1 Nov"}</span></div>

<div style={{"marginTop": "16px", "display": "flex", "alignItems": "baseline", "gap": "8px"}}><span style={{"fontSize": "30px", "fontWeight": "800", "letterSpacing": "-.03em"}}>{"620.000"}</span>
<span style={{"fontSize": "14px", "fontWeight": "600", "color": "var(--mute)"}}>{"/ 1.000.000 token"}</span></div>

<div style={{"marginTop": "14px", "height": "10px", "borderRadius": "999px", "background": "var(--surface2)", "overflow": "hidden"}}><div className={"fill"} style={{"width": "62%", "height": "100%", "borderRadius": "999px", "background": "var(--accent)"}}></div></div>

<p style={{"margin": "12px 0 0", "fontSize": "13px", "lineHeight": "1.55", "color": "var(--mute)"}}>{"Sisa 380.000 token. Unit kuota final akan ditetapkan bersama paket."}</p>

<button className={"btns"} type={"button"} onClick={vals.goUsage} style={{"marginTop": "14px", "width": "100%", "padding": "11px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--ink)", "fontSize": "14px", "fontWeight": "700"}}>{"Lihat penggunaan"}</button>
</section>

<section style={{"padding": "22px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Mulai cepat"}</h2>

<p style={{"margin": "4px 0 0", "fontSize": "13px", "color": "var(--mute)"}}>{"2 dari 4 langkah selesai"}</p>

<ul style={{"listStyle": "none", "margin": "16px 0 0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "12px"}}>
{vals.todo.map((t, index6) => <React.Fragment key={index6}>
<li style={{"display": "flex", "alignItems": "center", "gap": "12px", "fontSize": "14px", "fontWeight": "600", "color": t.ink}}>
<span style={{"flex": "none", "width": "22px", "height": "22px", "borderRadius": "50%", "border": "2px solid " + (t.ring), "background": t.fill, "color": "var(--onAccent)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"12"} height={"12"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"3.2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"} style={{"opacity": t.tick}}><path d={"M20 6L9 17l-5-5"}></path></svg></span>

<span style={{"textDecoration": t.dec}}>{t.label}</span>
</li>
</React.Fragment>)}
</ul>
</section>

<section style={{"padding": "22px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between"}}><h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Kantor 3D"}</h2>
<span style={{"fontSize": "12px", "fontWeight": "700", "color": "var(--ok)"}}>{"8 divisi aktif"}</span></div>

<div style={{"marginTop": "14px", "display": "grid", "gridTemplateColumns": "repeat(3,minmax(0,1fr))", "gap": "8px"}}>
{vals.tiles.map((t, index7) => <React.Fragment key={index7}>
<div style={{"aspectRatio": "1", "borderRadius": "10px", "background": t.bg, "border": "1px solid " + (t.line), "display": "flex", "alignItems": "flex-end", "padding": "7px", "fontSize": "11px", "fontWeight": "800", "color": "var(--ink)"}}>{t.name}</div>
</React.Fragment>)}
</div>

<button className={"btns"} type={"button"} onClick={vals.goOffice} style={{"marginTop": "14px", "width": "100%", "padding": "11px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--ink)", "fontSize": "14px", "fontWeight": "700"}}>{"Buka kantor"}</button>
</section>
</div>
</div>
</> : null}</>;
}

export function DashboardOfficePreview({ vals }) {
  return <>{vals.v.office ? <>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "0", "border": "1px solid var(--line)", "borderRadius": "18px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"flex": "1 1 560px", "minWidth": "0", "background": "var(--floor)", "position": "relative", "padding": "56px 12px 44px"}}>
<div style={{"position": "absolute", "left": "16px", "top": "14px", "right": "16px", "display": "flex", "flexWrap": "wrap", "gap": "8px"}}>
{vals.officeChips.map((c, index8) => <React.Fragment key={index8}>
<span style={{"display": "inline-flex", "alignItems": "center", "gap": "7px", "padding": "6px 12px", "borderRadius": "999px", "background": "var(--surface)", "border": "1px solid var(--line)", "fontSize": "12px", "fontWeight": "700", "color": "var(--ink)"}}><span style={{"width": "8px", "height": "8px", "borderRadius": "3px", "background": c.color}}></span>
{c.name}</span>
</React.Fragment>)}
</div>

<svg className={"scn"} viewBox={"0 0 960 520"} role={"img"} aria-label={"Kantor isometrik berisi delapan divisi agent"} style={{"width": "100%", "height": "auto", "display": "block"}}>
<defs ><g id={"deskA"}><rect width={"52"} height={"26"} rx={"5"} style={{"fill": "var(--desk)", "stroke": "var(--line)", "strokeWidth": "1.5"}}></rect>
<rect x={"17"} y={"6"} width={"18"} height={"11"} rx={"2.5"} style={{"fill": "var(--ink)", "opacity": ".82"}}></rect></g></defs>

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
<g fontFamily={"Plus Jakarta Sans,system-ui,sans-serif"} fontSize={"12"} fontWeight={"700"}>
<circle cx={"480"} cy={"114"} r={"8"} fill={"#e3b48a"}></circle>
<rect x={"471"} y={"123"} width={"18"} height={"22"} rx={"8"} fill={"#4f7cff"}></rect>

<rect x={"440"} y={"80"} width={"80"} height={"24"} rx={"12"} style={{"fill": "var(--surface)", "stroke": "var(--accent)", "strokeWidth": "2"}}></rect>
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
</g>
</g>
</g>
</svg>

<div style={{"position": "absolute", "left": "16px", "bottom": "12px", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{"Klik karakter untuk ngobrol · geser untuk pindah · scroll untuk zoom"}</div>

<div style={{"position": "absolute", "right": "16px", "bottom": "12px", "display": "flex", "gap": "6px"}}>
<button className={"btns"} type={"button"} aria-label={"Perbesar"} style={{"width": "36px", "height": "36px", "borderRadius": "10px", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--ink)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.2"} strokeLinecap={"round"} aria-hidden={"true"}><path d={"M12 5v14M5 12h14"}></path></svg></button>

<button className={"btns"} type={"button"} aria-label={"Perkecil"} style={{"width": "36px", "height": "36px", "borderRadius": "10px", "border": "1px solid var(--line)", "background": "var(--surface)", "color": "var(--ink)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.2"} strokeLinecap={"round"} aria-hidden={"true"}><path d={"M5 12h14"}></path></svg></button>
</div>
</div>

<aside style={{"flex": "1 1 360px", "maxWidth": "100%", "borderLeft": "1px solid var(--line)", "display": "flex", "flexDirection": "column"}} aria-label={"Chat agent"}>
<div style={{"display": "flex", "alignItems": "center", "gap": "12px", "padding": "16px", "borderBottom": "1px solid var(--line)"}}>
<span style={{"width": "42px", "height": "42px", "borderRadius": "50%", "background": "#4f7cff", "color": "#fff", "fontWeight": "800", "fontSize": "15px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{"BP"}</span>

<div style={{"lineHeight": "1.3", "flex": "1"}}><div style={{"fontWeight": "800", "fontSize": "15px"}}>{"Bagas Prasetyo"}</div>
<div style={{"fontSize": "12px", "color": "var(--mute)", "fontWeight": "600"}}>{"Client Research · Proposal Writer"}</div></div>

<button className={"btns"} type={"button"} aria-label={"Mulai chat baru"} style={{"width": "36px", "height": "36px", "borderRadius": "10px", "border": "0", "background": "transparent", "color": "var(--mute)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"17"} height={"17"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M3 12a9 9 0 1 0 3-6.7M3 4v5h5"}></path></svg></button>
</div>

<div style={{"display": "flex", "gap": "8px", "padding": "12px 16px 0"}}>
{vals.mates.map((m, index9) => <React.Fragment key={index9}>
<span title={m.name} style={{"width": "34px", "height": "34px", "borderRadius": "50%", "background": "#4f7cff" + (m.alpha), "color": "var(--ink)", "fontWeight": "800", "fontSize": "12px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "border": "2px solid " + (m.ring)}}>{m.ini}</span>
</React.Fragment>)}
</div>

<div style={{"display": "flex", "gap": "4px", "padding": "12px 16px 0"}}>
<span style={{"padding": "7px 14px", "borderRadius": "9px", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontSize": "13px", "fontWeight": "700"}}>{"Chat"}</span>

<span style={{"padding": "7px 14px", "borderRadius": "9px", "color": "var(--mute)", "fontSize": "13px", "fontWeight": "700"}}>{"Perintah"}</span>
</div>

<div style={{"flex": "1", "padding": "16px", "display": "flex", "flexDirection": "column", "gap": "12px", "fontSize": "14px", "lineHeight": "1.55"}}>
<div style={{"alignSelf": "flex-end", "maxWidth": "86%", "padding": "11px 14px", "borderRadius": "14px 14px 4px 14px", "background": "var(--accent)", "color": "var(--onAccent)"}}>{"Analisis brief client ini: toko kopi lokal butuh website dan iklan Meta."}</div>

<div style={{"alignSelf": "flex-start", "maxWidth": "90%", "padding": "11px 14px", "borderRadius": "14px 14px 14px 4px", "background": "var(--surface2)", "border": "1px solid var(--line)"}}>{"Siap. Saya pisahkan jadi pain point, pertanyaan discovery call, dan risiko scope. Hasilnya masuk ke board sebagai draft."}</div>

<div style={{"display": "flex", "flexWrap": "wrap", "gap": "8px", "marginTop": "4px"}}>
<button className={"chip"} type={"button"} style={{"padding": "7px 12px", "borderRadius": "999px", "border": "1px solid var(--line)", "background": "var(--surface)", "fontSize": "12px", "fontWeight": "600", "color": "var(--soft)"}}>{"Pertanyaan discovery call"}</button>

<button className={"chip"} type={"button"} style={{"padding": "7px 12px", "borderRadius": "999px", "border": "1px solid var(--line)", "background": "var(--surface)", "fontSize": "12px", "fontWeight": "600", "color": "var(--soft)"}}>{"Riset bisnis klien"}</button>
</div>
</div>

<div style={{"padding": "12px 16px 8px", "borderTop": "1px solid var(--line)", "display": "flex", "gap": "10px", "alignItems": "center"}}>
<div style={{"flex": "1", "padding": "12px 14px", "borderRadius": "12px", "border": "1px solid var(--line)", "fontSize": "14px", "color": "var(--mute)"}}>{"Tulis pesan…"}</div>

<button className={"btnp"} type={"button"} aria-label={"Kirim"} style={{"width": "44px", "height": "44px", "borderRadius": "12px", "border": "0", "background": "var(--accent)", "color": "var(--onAccent)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"18"} height={"18"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M5 12h14M13 6l6 6-6 6"}></path></svg></button>
</div>

<div style={{"padding": "0 16px 14px", "fontSize": "11px", "lineHeight": "1.5", "color": "var(--mute)"}}>{"AI bisa keliru. Semua jawaban berupa draft, cek dulu sebelum dikirim ke klien."}</div>
</aside>
</div>
</> : null}</>;
}

export function DashboardAgents({ vals }) {
  return <>{vals.v.agents ? <>
<div >
<h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Agent"}</h1>

<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"23 agent di 8 divisi. Pilih satu untuk ngobrol atau memberi perintah."}</p>
</div>

<div style={{"display": "flex", "flexWrap": "wrap", "gap": "8px"}}>
{vals.divChips.map((c, index10) => <React.Fragment key={index10}>
<button className={"chip"} type={"button"} onClick={c.pick} aria-pressed={c.on} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "8px 14px", "borderRadius": "999px", "border": "1px solid " + (c.line), "background": c.bg, "color": c.ink, "fontSize": "13px", "fontWeight": "700"}}>
<span style={{"width": "9px", "height": "9px", "borderRadius": "3px", "background": c.color}}></span>
{(c.name) + " "}</button>
</React.Fragment>)}
</div>

<div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fill,minmax(250px,1fr))", "gap": "16px"}}>
{vals.agentCards.map((a, index11) => <React.Fragment key={index11}>
<article className={"agc"} style={{"padding": "20px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "display": "flex", "flexDirection": "column", "gap": "14px"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "12px"}}>
<span style={{"flex": "none", "width": "46px", "height": "46px", "borderRadius": "50%", "background": a.tint, "color": "var(--ink)", "fontWeight": "800", "fontSize": "15px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "border": "2px solid " + (a.color)}}>{a.ini}</span>

<div style={{"minWidth": "0", "lineHeight": "1.3"}}><div style={{"fontSize": "15px", "fontWeight": "800"}}>{a.name}</div>
<div style={{"fontSize": "13px", "fontWeight": "600", "color": "var(--mute)"}}>{a.role}</div></div>
</div>

<div style={{"display": "flex", "alignItems": "center", "gap": "8px", "flexWrap": "wrap"}}>
<span style={{"display": "inline-flex", "alignItems": "center", "gap": "6px", "padding": "4px 10px", "borderRadius": "999px", "background": "var(--surface2)", "fontSize": "12px", "fontWeight": "700", "color": "var(--soft)"}}><span style={{"width": "8px", "height": "8px", "borderRadius": "3px", "background": a.color}}></span>
{a.division}</span>

{a.lead ? <><span style={{"padding": "4px 10px", "borderRadius": "999px", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontSize": "12px", "fontWeight": "700"}}>{"Lead"}</span></> : null}
</div>

<div style={{"display": "flex", "gap": "8px", "marginTop": "auto"}}>
<button className={"btns"} type={"button"} onClick={vals.goOffice} style={{"flex": "1", "padding": "10px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--ink)", "fontSize": "13px", "fontWeight": "700"}}>{"Chat"}</button>

<button className={"btnp"} type={"button"} onClick={vals.goJobs} style={{"flex": "1", "padding": "10px", "border": "0", "borderRadius": "10px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "13px", "fontWeight": "700"}}>{"Perintah"}</button>
</div>
</article>
</React.Fragment>)}
</div>
</> : null}</>;
}

export function DashboardBoard({ vals }) {
  return <>{vals.v.jobs ? <>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "flex-end", "justifyContent": "space-between"}}>
<div >
<h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Board kerja"}</h1>

<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"Tinjau hasil kerja agent. Setujui, minta revisi, atau tolak."}</p>
</div>

<button className={"btnp"} type={"button"} onClick={vals.goAgents} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "12px 18px", "border": "0", "borderRadius": "12px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "14px", "fontWeight": "700"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.4"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M12 5v14M5 12h14"}></path></svg>
{"Perintah baru"}</button>
</div>

<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "flex-start"}}>
<section style={{"flex": "2 1 520px", "minWidth": "0", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "4px", "padding": "12px 14px 0", "borderBottom": "1px solid var(--line)"}} role={"tablist"}>
{vals.jobTabs.map((t, index12) => <React.Fragment key={index12}>
<button type={"button"} role={"tab"} onClick={t.pick} aria-selected={t.on} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "10px 14px", "border": "0", "borderBottom": "2px solid " + (t.line), "background": "transparent", "color": t.ink, "fontSize": "14px", "fontWeight": "700", "marginBottom": "-1px"}}>{t.label}
<span style={{"padding": "1px 8px", "borderRadius": "999px", "background": "var(--surface2)", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{t.count}</span></button>
</React.Fragment>)}
</div>

<div style={{"overflowX": "auto"}}>
<div style={{"minWidth": "560px"}}>
{vals.jobRows.map((j, index13) => <React.Fragment key={index13}>
<button className={"rowb"} type={"button"} onClick={j.pick} aria-pressed={j.on} style={{"display": "flex", "alignItems": "center", "gap": "14px", "width": "100%", "padding": "14px 18px", "border": "0", "borderBottom": "1px solid var(--line)", "borderLeft": "3px solid " + (j.edge), "background": j.bg, "textAlign": "left", "color": "var(--ink)"}}>
<span style={{"flex": "none", "width": "38px", "height": "38px", "borderRadius": "50%", "background": j.tint, "fontWeight": "800", "fontSize": "13px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{j.ini}</span>

<span style={{"flex": "1", "minWidth": "0"}}><span style={{"display": "block", "fontSize": "14px", "fontWeight": "700", "whiteSpace": "nowrap", "overflow": "hidden", "textOverflow": "ellipsis"}}>{j.title}</span>
<span style={{"display": "block", "marginTop": "2px", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{(j.agent) + " · " + (j.type) + " · v" + (j.ver)}</span></span>

<span style={{"flex": "none", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{j.when}</span>

<span style={{"flex": "none", "display": "inline-flex", "alignItems": "center", "gap": "6px", "padding": "4px 10px", "borderRadius": "999px", "background": j.sbg, "color": j.sink, "fontSize": "12px", "fontWeight": "700"}}><span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "currentColor"}}></span>
{j.status}</span>
</button>
</React.Fragment>)}

{vals.jobsEmpty ? <><div style={{"padding": "48px 24px", "textAlign": "center", "color": "var(--mute)", "fontSize": "14px", "fontWeight": "600"}}>{"Belum ada item di tab ini."}</div></> : null}
</div>
</div>
</section>

{vals.detailPanel ?? <aside style={{"flex": "1 1 340px", "minWidth": "0", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "padding": "22px", "display": "flex", "flexDirection": "column", "gap": "16px"}} aria-label={"Detail item"}>
<div style={{"display": "flex", "alignItems": "center", "gap": "8px", "flexWrap": "wrap"}}>
<span style={{"padding": "4px 10px", "borderRadius": "999px", "background": "var(--surface2)", "fontSize": "12px", "fontWeight": "700", "color": "var(--soft)"}}>{vals.sel.type}</span>

<span style={{"display": "inline-flex", "alignItems": "center", "gap": "6px", "padding": "4px 10px", "borderRadius": "999px", "background": vals.sel.sbg, "color": vals.sel.sink, "fontSize": "12px", "fontWeight": "700"}}><span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "currentColor"}}></span>
{vals.sel.status}</span>

<span style={{"marginLeft": "auto", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}>{"Versi " + (vals.sel.ver)}</span>
</div>

<div ><h2 style={{"margin": "0", "fontSize": "18px", "lineHeight": "1.35", "letterSpacing": "-.015em", "fontWeight": "800"}}>{vals.sel.title}</h2>
<p style={{"margin": "6px 0 0", "fontSize": "13px", "fontWeight": "600", "color": "var(--mute)"}}>{(vals.sel.agent) + " · " + (vals.sel.when)}</p></div>

<div style={{"display": "flex", "flexDirection": "column", "gap": "14px", "padding": "16px", "borderRadius": "12px", "background": "var(--surface2)"}}>
{vals.sel.fields.map((f, index14) => <React.Fragment key={index14}>
<div ><div style={{"fontSize": "12px", "fontWeight": "800", "letterSpacing": ".04em", "textTransform": "uppercase", "color": "var(--mute)"}}>{f.label}</div>
<div style={{"marginTop": "4px", "fontSize": "14px", "lineHeight": "1.6", "color": "var(--ink)"}}>{f.value}</div></div>
</React.Fragment>)}
</div>

<div style={{"display": "flex", "flexWrap": "wrap", "gap": "8px"}}>
<button className={"btnp"} type={"button"} style={{"flex": "1 1 120px", "padding": "11px 14px", "border": "0", "borderRadius": "10px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "14px", "fontWeight": "700"}}>{"Setujui"}</button>

<button className={"btns"} type={"button"} style={{"flex": "1 1 120px", "padding": "11px 14px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--ink)", "fontSize": "14px", "fontWeight": "700"}}>{"Minta revisi"}</button>

<button className={"btns"} type={"button"} style={{"flex": "1 1 80px", "padding": "11px 14px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--err)", "fontSize": "14px", "fontWeight": "700"}}>{"Tolak"}</button>
</div>

<button className={"btns"} type={"button"} style={{"padding": "11px 14px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--ink)", "fontSize": "14px", "fontWeight": "700"}}>{"Salin teks"}</button>
</aside>}
</div>
</> : null}</>;
}

export function DashboardUsage({ vals }) {
  return <>{vals.v.usage ? <>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "flex-end", "justifyContent": "space-between"}}>
<div >
<h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Penggunaan & Billing"}</h1>

<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"Pantau kuota, sumber penggunaan, dan batas biaya tambahan."}</p>
</div>

<span style={{"padding": "9px 14px", "borderRadius": "10px", "border": "1px solid var(--line)", "background": "var(--surface)", "fontSize": "13px", "fontWeight": "700", "color": "var(--soft)"}}>{"Periode: 1 – 31 Okt 2026"}</span>
</div>

<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "stretch"}}>
<section style={{"flex": "2 1 480px", "minWidth": "0", "padding": "24px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "12px", "justifyContent": "space-between", "alignItems": "center"}}><h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Pemakaian kuota"}</h2>
<span style={{"padding": "4px 10px", "borderRadius": "999px", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontSize": "12px", "fontWeight": "700"}}>{"Paket Dasar"}</span></div>

<div style={{"marginTop": "18px", "display": "flex", "alignItems": "baseline", "gap": "10px", "flexWrap": "wrap"}}><span style={{"fontSize": "40px", "fontWeight": "800", "letterSpacing": "-.035em"}}>{"620.000"}</span>
<span style={{"fontSize": "15px", "fontWeight": "600", "color": "var(--mute)"}}>{"dari 1.000.000 token"}</span></div>

<div style={{"marginTop": "16px", "height": "12px", "borderRadius": "999px", "background": "var(--surface2)", "overflow": "hidden"}}><div className={"fill"} style={{"width": "62%", "height": "100%", "borderRadius": "999px", "background": "var(--accent)"}}></div></div>

<div style={{"marginTop": "10px", "display": "flex", "justifyContent": "space-between", "fontSize": "12px", "fontWeight": "600", "color": "var(--mute)"}}><span >{"0"}</span>
<span >{"Peringatan di 80%"}</span>
<span >{"1.000.000"}</span></div>

<div style={{"marginTop": "26px", "borderTop": "1px solid var(--line)", "paddingTop": "20px"}}>
<h3 style={{"margin": "0", "fontSize": "14px", "fontWeight": "800"}}>{"Per divisi"}</h3>

<div style={{"marginTop": "14px", "display": "flex", "flexDirection": "column", "gap": "12px"}}>
{vals.usageDiv.map((u, index15) => <React.Fragment key={index15}>
<div style={{"display": "flex", "alignItems": "center", "gap": "12px", "fontSize": "13px"}}>
<span style={{"flex": "0 0 112px", "fontWeight": "700", "color": "var(--soft)"}}>{u.name}</span>

<span style={{"flex": "1", "height": "10px", "borderRadius": "999px", "background": "var(--surface2)", "overflow": "hidden"}}><span className={"fill"} style={{"display": "block", "width": u.w, "height": "100%", "borderRadius": "999px", "background": u.color}}></span></span>

<span style={{"flex": "0 0 44px", "textAlign": "right", "fontWeight": "700", "color": "var(--ink)"}}>{u.p}</span>
</div>
</React.Fragment>)}
</div>
</div>
</section>

<div style={{"flex": "1 1 320px", "minWidth": "0", "display": "flex", "flexDirection": "column", "gap": "16px"}}>
<section style={{"padding": "22px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Sumber penggunaan"}</h2>

<div style={{"marginTop": "16px", "display": "flex", "flexDirection": "column", "gap": "12px"}}>
<div style={{"display": "flex", "justifyContent": "space-between", "fontSize": "14px"}}><span style={{"fontWeight": "700"}}>{"Dikelola platform"}</span>
<span style={{"fontWeight": "800"}}>{"100%"}</span></div>

<div style={{"display": "flex", "justifyContent": "space-between", "fontSize": "14px"}}><span style={{"fontWeight": "700", "color": "var(--mute)"}}>{"API key sendiri (BYOK)"}</span>
<span style={{"fontWeight": "800", "color": "var(--mute)"}}>{"0%"}</span></div>
</div>

<p style={{"margin": "14px 0 0", "fontSize": "12px", "lineHeight": "1.55", "color": "var(--mute)"}}>{"Biaya platform, biaya provider, dan biaya tambahan akan ditampilkan terpisah."}</p>
</section>

<section style={{"padding": "22px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<div style={{"display": "flex", "alignItems": "center", "justifyContent": "space-between", "gap": "12px"}}><h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Biaya tambahan"}</h2>

<button type={"button"} role={"switch"} aria-checked={vals.overage} aria-label={"Izinkan penggunaan melebihi kuota"} onClick={vals.toggleOverage} style={{"flex": "none", "width": "46px", "height": "26px", "borderRadius": "999px", "border": "0", "padding": "3px", "background": vals.ovBg, "display": "flex", "justifyContent": vals.ovJustify}}><span style={{"width": "20px", "height": "20px", "borderRadius": "50%", "background": "#fff", "boxShadow": "0 1px 3px rgba(0,0,0,.3)"}}></span></button>
</div>

<p style={{"margin": "10px 0 0", "fontSize": "13px", "lineHeight": "1.55", "color": "var(--soft)"}}>{vals.ovText}</p>

<label style={{"display": "block", "marginTop": "14px", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"Batas pengeluaran bulanan "}
<input type={"text"} placeholder={"[Rp —]"} disabled={vals.ovOff} style={{"marginTop": "6px", "width": "100%", "padding": "11px 14px", "borderRadius": "10px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--ink)", "fontSize": "14px", "fontWeight": "600"}} />
</label>
</section>
</div>
</div>

<section style={{"border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"padding": "20px 22px 14px"}}><h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Riwayat penggunaan"}</h2></div>

<div style={{"overflowX": "auto"}}><div style={{"minWidth": "640px"}}>
<div style={{"display": "grid", "gridTemplateColumns": "120px minmax(0,1.6fr) minmax(0,1fr) 100px 100px", "gap": "12px", "padding": "10px 22px", "borderTop": "1px solid var(--line)", "background": "var(--surface2)", "fontSize": "12px", "fontWeight": "800", "letterSpacing": ".04em", "textTransform": "uppercase", "color": "var(--mute)"}}><span >{"Tanggal"}</span>
<span >{"Perintah"}</span>
<span >{"Agent"}</span>
<span style={{"textAlign": "right"}}>{"Token masuk"}</span>
<span style={{"textAlign": "right"}}>{"Token keluar"}</span></div>

{vals.usageRows.map((u, index16) => <React.Fragment key={index16}>
<div className={"rowb"} style={{"display": "grid", "gridTemplateColumns": "120px minmax(0,1.6fr) minmax(0,1fr) 100px 100px", "gap": "12px", "padding": "14px 22px", "borderTop": "1px solid var(--line)", "fontSize": "14px", "alignItems": "center"}}><span style={{"color": "var(--mute)", "fontWeight": "600"}}>{u.date}</span>
<span style={{"fontWeight": "700", "whiteSpace": "nowrap", "overflow": "hidden", "textOverflow": "ellipsis"}}>{u.job}</span>
<span style={{"color": "var(--soft)", "fontWeight": "600"}}>{u.agent}</span>
<span style={{"textAlign": "right", "fontWeight": "600"}}>{u.tin}</span>
<span style={{"textAlign": "right", "fontWeight": "600"}}>{u.tout}</span></div>
</React.Fragment>)}
</div></div>
</section>
</> : null}</>;
}

export function DashboardMembers({ vals }) {
  return <>{vals.v.members ? <>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "flex-end", "justifyContent": "space-between"}}>
<div ><h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Anggota"}</h1>
<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"Kelola siapa yang bisa mengakses workspace ini."}</p></div>

<button className={"btnp"} type={"button"} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "12px 18px", "border": "0", "borderRadius": "12px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "14px", "fontWeight": "700"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.4"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M12 5v14M5 12h14"}></path></svg>
{"Undang anggota"}</button>
</div>

<section style={{"border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"overflowX": "auto"}}><div style={{"minWidth": "640px"}}>
<div style={{"display": "grid", "gridTemplateColumns": "minmax(0,1.6fr) 130px 120px 140px", "gap": "12px", "padding": "12px 22px", "background": "var(--surface2)", "fontSize": "12px", "fontWeight": "800", "letterSpacing": ".04em", "textTransform": "uppercase", "color": "var(--mute)"}}><span >{"Nama"}</span>
<span >{"Peran"}</span>
<span >{"Status"}</span>
<span >{"Aktif terakhir"}</span></div>

{vals.members.map((m, index17) => <React.Fragment key={index17}>
<div className={"rowb"} style={{"display": "grid", "gridTemplateColumns": "minmax(0,1.6fr) 130px 120px 140px", "gap": "12px", "padding": "14px 22px", "borderTop": "1px solid var(--line)", "alignItems": "center", "fontSize": "14px"}}>
<span style={{"display": "flex", "alignItems": "center", "gap": "12px", "minWidth": "0"}}><span style={{"flex": "none", "width": "36px", "height": "36px", "borderRadius": "50%", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontWeight": "800", "fontSize": "12px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{m.ini}</span>
<span style={{"minWidth": "0"}}><span style={{"display": "block", "fontWeight": "700"}}>{m.name}</span>
<span style={{"display": "block", "fontSize": "12px", "color": "var(--mute)", "fontWeight": "600"}}>{m.email}</span></span></span>

<span ><span style={{"padding": "4px 10px", "borderRadius": "999px", "background": "var(--surface2)", "fontSize": "12px", "fontWeight": "700", "color": "var(--soft)"}}>{m.role}</span></span>

<span style={{"display": "inline-flex", "alignItems": "center", "gap": "6px", "fontSize": "13px", "fontWeight": "700", "color": m.ink}}><span style={{"width": "7px", "height": "7px", "borderRadius": "50%", "background": "currentColor"}}></span>
{m.status}</span>

<span style={{"color": "var(--mute)", "fontWeight": "600"}}>{m.last}</span>
</div>
</React.Fragment>)}
</div></div>
</section>

<div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(240px,1fr))", "gap": "16px"}}>
{vals.roleInfo.map((r, index18) => <React.Fragment key={index18}>
<div style={{"padding": "18px", "border": "1px solid var(--line)", "borderRadius": "14px", "background": "var(--surface)"}}><div style={{"fontSize": "14px", "fontWeight": "800"}}>{r.name}</div>
<p style={{"margin": "6px 0 0", "fontSize": "13px", "lineHeight": "1.55", "color": "var(--soft)"}}>{r.body}</p></div>
</React.Fragment>)}
</div>
</> : null}</>;
}

export function DashboardApiKeys({ vals }) {
  return <>{vals.v.keys ? <>
<div ><h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"API Key & Provider"}</h1>
<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"Pilih sumber model AI untuk workspace ini."}</p></div>

<div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(320px,1fr))", "gap": "16px"}}>
<section style={{"padding": "24px", "border": "2px solid var(--accent)", "borderRadius": "16px", "background": "var(--surface)"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "10px"}}><span style={{"width": "12px", "height": "12px", "borderRadius": "50%", "background": "var(--accentText)"}}></span>
<h2 style={{"margin": "0", "fontSize": "17px", "fontWeight": "800"}}>{"Dikelola platform"}</h2>
<span style={{"marginLeft": "auto", "padding": "4px 10px", "borderRadius": "999px", "background": "var(--okSoft)", "color": "var(--ok)", "fontSize": "12px", "fontWeight": "700"}}>{"Aktif"}</span></div>

<p style={{"margin": "12px 0 0", "fontSize": "14px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Langsung pakai tanpa konfigurasi. Penggunaan dihitung terhadap kuota paket Anda."}</p>
</section>

<section style={{"padding": "24px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)"}}>
<div style={{"display": "flex", "alignItems": "center", "gap": "10px"}}><span style={{"width": "12px", "height": "12px", "borderRadius": "50%", "border": "2px solid var(--mute)"}}></span>
<h2 style={{"margin": "0", "fontSize": "17px", "fontWeight": "800"}}>{"API key sendiri (BYOK)"}</h2>
<span style={{"marginLeft": "auto", "padding": "4px 10px", "borderRadius": "999px", "background": "var(--surface2)", "border": "1px solid var(--line)", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"Segera hadir"}</span></div>

<p style={{"margin": "12px 0 0", "fontSize": "14px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Gunakan kredensial provider milik Anda. Biaya provider ditagihkan ke akun Anda."}</p>
</section>
</div>

<section style={{"padding": "24px", "border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)"}}>
<h2 style={{"margin": "0", "fontSize": "16px", "fontWeight": "800"}}>{"Tambah API key"}</h2>

<div style={{"marginTop": "16px", "display": "flex", "flexWrap": "wrap", "gap": "14px", "alignItems": "flex-end"}}>
<label style={{"flex": "1 1 200px", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"Provider"}
<div style={{"marginTop": "6px", "padding": "12px 14px", "borderRadius": "10px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--ink)", "fontSize": "14px", "fontWeight": "600", "display": "flex", "justifyContent": "space-between"}}>{"Anthropic"}
<svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"var(--mute)"} strokeWidth={"2.2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M6 9l6 6 6-6"}></path></svg></div></label>

<label style={{"flex": "2 1 280px", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"API key"}
<input type={"password"} placeholder={"sk-ant-…"} disabled style={{"marginTop": "6px", "width": "100%", "padding": "12px 14px", "borderRadius": "10px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--ink)", "fontSize": "14px"}} /></label>

<button type={"button"} disabled style={{"padding": "12px 20px", "border": "0", "borderRadius": "10px", "background": "var(--surface2)", "color": "var(--mute)", "fontSize": "14px", "fontWeight": "700", "cursor": "not-allowed"}}>{"Simpan"}</button>
</div>

<p style={{"margin": "14px 0 0", "fontSize": "12px", "lineHeight": "1.6", "color": "var(--mute)"}}>{"Key disimpan terenkripsi dan tidak pernah ditampilkan utuh setelah disimpan."}</p>
</section>
</> : null}</>;
}

export function DashboardOrganizations({ vals }) {
  return <>{vals.v.tenants ? <>
<div ><h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Organisasi"}</h1>
<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"Semua organisasi pelanggan di platform."}</p></div>

<div style={{"display": "flex", "gap": "12px", "alignItems": "flex-start", "padding": "14px 18px", "borderRadius": "12px", "background": "var(--accentSoft)", "color": "var(--ink)", "fontSize": "14px", "lineHeight": "1.55"}}><svg width={"20"} height={"20"} viewBox={"0 0 24 24"} fill={"none"} stroke={"var(--accentText)"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"} style={{"flex": "none", "marginTop": "1px"}}><path d={"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"}></path></svg>
<span >{"Sebagai admin platform, Anda hanya melihat metadata organisasi. Konten pelanggan tidak dapat dibuka tanpa dasar kebijakan dan audit."}</span></div>

<section style={{"border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"overflowX": "auto"}}><div style={{"minWidth": "720px"}}>
<div style={{"display": "grid", "gridTemplateColumns": "minmax(0,1.6fr) 110px 100px 100px 130px 120px", "gap": "12px", "padding": "12px 22px", "background": "var(--surface2)", "fontSize": "12px", "fontWeight": "800", "letterSpacing": ".04em", "textTransform": "uppercase", "color": "var(--mute)"}}><span >{"Organisasi"}</span>
<span >{"Paket"}</span>
<span >{"Workspace"}</span>
<span >{"Anggota"}</span>
<span >{"Kuota"}</span>
<span >{"Status"}</span></div>

{vals.tenants.map((t, index19) => <React.Fragment key={index19}>
<div className={"rowb"} style={{"display": "grid", "gridTemplateColumns": "minmax(0,1.6fr) 110px 100px 100px 130px 120px", "gap": "12px", "padding": "14px 22px", "borderTop": "1px solid var(--line)", "alignItems": "center", "fontSize": "14px"}}>
<span style={{"display": "flex", "alignItems": "center", "gap": "12px", "minWidth": "0"}}><span style={{"flex": "none", "width": "34px", "height": "34px", "borderRadius": "9px", "background": "var(--accentSoft)", "color": "var(--accentText)", "fontWeight": "800", "fontSize": "12px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>{t.ini}</span>
<span style={{"fontWeight": "700", "whiteSpace": "nowrap", "overflow": "hidden", "textOverflow": "ellipsis"}}>{t.name}</span></span>

<span style={{"fontWeight": "600", "color": "var(--soft)"}}>{t.plan}</span>
<span style={{"fontWeight": "600"}}>{t.ws}</span>
<span style={{"fontWeight": "600"}}>{t.members}</span>

<span style={{"display": "flex", "alignItems": "center", "gap": "8px"}}><span style={{"flex": "1", "height": "8px", "borderRadius": "999px", "background": "var(--surface2)", "overflow": "hidden"}}><span className={"fill"} style={{"display": "block", "width": t.q, "height": "100%", "background": "var(--accent)"}}></span></span>
<span style={{"fontSize": "12px", "fontWeight": "700", "color": "var(--soft)"}}>{t.q}</span></span>

<span style={{"display": "inline-flex", "alignItems": "center", "gap": "6px", "fontSize": "13px", "fontWeight": "700", "color": t.ink}}><span style={{"width": "7px", "height": "7px", "borderRadius": "50%", "background": "currentColor"}}></span>
{t.status}</span>
</div>
</React.Fragment>)}
</div></div>
</section>
</> : null}</>;
}

export function DashboardPlans({ vals }) {
  return <>{vals.v.plans ? <>
<div style={{"display": "flex", "flexWrap": "wrap", "gap": "16px", "alignItems": "flex-end", "justifyContent": "space-between"}}>
<div ><h1 style={{"margin": "0", "fontSize": "28px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Paket & Entitlement"}</h1>
<p style={{"margin": "6px 0 0", "fontSize": "15px", "color": "var(--soft)"}}>{"Atur kemampuan dan batas tiap paket. Diperiksa di backend, bukan hanya di tampilan."}</p></div>

<button className={"btnp"} type={"button"} style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "12px 18px", "border": "0", "borderRadius": "12px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "14px", "fontWeight": "700"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.4"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M12 5v14M5 12h14"}></path></svg>
{"Paket baru"}</button>
</div>

<section style={{"border": "1px solid var(--line)", "borderRadius": "16px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
<div style={{"overflowX": "auto"}}><div style={{"minWidth": "680px"}}>
<div style={{"display": "grid", "gridTemplateColumns": "minmax(0,1.5fr) repeat(3,minmax(0,1fr))", "gap": "12px", "padding": "14px 22px", "background": "var(--surface2)", "fontSize": "13px", "fontWeight": "800"}}>
<span style={{"fontSize": "12px", "letterSpacing": ".04em", "textTransform": "uppercase", "color": "var(--mute)"}}>{"Entitlement"}</span>
<span >{"Dasar"}</span>
<span >{"Pro"}</span>
<span >{"Enterprise"}</span>
</div>

{vals.entitlements.map((e, index20) => <React.Fragment key={index20}>
<div className={"rowb"} style={{"display": "grid", "gridTemplateColumns": "minmax(0,1.5fr) repeat(3,minmax(0,1fr))", "gap": "12px", "padding": "14px 22px", "borderTop": "1px solid var(--line)", "alignItems": "center", "fontSize": "14px"}}>
<span style={{"fontWeight": "700"}}>{e.name}</span>

<span style={{"fontWeight": "600", "color": e.i1}}>{e.a}</span>
<span style={{"fontWeight": "600", "color": e.i2}}>{e.b}</span>
<span style={{"fontWeight": "600", "color": e.i3}}>{e.c}</span>
</div>
</React.Fragment>)}
</div></div>
</section>

<p style={{"margin": "0", "fontSize": "13px", "color": "var(--mute)"}}>{"Nilai dalam kurung siku masih menunggu keputusan produk dan bisnis."}</p>
</> : null}</>;
}

export function DashboardComingSoon({ vals }) {
  return <>{vals.v.soon ? <>
<div style={{"padding": "72px 24px", "border": "1px dashed var(--line)", "borderRadius": "20px", "background": "var(--surface)", "textAlign": "center"}}>
<span style={{"width": "56px", "height": "56px", "borderRadius": "16px", "background": "var(--accentSoft)", "color": "var(--accentText)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}><svg width={"26"} height={"26"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={vals.soonIcon}></path></svg></span>

<h1 style={{"margin": "20px 0 0", "fontSize": "24px", "letterSpacing": "-.02em", "fontWeight": "800"}}>{vals.pageTitle}</h1>

<p style={{"margin": "10px auto 0", "maxWidth": "440px", "fontSize": "15px", "lineHeight": "1.6", "color": "var(--soft)"}}>{vals.soonText}</p>

<span style={{"display": "inline-block", "marginTop": "18px", "padding": "5px 12px", "borderRadius": "999px", "background": "var(--surface2)", "border": "1px solid var(--line)", "fontSize": "12px", "fontWeight": "700", "color": "var(--mute)"}}>{"Segera hadir"}</span>
</div>
</> : null}</>;
}

export function DashboardLayout({ vals }) { return <div className={vals.rootClass} style={{"position": "relative"}}>
<DashboardSplash vals={vals} />

<div style={{"display": "flex", "flexWrap": "wrap", "alignItems": "stretch", "minHeight": "1100px"}}>


<DashboardSidebar vals={vals} />



<div style={{"flex": "999 1 560px", "minWidth": "0", "display": "flex", "flexDirection": "column"}}>


<DashboardTopbar vals={vals} />

<main style={{"padding": "28px 32px 56px", "display": "flex", "flexDirection": "column", "gap": "24px"}}>


{vals.content !== undefined ? vals.content : <><DashboardOverview vals={vals} />



<DashboardOfficePreview vals={vals} />



<DashboardAgents vals={vals} />



<DashboardBoard vals={vals} />



<DashboardUsage vals={vals} />



<DashboardMembers vals={vals} />



<DashboardApiKeys vals={vals} />



<DashboardOrganizations vals={vals} />



<DashboardPlans vals={vals} />



<DashboardComingSoon vals={vals} /></>}
</main>
</div>
</div>
</div>; }

export class DashboardDesign extends React.Component {
  constructor(props) {
    super(props);
    let sys = false;
    try { sys = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { sys = false; }
    const splash = !(props && props.splash === false);
    this.state = { dark: !!(props && props.dark) || sys, role: 'owner', view: 'overview', div: 'all', tab: 'draft', sel: 0, overage: false, sp: splash ? 'on' : 'off', splash };
  }
  componentDidMount() { if (this.state.splash) this.runSplash(); }
  componentWillUnmount() { clearTimeout(this._t1); clearTimeout(this._t2); }
  runSplash() {
    clearTimeout(this._t1); clearTimeout(this._t2);
    this.setState({ sp: 'on' });
    this._t1 = setTimeout(() => this.setState({ sp: 'out' }), 2000);
    this._t2 = setTimeout(() => this.setState({ sp: 'off' }), 2700);
  }

  renderVals() {
    const s = this.state;
    const set = (o) => this.setState(o);

    const ICON = {
      overview: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
      office: 'M12 2l9 5v10l-9 5-9-5V7l9-5zM12 12l9-5M12 12v10M12 12L3 7',
      agents: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
      jobs: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
      workflows: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
      usage: 'M18 20V10M12 20V4M6 20v-6',
      members: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
      keys: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
      settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
      tenants: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01',
      plans: 'M1 4h22v16H1zM1 10h22',
      templates: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
      models: 'M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v3h2a2 2 0 1 1 0 4H4v3a2 2 0 0 0 2 2h3v-2a2 2 0 1 1 4 0v2h3a2 2 0 0 0 2-2v-3h-2a2 2 0 1 1 0-4h2V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3z',
    };
    const TITLE = {
      overview: 'Overview', office: 'Kantor 3D', agents: 'Agent', jobs: 'Perintah & Board', workflows: 'Workflow',
      usage: 'Penggunaan & Billing', members: 'Anggota', keys: 'API Key & Provider', settings: 'Pengaturan',
      tenants: 'Organisasi', plans: 'Paket & Entitlement', templates: 'Template & Prompt', models: 'Model Registry',
    };
    const SOON = {
      workflows: 'Rangkai beberapa agent dan perintah menjadi alur kerja yang bisa dijalankan ulang. Tersedia setelah mesin eksekusi siap.',
      settings: 'Profil, preferensi tampilan, dan pengaturan workspace akan tersedia di sini.',
      templates: 'Kelola template agent dan prompt platform dengan validasi sebelum dipublikasikan.',
      models: 'Kelola daftar provider dan model AI yang didukung platform.',
    };
    const isAdmin = s.role === 'admin';
    const adminViews = ['tenants', 'plans', 'templates', 'models'];
    const view = (!isAdmin && adminViews.indexOf(s.view) >= 0) ? 'overview' : s.view;
    const go = (id) => () => set({ view: id });

    const mk = (id, label, extra) => Object.assign({
      id, label, icon: ICON[id],
      go: go(id),
      current: view === id ? 'page' : undefined,
      bg: view === id ? 'var(--accentSoft)' : 'transparent',
      ink: view === id ? 'var(--accentText)' : 'var(--soft)',
      weight: view === id ? 800 : 600,
      shadow: view === id ? 'inset 3px 0 0 var(--accent)' : 'none',
    }, extra || {});

    const navGroups = [
      { title: 'Utama', items: [mk('overview', 'Overview'), mk('office', 'Kantor 3D'), mk('agents', 'Agent'), mk('jobs', 'Perintah', { badge: '7' }), mk('workflows', 'Workflow', { soon: true })] },
      { title: 'Kelola', items: [mk('usage', 'Penggunaan & Billing'), mk('members', 'Anggota'), mk('keys', 'API Key'), mk('settings', 'Pengaturan')] },
    ];
    if (isAdmin) {
      navGroups.push({ title: 'Admin platform', items: [mk('tenants', 'Organisasi'), mk('plans', 'Paket & Entitlement'), mk('templates', 'Template & Prompt', { soon: true }), mk('models', 'Model Registry', { soon: true })] });
    }

    const DIV = {
      proposal: ['Proposal Writer', '#4f7cff'], ads: ['Ads Copywriter', '#ff8a3d'], social: ['Social Media', '#ff5fa2'],
      qa: ['Web QA', '#2fbf71'], dev: ['Developer Helper', '#8a5cf6'], reporting: ['Reporting', '#14b8a6'],
      account: ['Account Manager', '#f5b82e'], finance: ['Finance', '#64748b'],
    };
    const AG = [
      ['Roy Ahmad', 'Head of Proposals', 'proposal', 1], ['Bagas Prasetyo', 'Client Research', 'proposal', 0], ['Siti Nurhaliza', 'Proposal Writer', 'proposal', 0], ['Dimas Aryanto', 'Pricing & Scope', 'proposal', 0],
      ['Putri Maharani', 'Head of Ads Copy', 'ads', 1], ['Fajar Nugroho', 'Meta Ads Copy', 'ads', 0], ['Anisa Rahmawati', 'Google Ads Copy', 'ads', 0], ['Yoga Pratama', 'Landing & CTA Tester', 'ads', 0],
      ['Dewi Kartika', 'Head of Social', 'social', 1], ['Raka Wijaya', 'Content Planner', 'social', 0], ['Nadia Safitri', 'Caption Writer', 'social', 0], ['Eko Saputra', 'Video Script', 'social', 0],
      ['Hendra Gunawan', 'QA Lead', 'qa', 1], ['Laras Ayuningtyas', 'Visual & Responsive QA', 'qa', 0], ['Andi Kurniawan', 'Functional QA', 'qa', 0], ['Maya Anggraini', 'Performance & SEO QA', 'qa', 0],
      ['Arief Setiawan', 'Tech Lead', 'dev', 1], ['Citra Lestari', 'WordPress & Elementor', 'dev', 0], ['Bayu Firmansyah', 'Backend Developer', 'dev', 0], ['Tari Susanti', 'Webflow & Frontend', 'dev', 0],
      ['Kirana Dewanti', 'Reporting Analyst', 'reporting', 0], ['Rizky Ramadhan', 'Account Manager', 'account', 0], ['Melati Handayani', 'Finance & Admin', 'finance', 0],
    ];
    const ini = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('');
    const tint = (c) => c + '33';

    // ---------- overview ----------
    const kpis = [
      { label: 'Perintah bulan ini', value: '48', note: '+12%', bg: 'var(--okSoft)', ink: 'var(--ok)' },
      { label: 'Menunggu review', value: '7', note: 'Perlu tindakan', bg: 'var(--warnSoft)', ink: 'var(--warn)' },
      { label: 'Disetujui', value: '31', note: '65%', bg: 'var(--accentSoft)', ink: 'var(--accentText)' },
      { label: 'Gagal', value: '2', note: '4%', bg: 'var(--errSoft)', ink: 'var(--err)' },
    ];
    const bv = [6, 9, 5, 12, 8, 3, 5], bd = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const bars = bv.map((v, i) => ({ v: String(v), d: bd[i], h: Math.round((v / 12) * 100) * 1.1 + 'px', o: v === 12 ? 1 : 0.55, delay: (0.2 + i * 0.07).toFixed(2) + 's' }));
    const ST = {
      draft: ['Draft', 'var(--accentSoft)', 'var(--accentText)'], revising: ['Direvisi', 'var(--warnSoft)', 'var(--warn)'],
      approved: ['Disetujui', 'var(--okSoft)', 'var(--ok)'], rejected: ['Ditolak', 'var(--errSoft)', 'var(--err)'],
    };
    const ITEMS = [
      { title: 'Planner konten November — Instagram', agent: 'Raka Wijaya', div: 'social', type: 'Ide konten', st: 'draft', ver: 1, when: '12 mnt lalu', fields: [{ label: 'Pilar', value: 'Edukasi, promo, testimoni' }, { label: 'Ide 1', value: 'Tips merawat biji kopi di rumah, format carousel 6 slide.' }, { label: 'Ide 2', value: 'Behind the scene proses roasting, Reels 30 detik.' }] },
      { title: 'Carousel: 5 kesalahan SEO toko online', agent: 'Nadia Safitri', div: 'social', type: 'Carousel', st: 'draft', ver: 2, when: '1 jam lalu', fields: [{ label: 'Slide 1', value: 'Hook: Toko online kamu sepi pengunjung? Mungkin ini penyebabnya.' }, { label: 'Slide 2', value: 'Kesalahan 1: judul produk terlalu singkat.' }, { label: 'CTA', value: 'Simpan postingan ini untuk checklist SEO-mu.' }] },
      { title: 'Proposal website company profile', agent: 'Siti Nurhaliza', div: 'proposal', type: 'Proposal', st: 'revising', ver: 3, when: '2 jam lalu', fields: [{ label: 'Ringkasan eksekutif', value: 'Kami mengusulkan website company profile yang menonjolkan kredibilitas dan mempermudah calon klien menghubungi Anda.' }, { label: 'Alasan revisi', value: 'Perjelas bagian timeline.' }] },
      { title: 'Paket harga website Shopify, 3 tier', agent: 'Dimas Aryanto', div: 'proposal', type: 'Paket harga', st: 'draft', ver: 1, when: 'Kemarin', fields: [{ label: 'Paket 1', value: 'Basic: [harga], scope inti, 3 minggu.' }, { label: 'Paket 2', value: 'Standard: [harga], tambah integrasi pembayaran, 5 minggu.' }, { label: 'Termin', value: '50% di awal, 50% saat serah terima.' }] },
      { title: 'Copy RSA: kursus bahasa Inggris', agent: 'Anisa Rahmawati', div: 'ads', type: 'Copy iklan', st: 'approved', ver: 1, when: 'Kemarin', fields: [{ label: 'Headline 1', value: 'Kursus Inggris Online (29/30)' }, { label: 'Deskripsi 1', value: 'Belajar fleksibel dengan tutor berpengalaman. Coba kelas gratis hari ini.' }] },
      { title: 'Checklist handover toko online', agent: 'Hendra Gunawan', div: 'qa', type: 'Checklist QA', st: 'approved', ver: 1, when: '2 hari lalu', fields: [{ label: 'Fungsional', value: 'Checkout, pembayaran, email notifikasi: 9 dari 12 selesai.' }, { label: 'Visual', value: 'Responsive mobile dan tablet: selesai.' }] },
      { title: 'Laporan bulanan September', agent: 'Kirana Dewanti', div: 'reporting', type: 'Laporan', st: 'rejected', ver: 1, when: '3 hari lalu', fields: [{ label: 'Alasan ditolak', value: 'Data Search Console belum dimasukkan.' }, { label: 'Ringkasan', value: 'Trafik organik turun karena perubahan struktur URL.' }] },
      { title: 'Draft pesan update progres ke klien', agent: 'Rizky Ramadhan', div: 'account', type: 'Pesan klien', st: 'draft', ver: 1, when: '3 hari lalu', fields: [{ label: 'Pesan', value: 'Halo Bu Rani, desain homepage sudah siap ditinjau. Mohon masukannya sampai Jumat ya.' }, { label: 'Channel', value: 'WhatsApp, nada hangat' }] },
    ];
    const recent = ITEMS.slice(0, 5).map((it) => {
      const c = DIV[it.div][1]; const st = ST[it.st];
      return { title: it.title, agent: it.agent, when: it.when, ini: ini(it.agent), tint: tint(c), status: st[0], sbg: st[1], sink: st[2] };
    });
    const todo = [
      { label: 'Buat organisasi dan workspace', done: true }, { label: 'Pilih template agent pertama', done: true },
      { label: 'Kirim perintah pertama', done: false }, { label: 'Undang anggota tim', done: false },
    ].map((t) => ({
      label: t.label, ink: t.done ? 'var(--mute)' : 'var(--ink)', ring: t.done ? 'var(--accent)' : 'var(--line)',
      fill: t.done ? 'var(--accent)' : 'transparent', tick: t.done ? 1 : 0, dec: t.done ? 'line-through' : 'none',
    }));
    const tiles = ['proposal', 'ads', 'social', 'qa', 'dev', 'reporting', 'account', 'finance'].map((k) => ({
      name: DIV[k][0].split(' ')[0], bg: DIV[k][1] + '2b', line: DIV[k][1] + '66',
    }));
    tiles.push({ name: 'Kosong', bg: 'transparent', line: 'var(--line)' });

    // ---------- office ----------
    const officeChips = Object.keys(DIV).map((k) => ({ name: DIV[k][0], color: DIV[k][1] }));
    const mates = ['Roy Ahmad', 'Bagas Prasetyo', 'Siti Nurhaliza', 'Dimas Aryanto'].map((n) => ({
      name: n, ini: ini(n), alpha: n === 'Bagas Prasetyo' ? '' : '33', ring: n === 'Bagas Prasetyo' ? 'var(--accent)' : 'transparent',
    }));

    // ---------- agents ----------
    const divChips = [{ id: 'all', name: 'Semua', color: 'var(--mute)' }].concat(Object.keys(DIV).map((k) => ({ id: k, name: DIV[k][0], color: DIV[k][1] }))).map((c) => {
      const on = s.div === c.id;
      return { name: c.name, color: c.color, on, pick: () => set({ div: c.id }), bg: on ? 'var(--accentSoft)' : 'var(--surface)', ink: on ? 'var(--accentText)' : 'var(--soft)', line: on ? 'var(--accent)' : 'var(--line)' };
    });
    const agentCards = AG.filter((a) => s.div === 'all' || a[2] === s.div).map((a) => ({
      name: a[0], role: a[1], ini: ini(a[0]), division: DIV[a[2]][0], color: DIV[a[2]][1], tint: tint(DIV[a[2]][1]), lead: !!a[3],
    }));

    // ---------- jobs ----------
    const tabDefs = [['draft', 'Draft'], ['approved', 'Disetujui'], ['rejected', 'Ditolak'], ['all', 'Semua']];
    const jobTabs = tabDefs.map((t) => {
      const count = ITEMS.filter((it) => t[0] === 'all' || it.st === t[0] || (t[0] === 'draft' && it.st === 'revising')).length;
      const on = s.tab === t[0];
      return { label: t[1], count, on, pick: () => set({ tab: t[0], sel: 0 }), ink: on ? 'var(--accentText)' : 'var(--mute)', line: on ? 'var(--accent)' : 'transparent' };
    });
    const visible = ITEMS.filter((it) => s.tab === 'all' || it.st === s.tab || (s.tab === 'draft' && it.st === 'revising'));
    const selIdx = Math.min(s.sel, Math.max(visible.length - 1, 0));
    const jobRows = visible.map((it, i) => {
      const c = DIV[it.div][1]; const st = ST[it.st]; const on = i === selIdx;
      return { title: it.title, agent: it.agent.split(' ')[0], type: it.type, ver: it.ver, when: it.when, ini: ini(it.agent), tint: tint(c), status: st[0], sbg: st[1], sink: st[2], on, edge: on ? 'var(--accent)' : 'transparent', bg: on ? 'var(--accentSoft)' : 'transparent', pick: () => set({ sel: i }) };
    });
    const cur = visible[selIdx] || ITEMS[0];
    const cst = ST[cur.st];
    const sel = { title: cur.title, agent: cur.agent, type: cur.type, ver: cur.ver, when: cur.when, fields: cur.fields, status: cst[0], sbg: cst[1], sink: cst[2] };

    // ---------- usage ----------
    const uPct = [['social', 28], ['proposal', 22], ['ads', 17], ['dev', 12], ['qa', 9], ['reporting', 6], ['account', 4], ['finance', 2]];
    const usageDiv = uPct.map((u) => ({ name: DIV[u[0]][0].split(' ')[0] + (u[0] === 'social' ? ' Media' : ''), color: DIV[u[0]][1], w: (u[1] * 3) + '%', p: u[1] + '%' }));
    const usageRows = [
      { date: '21 Okt 2026', job: 'Planner konten November', agent: 'Raka Wijaya', tin: '2.140', tout: '6.820' },
      { date: '21 Okt 2026', job: 'Carousel: 5 kesalahan SEO', agent: 'Nadia Safitri', tin: '1.380', tout: '4.210' },
      { date: '20 Okt 2026', job: 'Draft proposal company profile', agent: 'Siti Nurhaliza', tin: '3.020', tout: '9.450' },
      { date: '20 Okt 2026', job: 'Copy RSA kursus bahasa', agent: 'Anisa Rahmawati', tin: '980', tout: '2.760' },
      { date: '19 Okt 2026', job: 'Checklist handover', agent: 'Hendra Gunawan', tin: '1.150', tout: '3.340' },
    ];
    const ov = s.overage;

    // ---------- members ----------
    const members = [
      { name: 'Nama Pengguna', email: 'owner@contoh.id', role: 'Owner', status: 'Aktif', ink: 'var(--ok)', last: 'Sekarang' },
      { name: 'Anggota Satu', email: 'anggota1@contoh.id', role: 'Member', status: 'Aktif', ink: 'var(--ok)', last: '2 jam lalu' },
      { name: 'Anggota Dua', email: 'anggota2@contoh.id', role: 'Member', status: 'Aktif', ink: 'var(--ok)', last: 'Kemarin' },
      { name: 'Peninjau Klien', email: 'viewer@contoh.id', role: 'Viewer', status: 'Aktif', ink: 'var(--ok)', last: '3 hari lalu' },
      { name: 'Calon Anggota', email: 'baru@contoh.id', role: 'Member', status: 'Diundang', ink: 'var(--warn)', last: '—' },
    ].map((m) => Object.assign({ ini: ini(m.name) }, m));
    const roleInfo = [
      { name: 'Owner', body: 'Mengelola organisasi, anggota, konfigurasi, dan penggunaan.' },
      { name: 'Member', body: 'Memakai agent, mengirim perintah, dan meninjau hasil sesuai paket.' },
      { name: 'Viewer', body: 'Akses baca. Tidak dapat menjalankan tindakan yang mengubah data.' },
    ];

    // ---------- admin ----------
    const tenants = [
      { name: 'Organisasi Contoh', plan: 'Dasar', ws: 1, members: 5, q: '62%', status: 'Aktif', ink: 'var(--ok)' },
      { name: 'Studio Kreatif A', plan: 'Pro', ws: 3, members: 12, q: '41%', status: 'Aktif', ink: 'var(--ok)' },
      { name: 'Agensi Digital B', plan: 'Pro', ws: 2, members: 8, q: '88%', status: 'Aktif', ink: 'var(--ok)' },
      { name: 'Konsultan C', plan: 'Dasar', ws: 1, members: 3, q: '12%', status: 'Uji coba', ink: 'var(--warn)' },
      { name: 'Perusahaan D', plan: 'Enterprise', ws: 6, members: 40, q: '55%', status: 'Ditangguhkan', ink: 'var(--err)' },
    ].map((t) => Object.assign({ ini: ini(t.name) }, t));
    const Y = 'Ya', N = 'Tidak', T = 'sesuai entitlement';
    const entitlements = [
      ['Template agent', Y, Y, Y], ['Template workflow', Y, Y, Y], ['Kustomisasi agent', N, T, T], ['Workflow builder', N, T, T],
      ['Kuota token per periode', '[menyusul]', '[menyusul]', '[menyusul]'], ['Biaya tambahan (overage)', N, Y, Y], ['API key sendiri (BYOK)', N, Y, Y],
      ['Batas anggota', '[menyusul]', '[menyusul]', '[menyusul]'],
    ].map((r) => {
      const ink = (v) => (v === N ? 'var(--mute)' : (v.charAt(0) === '[' ? 'var(--warn)' : 'var(--ink)'));
      return { name: r[0], a: r[1], b: r[2], c: r[3], i1: ink(r[1]), i2: ink(r[2]), i3: ink(r[3]) };
    });

    const roleLabel = isAdmin ? 'Admin platform' : 'Owner';
    const soon = !!SOON[view];
    return {
      rootClass: s.dark ? 'vo dark' : 'vo',
      splashOn: s.sp !== 'off', splashClass: s.sp === 'out' ? 'splash out' : 'splash',
      replaySplash: () => this.runSplash(),
      themeIcon: s.dark ? 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4' : 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
      toggleTheme: () => set({ dark: !s.dark }),
      navGroups,
      pageTitle: TITLE[view],
      roleLabel,
      isOwner: !isAdmin, isAdmin,
      asOwner: () => set({ role: 'owner' }), asAdmin: () => set({ role: 'admin' }),
      ownerBg: !isAdmin ? 'var(--surface)' : 'transparent', ownerInk: !isAdmin ? 'var(--ink)' : 'var(--mute)',
      adminBg: isAdmin ? 'var(--surface)' : 'transparent', adminInk: isAdmin ? 'var(--ink)' : 'var(--mute)',
      v: {
        overview: view === 'overview', office: view === 'office', agents: view === 'agents', jobs: view === 'jobs', usage: view === 'usage',
        members: view === 'members', keys: view === 'keys', tenants: view === 'tenants', plans: view === 'plans', soon,
      },
      soonIcon: ICON[view], soonText: SOON[view] || '',
      goAgents: go('agents'), goJobs: go('jobs'), goUsage: go('usage'), goOffice: go('office'),
      kpis, bars, recent, todo, tiles,
      officeChips, mates,
      divChips, agentCards,
      jobTabs, jobRows, jobsEmpty: visible.length === 0, sel,
      usageDiv, usageRows, overage: ov, toggleOverage: () => set({ overage: !ov }),
      ovBg: ov ? 'var(--accent)' : 'var(--line)', ovJustify: ov ? 'flex-end' : 'flex-start', ovOff: !ov,
      ovText: ov ? 'Penggunaan melebihi kuota akan dilanjutkan sampai batas pengeluaran yang Anda tetapkan.' : 'Nonaktif. Saat kuota habis, perintah baru akan dihentikan sampai periode berikutnya.',
      members, roleInfo, tenants, entitlements,
    };
  }

  render() {
    const vals = this.props.decorate ? this.props.decorate(this.renderVals(), this) : this.renderVals();
    vals.rootClass += ' reference-page reference-dashboard';
    return <DashboardLayout vals={vals} />;
  }
}
