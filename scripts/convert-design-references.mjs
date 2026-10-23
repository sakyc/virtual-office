// Mechanical, build-time conversion of the owner's exported designs to native JSX.
// No HTML injection, template interpreter, bundled React runtime, or eval is used by the app.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const designs = [
  ['Landing', 'landing', 'Main.dc.html', 'Landing Page-html.zip'],
  ['Onboarding', 'onboarding', 'Onboarding.dc.html', 'Onboarding-html.zip'],
  ['Dashboard', 'dashboard', 'Dashboard.dc.html', 'Dashboard (interaktif)-html.zip'],
];
const voids = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'area', 'wbr']);
const propNames = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', viewbox: 'viewBox', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', 'fill-opacity': 'fillOpacity', 'stroke-opacity': 'strokeOpacity', 'stroke-dasharray': 'strokeDasharray', 'clip-path': 'clipPath', 'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight', 'text-anchor': 'textAnchor', 'stop-color': 'stopColor', 'stop-opacity': 'stopOpacity', 'xlink:href': 'xlinkHref', 'fill-rule': 'fillRule', 'clip-rule': 'clipRule' };

for (const [name, slug, filename, archive] of designs) {
  const source = readFileSync(resolve(root, 'public', `${slug}-reference`, filename), 'utf8').replace(/\r\n/g, '\n');
  const archivePath = process.env.USERPROFILE && resolve(process.env.USERPROFILE, 'Downloads', archive);
  if (archivePath && existsSync(archivePath)) {
    const original = execFileSync('tar', ['-xOf', archivePath, filename], { encoding: 'utf8', maxBuffer: 8e6 }).replace(/\r\n/g, '\n');
    if (source !== original) throw new Error(`${archive} differs from the preserved reference; inspect before converting.`);
  }
  const cssSource = source.match(/<style>([\s\S]*?)<\/style>/)[1];
  const template = source.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1].replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const animationNames = [...cssSource.matchAll(/@keyframes\s+(\w+)/g)].map((match) => match[1]);
  const renameAnimations = (text) => animationNames.reduce((value, animation) => value.replace(new RegExp(`(?<![.#\\w-])${animation}\\b`, 'g'), `${slug}-${animation}`), text);
  const css = renameAnimations(cssSource).replace(/\.vo\b/g, `.reference-${slug}`).replace(/(^|\n)body\{margin:0\}/g, '').replace(/(^|\n)\.scn/g, `$1.reference-${slug} .scn`);
  const tree = { children: [] }; const stack = [tree];
  for (const match of template.matchAll(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g)) {
    const token = match[0]; const parent = stack.at(-1);
    if (token.startsWith('<!--')) { parent.children.push({ comment: token.slice(4,-3).trim() }); continue; }
    if (token.startsWith('</')) { const closing = token.match(/^<\/([^\s>]+)/)[1]; if (stack.at(-1).tag !== closing) throw new Error(`Unbalanced ${closing}`); stack.pop(); continue; }
    if (!token.startsWith('<')) { parent.children.push({ text: token }); continue; }
    const tag = token.match(/^<([^\s/>]+)/)[1]; const attrs = {};
    for (const attr of token.slice(tag.length + 1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) attrs[attr[1]] = attr[2] ?? attr[3] ?? '';
    const node = { tag, attrs, children: [] }; parent.children.push(node);
    if (!voids.has(tag) && !token.endsWith('/>')) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('Unbalanced source template');
  const functions = []; let listCount = 0;
  const resolveExpr = (expr, locals) => /^(true|false|null|undefined|\d+)$/.test(expr.trim()) ? expr.trim() : locals.has(expr.trim().split('.')[0]) ? expr.trim() : `vals.${expr.trim()}`;
  const interpolate = (value, locals) => {
    const full = value.match(/^\{\{([^{}]*?)\}\}$/);
    if (full) return resolveExpr(full[1], locals);
    const parts = value.split(/(\{\{[\s\S]*?\}\})/g).filter(Boolean);
    return parts.map((part) => part.startsWith('{{') ? `(${resolveExpr(part.slice(2,-2), locals)})` : JSON.stringify(part.replaceAll('&amp;', '&').replaceAll('&quot;', '"'))).join(' + ') || '""';
  };
  const compile = (node, locals = new Set(), extract = true) => {
    if ('comment' in node) return '';
    if ('text' in node) {
      if (!node.text.trim()) return '';
      if (name === 'Dashboard') {
        const labels = { 'Workspace Contoh': 'workspaceName', 'Organisasi Contoh': 'organizationName', 'Nama Pengguna': 'userName', 'Selamat siang, Nama': 'greeting' };
        if (labels[node.text.trim()]) return `{vals.${labels[node.text.trim()]} ?? ${JSON.stringify(node.text.trim())}}`;
      }
      return `{${interpolate(node.text.replace(/\s+/g, ' '), locals)}}`;
    }
    if (extract && node.component) return `<${node.component} vals={vals} />`;
    const children = () => node.children.map((child) => compile(child, locals)).join('\n');
    if (node.tag === 'sc-if') return `{${resolveExpr(node.attrs.value.slice(2,-2), locals)} ? <>${children()}</> : null}`;
    if (node.tag === 'sc-for') {
      const alias = node.attrs.as; const index = `index${++listCount}`; const inner = new Set([...locals, alias]);
      return `{${resolveExpr(node.attrs.list.slice(2,-2), locals)}.map((${alias}, ${index}) => <React.Fragment key={${index}}>${node.children.map((child) => compile(child, inner)).join('\n')}</React.Fragment>)}`;
    }
    const attrs = Object.entries(node.attrs).map(([attr, value]) => {
      let prop = propNames[attr] || attr;
      if (attr === 'style') {
        const pairs = value.split(';').filter((part) => part.includes(':')).map((part) => {
          const colon = part.indexOf(':'); const property = part.slice(0,colon).trim().replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          return `${JSON.stringify(property)}: ${interpolate(renameAnimations(part.slice(colon+1).trim()), locals)}`;
        });
        return `style={{${pairs.join(', ')}}}`;
      }
      if (attr === 'href') {
        const routes = { 'Main.dc.html': '/', 'Dashboard.dc.html': '/app', 'Onboarding.dc.html': '/onboarding' };
        value = routes[value] || value;
        if (name === 'Landing' && value === '/app' && node.children.some((child) => child.text?.trim() === 'Masuk')) value = '/login';
        if (name === 'Landing' && value === '/onboarding') value = '/register';
      }
      if (attr === 'disabled' && value === '') return 'disabled';
      return `${prop}={${interpolate(value, locals)}}`;
    });
    if (name === 'Dashboard' && node.attrs['aria-label'] === 'Keluar') attrs.push('onClick={vals.logout}');
    if (name === 'Onboarding') {
      const fields = { 'mis. Studio Kreatif Nusantara': 'organizationName', 'mis. Tim Kreatif': 'workspaceName', 'Nama klien': 'clientName', 'Brand voice, produk, dan target audiens': 'clientBrief' };
      const field = fields[node.attrs.placeholder];
      if (field) attrs.push(`value={vals.form?.${field} ?? ''}`, `onChange={(event) => vals.updateField?.('${field}', event.target.value)}`);
      if (node.tag === 'a' && node.attrs.href === 'Dashboard.dc.html') attrs.push('onClick={vals.submitOnboarding}', 'aria-disabled={vals.submitting}');
    }
    let contents = children();
    if (name === 'Onboarding' && node.attrs.class === 'card') contents += `\n{vals.error ? <p role="alert" style={{color: '#b42318', fontSize: '14px', marginTop: '18px'}}>{vals.error}</p> : null}`;
    return `<${node.tag} ${attrs.join(' ')}${voids.has(node.tag) ? ' />' : `>${contents}</${node.tag}>`}`;
  };
  const rootNode = tree.children.find((node) => node.tag);
  // Named sections are real React components. Loops and conditional views remain JSX.
  const componentNames = name === 'Landing'
    ? ['Splash','Navigation','Hero','AgentMarquee','Statistics','Features','HowItWorks','Divisions','Pricing','Security','Documentation','Faq','FinalCallToAction','Footer']
    : name === 'Onboarding' ? ['Splash','ProgressSidebar','WorkspaceForm'] : ['Splash','Sidebar','Topbar','Overview','OfficePreview','Agents','Board','Usage','Members','ApiKeys','Organizations','Plans','ComingSoon'];
  const targets = [];
  if (name === 'Landing') {
    for (const node of rootNode.children.filter((n) => n.tag)) { if (node.tag === 'main') targets.push(...node.children.filter((n) => n.tag)); else targets.push(node); }
  } else {
    const splash = rootNode.children.find((n) => n.tag === 'sc-if'); targets.push(splash);
    const layout = rootNode.children.find((n) => n.tag === 'div');
    targets.push(layout.children.find((n) => n.tag === 'aside'));
    const content = layout.children.find((n) => n.tag === (name === 'Onboarding' ? 'main' : 'div'));
    if (name === 'Onboarding') targets.push(content);
    else { targets.push(content.children.find((n) => n.tag === 'header')); targets.push(...content.children.find((n) => n.tag === 'main').children.filter((n) => n.tag)); }
  }
  if (targets.length !== componentNames.length) throw new Error(`${name}: ${targets.length} sections vs ${componentNames.length} component names`);
  targets.forEach((node,index) => { node.component = `${name}${componentNames[index]}`; });
  for (const node of targets) functions.push(`export function ${node.component}({ vals }) {\n  return <>${compile(node, new Set(), false)}</>;\n}`);
  let logic = source.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1].trim().replace('class Component extends DCLogic', `export class ${name}Design extends React.Component`);
  logic = logic.slice(0, logic.lastIndexOf('}')) + `\n  render() {\n    const vals = this.props.decorate ? this.props.decorate(this.renderVals(), this) : this.renderVals();\n    vals.rootClass += ' reference-page reference-${slug}';\n    return <${name}Layout vals={vals} />;\n  }\n}\n`;
  const directory = resolve(root, 'src/react/reference'); mkdirSync(directory, { recursive: true });
  let jsx = `// Converted from ${archive}/${filename}; original SVG paths, layout and motion preserved.\nimport React from 'react';\nimport './${slug}.css';\n\n${functions.join('\n\n')}\n\nexport function ${name}Layout({ vals }) { return ${compile(rootNode)}; }\n\n${logic}\n`;
  if (name === 'Dashboard') {
    // Extension points for live data. The default reference preview remains visually unchanged.
    const replace = (before, after) => {
      if (!jsx.includes(before)) throw new Error(`Dashboard extension point missing: ${before.slice(0, 60)}`);
      jsx = jsx.replace(before, after);
    };
    replace('{"Data contoh"}</span>', '{vals.live ? "Workspace aktif" : "Data contoh"}</span>');
    replace('</div>\n</header>', '{vals.profileMenu}\n</div>\n</header>');
    const rolesStart = jsx.indexOf('<div role={"group"} aria-label={"Lihat sebagai"}');
    const rolesEnd = jsx.indexOf('</div>', rolesStart);
    if (rolesStart < 0 || rolesEnd < 0) throw new Error('Dashboard role preview extension point missing');
    jsx = jsx.slice(0, rolesStart) + '{!vals.live && ' + jsx.slice(rolesStart, rolesEnd + 6) + '}' + jsx.slice(rolesEnd + 6);
    const detailLabel = jsx.indexOf('aria-label={"Detail item"}');
    const detailStart = jsx.lastIndexOf('<aside', detailLabel);
    const detailEnd = jsx.indexOf('</aside>', detailLabel);
    if (detailStart < 0 || detailEnd < 0) throw new Error('Dashboard detail extension point missing');
    jsx = jsx.slice(0, detailStart) + '{vals.detailPanel ?? ' + jsx.slice(detailStart, detailEnd + 8) + '}' + jsx.slice(detailEnd + 8);
    replace('<DashboardOverview vals={vals} />', '{vals.content !== undefined ? vals.content : <><DashboardOverview vals={vals} />');
    replace('<DashboardComingSoon vals={vals} />', '<DashboardComingSoon vals={vals} /></>}');
  }
  writeFileSync(resolve(directory, `${slug}.jsx`), jsx.trimEnd() + '\n');
  writeFileSync(resolve(directory, `${slug}.css`), `/* Original ${filename} styles, scoped to this React page. */\n${css}\n`.trimEnd() + '\n');
  console.log(`${name}: ${targets.length} React sections, ${[...source.matchAll(/<svg\b/g)].length} original SVGs preserved.`);
}
