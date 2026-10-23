// Converted from Onboarding-html.zip/Onboarding.dc.html; original SVG paths, layout and motion preserved.
import React from 'react';
import './onboarding.css';

export function OnboardingSplash({ vals }) {
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

export function OnboardingProgressSidebar({ vals }) {
  return <><aside className={"side"} style={{"flex": "1 1 380px", "maxWidth": "520px", "background": "var(--surface)", "borderRight": "1px solid var(--line)", "padding": "40px 48px", "display": "flex", "flexDirection": "column", "gap": "48px"}}>
<a href={"/"} style={{"display": "flex", "alignItems": "center", "gap": "10px", "fontWeight": "800", "fontSize": "18px", "letterSpacing": "-.01em"}}>
<span style={{"width": "32px", "height": "32px", "borderRadius": "9px", "background": "#4f7cff", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}} aria-hidden={"true"}><svg width={"18"} height={"18"} viewBox={"0 0 32 32"}><rect x={"5"} y={"6"} width={"22"} height={"15"} rx={"3"} fill={"#fff"}></rect>
<rect x={"11"} y={"24"} width={"10"} height={"3"} rx={"1.5"} fill={"#fff"}></rect></svg></span>
{" Virtual Office "}</a>

<div >
<h1 style={{"margin": "0", "fontSize": "32px", "lineHeight": "1.15", "letterSpacing": "-.03em", "fontWeight": "800"}}>{"Siapkan kantor virtual Anda."}</h1>

<p style={{"margin": "14px 0 0", "fontSize": "16px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Tiga langkah singkat. Anda bisa mengubah semuanya nanti di dashboard."}</p>
</div>

<ol style={{"listStyle": "none", "margin": "0", "padding": "0", "display": "flex", "flexDirection": "column", "gap": "6px"}}>
{vals.steps.map((s, index1) => <React.Fragment key={index1}>
<li style={{"display": "flex", "alignItems": "center", "gap": "14px", "padding": "14px", "borderRadius": "14px", "background": s.bg}}>
<span style={{"flex": "none", "width": "34px", "height": "34px", "borderRadius": "50%", "background": s.dotBg, "color": s.dotInk, "border": "2px solid " + (s.ring), "fontWeight": "800", "fontSize": "14px", "display": "inline-flex", "alignItems": "center", "justifyContent": "center"}}>
{s.done ? <><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"3"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M20 6L9 17l-5-5"}></path></svg></> : null}

{s.todo ? <><span >{s.n}</span></> : null}
</span>

<span style={{"lineHeight": "1.35"}}><span style={{"display": "block", "fontSize": "15px", "fontWeight": "800", "color": s.ink}}>{s.title}</span>
<span style={{"display": "block", "fontSize": "13px", "fontWeight": "600", "color": "var(--mute)"}}>{s.sub}</span></span>
</li>
</React.Fragment>)}
</ol>

<div style={{"marginTop": "auto", "display": "flex", "flexWrap": "wrap", "gap": "10px"}}>
<button className={"btns"} type={"button"} onClick={vals.replaySplash} style={{"alignSelf": "flex-start", "display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "10px 14px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--soft)", "fontSize": "13px", "fontWeight": "700"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={"M3 12a9 9 0 1 0 3-6.7M3 4v5h5"}></path></svg>
{"Putar ulang splash"}</button>

<button className={"btns"} type={"button"} onClick={vals.toggleTheme} style={{"alignSelf": "flex-start", "display": "inline-flex", "alignItems": "center", "gap": "8px", "padding": "10px 14px", "border": "1px solid var(--line)", "borderRadius": "10px", "background": "var(--surface)", "color": "var(--soft)", "fontSize": "13px", "fontWeight": "700"}}><svg width={"16"} height={"16"} viewBox={"0 0 24 24"} fill={"none"} stroke={"currentColor"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} aria-hidden={"true"}><path d={vals.themeIcon}></path></svg>
{vals.themeLabel}</button>
</div>
</aside></>;
}

export function OnboardingWorkspaceForm({ vals }) {
  return <><main style={{"position": "relative", "overflow": "hidden", "flex": "999 1 520px", "minWidth": "0", "display": "flex", "alignItems": "center", "justifyContent": "center", "padding": "48px 32px"}}>
<div className={"orb"} aria-hidden={"true"} style={{"width": "380px", "height": "380px", "left": "-80px", "top": "-80px", "background": "#4f7cff"}}></div>

<div className={"orb"} aria-hidden={"true"} style={{"width": "340px", "height": "340px", "right": "-80px", "bottom": "-60px", "background": "#ff9cc4", "animationDelay": "-6s"}}></div>

<div className={"card"} style={{"position": "relative", "zIndex": "1", "width": "100%", "maxWidth": "620px", "border": "1px solid var(--line)", "borderRadius": "24px", "background": "var(--surface)", "boxShadow": "var(--shadow)", "padding": "40px"}}>
<div style={{"fontSize": "13px", "fontWeight": "800", "letterSpacing": ".06em", "textTransform": "uppercase", "color": "var(--accentText)"}}>{"Langkah " + (vals.stepNo) + " dari 3"}</div>



{vals.is1 ? <>
<h2 style={{"margin": "10px 0 0", "fontSize": "26px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Ceritakan tentang organisasi Anda"}</h2>

<p style={{"margin": "8px 0 0", "fontSize": "15px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Organisasi adalah wadah untuk anggota, workspace, dan paket langganan."}</p>

<div style={{"marginTop": "28px", "display": "flex", "flexDirection": "column", "gap": "22px"}}>
<label style={{"fontSize": "14px", "fontWeight": "700"}}>{"Nama organisasi "}
<input type={"text"} placeholder={"mis. Studio Kreatif Nusantara"} style={{"marginTop": "8px", "width": "100%", "padding": "14px 16px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--ink)", "fontSize": "15px", "fontWeight": "500"}} value={vals.form?.organizationName ?? ''} onChange={(event) => vals.updateField?.('organizationName', event.target.value)} maxLength={150} />
</label>

<div >
<div style={{"fontSize": "14px", "fontWeight": "700"}}>{"Ukuran tim"}</div>

<div style={{"marginTop": "10px", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(110px,1fr))", "gap": "10px"}}>
{vals.sizes.map((z, index2) => <React.Fragment key={index2}>
<button className={"opt"} type={"button"} onClick={z.pick} aria-pressed={z.on} style={{"padding": "14px", "borderRadius": "12px", "border": "2px solid " + (z.line), "background": z.bg, "color": z.ink, "fontSize": "14px", "fontWeight": "700"}}>{z.label}</button>
</React.Fragment>)}
</div>
</div>
</div>
</> : null}



{vals.is2 ? <>
<h2 style={{"margin": "10px 0 0", "fontSize": "26px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Buat workspace pertama"}</h2>

<p style={{"margin": "8px 0 0", "fontSize": "15px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Workspace memisahkan pekerjaan, misalnya per tim atau per klien. Konteks klien dipakai agent sebagai bahan kerja."}</p>

<div style={{"marginTop": "28px", "display": "flex", "flexDirection": "column", "gap": "22px"}}>
<label style={{"fontSize": "14px", "fontWeight": "700"}}>{"Nama workspace "}
<input type={"text"} placeholder={"mis. Tim Kreatif"} style={{"marginTop": "8px", "width": "100%", "padding": "14px 16px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--ink)", "fontSize": "15px", "fontWeight": "500"}} value={vals.form?.workspaceName ?? ''} onChange={(event) => vals.updateField?.('workspaceName', event.target.value)} maxLength={150} />
</label>

<label style={{"fontSize": "14px", "fontWeight": "700"}}>{"Klien pertama "}
<span style={{"fontWeight": "600", "color": "var(--mute)"}}>{"(opsional)"}</span>

<input type={"text"} placeholder={"Nama klien"} style={{"marginTop": "8px", "width": "100%", "padding": "14px 16px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--ink)", "fontSize": "15px", "fontWeight": "500"}} value={vals.form?.clientName ?? ''} onChange={(event) => vals.updateField?.('clientName', event.target.value)} maxLength={150} />
</label>

<label style={{"fontSize": "14px", "fontWeight": "700"}}>{"Brief klien "}
<span style={{"fontWeight": "600", "color": "var(--mute)"}}>{"(opsional)"}</span>

<textarea rows={"4"} placeholder={"Brand voice, produk, dan target audiens"} style={{"marginTop": "8px", "width": "100%", "padding": "14px 16px", "borderRadius": "12px", "border": "1px solid var(--line)", "background": "var(--bg)", "color": "var(--ink)", "fontSize": "15px", "fontWeight": "500", "resize": "vertical"}} value={vals.form?.clientBrief ?? ''} onChange={(event) => vals.updateField?.('clientBrief', event.target.value)} maxLength={4000}></textarea>
</label>
</div>
</> : null}



{vals.is3 ? <>
<h2 style={{"margin": "10px 0 0", "fontSize": "26px", "letterSpacing": "-.025em", "fontWeight": "800"}}>{"Periksa kantor Anda"}</h2>

<p style={{"margin": "8px 0 0", "fontSize": "15px", "lineHeight": "1.6", "color": "var(--soft)"}}>{"Organisasi dan workspace berikut akan dibuat untuk akun Anda. Langkah ini tidak mengaktifkan paket berlangganan."}</p>

<div style={{"marginTop": "28px", "display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(170px,1fr))", "gap": "10px"}}>
<dl style={{gridColumn: '1 / -1', display: 'grid', gap: '12px', margin: 0, overflowWrap: 'anywhere'}}>{[['Organisasi', vals.form?.organizationName], ['Workspace', vals.form?.workspaceName], ['Klien pertama', vals.form?.clientName || 'Belum ditambahkan']].map(([label, value]) => <div key={label}><dt style={{fontSize: '13px', color: 'var(--soft)'}}>{label}</dt><dd style={{margin: '4px 0 0', fontWeight: 700}}>{value}</dd></div>)}</dl>
</div>
</> : null}

<div style={{"marginTop": "36px", "display": "flex", "alignItems": "center", "gap": "12px"}}>
{vals.hasBack ? <><button className={"btns"} type={"button"} onClick={vals.back} style={{"padding": "14px 22px", "border": "1px solid var(--line)", "borderRadius": "12px", "background": "var(--surface)", "color": "var(--ink)", "fontSize": "15px", "fontWeight": "700"}}>{"Kembali"}</button></> : null}

{vals.notLast ? <><button className={"btnp"} type={"button"} onClick={vals.next} style={{"marginLeft": "auto", "padding": "14px 28px", "border": "0", "borderRadius": "12px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "15px", "fontWeight": "700"}}>{"Lanjut"}</button></> : null}

{vals.is3 ? <><button className={"btnp"} style={{"marginLeft": "auto", "padding": "14px 28px", "borderRadius": "12px", "background": "var(--accent)", "color": "var(--onAccent)", "fontSize": "15px", "fontWeight": "700"}} type="button" onClick={vals.submitOnboarding} disabled={vals.submitting}>{vals.submitting ? "Menyiapkan kantor…" : "Buka dashboard"}</button></> : null}
</div>

{vals.error ? <p role="alert" style={{color: '#b42318', fontSize: '14px', marginTop: '18px'}}>{vals.error}</p> : null}</div>
</main></>;
}

export function OnboardingLayout({ vals }) { return <div className={vals.rootClass} style={{"position": "relative"}}>
<OnboardingSplash vals={vals} />

<div style={{"minHeight": "900px", "display": "flex", "flexWrap": "wrap", "alignItems": "stretch"}}>


<OnboardingProgressSidebar vals={vals} />



<OnboardingWorkspaceForm vals={vals} />
</div>
</div>; }

export class OnboardingDesign extends React.Component {
  constructor(props) {
    super(props);
    let sys = false;
    try { sys = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { sys = false; }
    const splash = !(props && props.splash === false);
    this.state = { dark: !!(props && props.dark) || sys, step: 1, size: 1, divs: ['proposal', 'social'], sp: splash ? 'on' : 'off', splash };
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
    const stepsDef = [
      ['Organisasi', 'Nama dan ukuran tim'],
      ['Workspace', 'Ruang kerja dan klien pertama'],
      ['Divisi awal', 'Tempat Anda mulai'],
    ];
    const steps = stepsDef.map((d, i) => {
      const n = i + 1; const cur = s.step === n; const done = s.step > n;
      return {
        n, title: d[0], sub: d[1], done, todo: !done,
        bg: cur ? 'var(--accentSoft)' : 'transparent',
        dotBg: done || cur ? 'var(--accent)' : 'transparent',
        dotInk: done || cur ? 'var(--onAccent)' : 'var(--mute)',
        ring: done || cur ? 'var(--accent)' : 'var(--line)',
        ink: cur || done ? 'var(--ink)' : 'var(--mute)',
      };
    });
    const sizes = ['1–5 orang', '6–20 orang', '21–50 orang', '50+ orang'].map((l, i) => {
      const on = s.size === i;
      return { label: l, on, pick: () => set({ size: i }), line: on ? 'var(--accent)' : 'var(--line)', bg: on ? 'var(--accentSoft)' : 'var(--surface)', ink: on ? 'var(--accentText)' : 'var(--ink)' };
    });
    const D = [['proposal', 'Proposal Writer', '#4f7cff'], ['ads', 'Ads Copywriter', '#ff8a3d'], ['social', 'Social Media', '#ff5fa2'], ['qa', 'Web QA', '#2fbf71'], ['dev', 'Developer Helper', '#8a5cf6'], ['reporting', 'Reporting', '#14b8a6'], ['account', 'Account Manager', '#f5b82e'], ['finance', 'Finance', '#64748b']];
    const divs = D.map((d) => {
      const on = s.divs.indexOf(d[0]) >= 0;
      return {
        name: d[1], color: d[2], on, tick: on ? 1 : 0,
        line: on ? 'var(--accent)' : 'var(--line)', bg: on ? 'var(--accentSoft)' : 'var(--surface)',
        pick: () => set({ divs: on ? s.divs.filter((x) => x !== d[0]) : s.divs.concat([d[0]]) }),
      };
    });
    return {
      rootClass: s.dark ? 'vo dark' : 'vo',
      splashOn: s.sp !== 'off', splashClass: s.sp === 'out' ? 'splash out' : 'splash',
      replaySplash: () => this.runSplash(),
      themeIcon: s.dark ? 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4' : 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
      themeLabel: s.dark ? 'Mode terang' : 'Mode gelap',
      toggleTheme: () => set({ dark: !s.dark }),
      steps, sizes, divs, stepNo: s.step,
      is1: s.step === 1, is2: s.step === 2, is3: s.step === 3,
      hasBack: s.step > 1, notLast: s.step < 3,
      back: () => set({ step: Math.max(1, s.step - 1) }),
      next: () => set({ step: Math.min(3, s.step + 1) }),
    };
  }

  render() {
    const vals = this.props.decorate ? this.props.decorate(this.renderVals(), this) : this.renderVals();
    vals.rootClass += ' reference-page reference-onboarding';
    return <OnboardingLayout vals={vals} />;
  }
}
