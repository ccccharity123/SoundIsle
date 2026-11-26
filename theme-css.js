import { generate, ident, lexer, parse, tokenize, tokenTypes, walk } from './css-tree.js';

export const THEME_LIMIT = 1_000_000; // String.length, measured in UTF-16 code units.
export const PLAYER_SCOPE = '#capricorn-hub, [data-sound-isle-player]';
export const NOTE_SCOPE = '#shiyi-dock.cap-memory-side';

const pluginDirectory = new URL('./', import.meta.url);
const svgNamespace = 'http://www.w3.org/2000/svg';
const svgTags = new Set('svg g path rect circle ellipse line polyline polygon title desc'.split(' '));
const svgAttributes = new Set((
  'viewBox preserveAspectRatio width height x y x1 x2 y1 y2 cx cy r rx ry d points transform ' +
  'fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin ' +
  'stroke-miterlimit stroke-dasharray stroke-dashoffset opacity clip-rule vector-effect'
).split(' '));
const resourceFunctions = new Set(['url', 'src', 'image', 'image-set', '-webkit-image-set']);
const imageCandidateFunctions = new Set([
  ...resourceFunctions, 'type', 'calc', 'linear-gradient', 'radial-gradient', 'conic-gradient',
  'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient',
  'cross-fade', '-webkit-cross-fade', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'
]);
const legacyPseudoElements = new Set(['before', 'after', 'first-line', 'first-letter']);
const groupingRules = new Set(['media', 'supports', 'container']);
const keyframeRules = new Set(['keyframes', '-webkit-keyframes']);
const rasterMime = /^image\/(?:png|apng|gif|jpe?g|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i;

function issue(kind, location, subject, value, remedy, lineOffset = 0) {
  const line = Math.max(1, (location?.start?.line ?? location?.line ?? 1) - lineOffset);
  const detail = String(value).trim().slice(0, 120);
  return Error(`${kind} · 第 ${line} 行${subject ? ' · ' + subject : ''}：${detail}。${remedy}`);
}

function capacityError() {
  return Error('CSS 容量超限：最多 100 万 UTF-16 代码单元，换行按一个单元计算。请缩短 CSS 或将大图片改为外链。');
}

const normalizeCss = css => css.replace(/^\uFEFF/, '').replace(/\r\n?|\f/g, '\n');

export async function readThemeCss(input) {
  // At most three UTF-8 bytes per UTF-16 code unit, plus the optional UTF-8 BOM.
  const byteLimit = THEME_LIMIT * 3 + 3;
  if (input.size > byteLimit) throw capacityError();
  if (!input.body) return input.text();
  const reader = input.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let css = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return css + decoder.decode();
      bytes += value.byteLength;
      if (bytes > byteLimit) throw capacityError();
      css += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function verifySvg(xml, W) {
  const doc = new W.DOMParser().parseFromString(xml, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== svgNamespace ||
      [...doc.childNodes].some(node => ![1, 3, 8].includes(node.nodeType))) {
    throw Error('SVG XML 无效，或包含文档类型、处理指令');
  }
  const walker = doc.createTreeWalker(root, W.NodeFilter.SHOW_ALL);
  for (let node = root; node; node = walker.nextNode()) {
    if ([3, 4, 8].includes(node.nodeType)) continue;
    if (node.nodeType !== 1 || node.namespaceURI !== svgNamespace || !svgTags.has(node.localName)) {
      throw Error(`SVG 元素 «${node.nodeName}» 不在静态图形允许列表中`);
    }
    for (const attr of node.attributes) {
      if (attr.name === 'xmlns' && attr.value === svgNamespace) continue;
      if (attr.namespaceURI || !svgAttributes.has(attr.name)) {
        throw Error(`SVG 属性 «${attr.name}» 不在静态图形允许列表中`);
      }
      if (['fill', 'stroke'].includes(attr.name) &&
          !/^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?)\([\d.,%+\-/\s]+\))$/i.test(attr.value.trim())) {
        throw Error(`SVG 属性 «${attr.name}» 仅允许静态颜色`);
      }
    }
  }
}

function verifyUrl(value, W) {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) throw Error('图片地址为空或包含控制字符');
  if (/^[“‘](?:https?:|data:)|^[“‘].*[”’]$/i.test(value)) throw Error('url() 使用了智能引号，请改用半角引号');
  if (/^data:/i.test(value)) {
    const [header] = value.split(',', 1);
    const match = /^data:([\w.+/-]+)(?:;charset=utf-8)?(;base64)?$/i.exec(header);
    if (!match || value.length <= header.length + 1) throw Error('data: 资源需要图片 MIME 类型和有效内容');
    const payload = value.slice(header.length + 1);
    const svg = match[1].toLowerCase() === 'image/svg+xml';
    if (!svg && !rasterMime.test(match[1])) throw Error(`不支持 data: 图片类型 «${match[1]}»`);
    if (match[2]) {
      const binary = W.atob(decodeURIComponent(payload));
      if (svg) verifySvg(new W.TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))), W);
    } else if (svg) {
      const xml = decodeURIComponent(payload);
      verifySvg(xml, W);
      value = `data:image/svg+xml,${encodeURIComponent(xml)}`;
    } else if (/%(?![0-9a-f]{2})/i.test(payload)) {
      throw Error('data: 图片包含不完整的百分号编码');
    }
    return { value, probe: value };
  }

  // Relative assets are resolved next to the extension, never against the host page.
  const relative = !/^[a-z][a-z\d+.-]*:|^[\\/]/i.test(value);
  const address = new URL(value, pluginDirectory);
  if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password ||
      (relative && (address.origin !== pluginDirectory.origin ||
        !address.pathname.startsWith(pluginDirectory.pathname) || /%2f|%5c/i.test(address.pathname))) ||
      (!relative && !/^https?:\/\//i.test(value))) {
    throw Error('资源仅允许无凭据的 HTTP/HTTPS 图片、插件目录内的相对路径或安全的 data: 图片');
  }
  return { value: address.href, probe: address.href };
}

function checkTokens(source, fail) {
  const ends = new Map([
    [tokenTypes.Function, tokenTypes.RightParenthesis],
    [tokenTypes.LeftParenthesis, tokenTypes.RightParenthesis],
    [tokenTypes.LeftSquareBracket, tokenTypes.RightSquareBracket],
    [tokenTypes.LeftCurlyBracket, tokenTypes.RightCurlyBracket]
  ]);
  const closing = new Set(ends.values());
  const stack = [];
  tokenize(source, (type, start, end) => {
    if (ends.has(type)) stack.push([ends.get(type), start]);
    if (closing.has(type) && stack.pop()?.[0] !== type) fail(start, '括号不匹配');
    if (type === tokenTypes.BadString || type === tokenTypes.BadUrl) fail(start, '字符串或 url() 无效');
    if (type === tokenTypes.Comment && !source.slice(start + 2, end).endsWith('*/')) fail(start, '注释未闭合');
    if (type === tokenTypes.Url && source[end - 1] !== ')') fail(start, 'url() 未闭合');
  });
  if (stack.length) fail(stack.at(-1)[1], '括号未闭合');
}

function familyName(nodes) {
  if (nodes.length === 1 && nodes[0].type === 'String') return nodes[0].value.toLowerCase();
  if (nodes.length && nodes.every(node => node.type === 'Identifier')) {
    return nodes.map(node => ident.decode(node.name)).join(' ').toLowerCase();
  }
  return '';
}

function replaceFontFamilies(value, fontFamilies, shorthand) {
  const match = shorthand ? lexer.matchProperty('font', value) : null;
  if (shorthand && !match?.matched) return;
  let family = [];
  function replace() {
    const alias = fontFamilies.get(familyName(family.map(item => item.data)));
    if (alias) {
      const [first, ...rest] = family;
      first.data = { type: 'String', value: alias };
      rest.forEach(item => value.children.remove(item));
    }
    family = [];
  }
  value.children.forEach((node, item) => {
    if (node.type === 'Operator' && node.value === ',') replace();
    else if (!shorthand || match.isProperty(node, 'font-family')) family.push(item);
  });
  replace();
}

export function compileThemeCss(css, { W, scope, namespace, declarationsFor }) {
  if (typeof css !== 'string') throw Error('CSS 语法错误：主题必须是文本。请导入 UTF-8 CSS 或粘贴纯文本。');
  const input = normalizeCss(css);
  if (input.length > THEME_LIMIT) throw capacityError();
  if (!input.trim()) return { render: () => '', images: new Map() };
  const lineOffset = declarationsFor ? 1 : 0;
  const source = declarationsFor ? `${declarationsFor}{\n${input}\n}` : input;
  const syntax = (location, subject, detail) => issue(
    'CSS 语法错误', location, subject, detail, '请检查括号、分号和引号，从 Word 复制时请使用半角引号。', lineOffset
  );
  const secure = (node, subject, detail, remedy) => issue('CSS 安全限制', node.loc, subject, detail, remedy, lineOffset);
  checkTokens(source, (offset, detail) => {
    const line = source.slice(0, offset).split('\n').length;
    throw syntax({ line }, '', `${detail} «${source.slice(offset, offset + 48).split('\n')[0]}»`);
  });
  let ast;
  try {
    ast = parse(source, {
      positions: true,
      parseCustomProperty: true,
      onParseError(error) { throw error; }
    });
  } catch (error) {
    throw syntax(error, '', `${error.message} «${source.slice(error.offset, error.offset + 48).split('\n')[0]}»`);
  }

  const keyframes = new Map();
  const fontFamilies = new Map();
  const fontDescriptors = new Set();
  const images = new Map();
  const imageDeclarations = new Map();
  const allowedRoots = scope.split(',').map(selector => selector.trim());
  const guard = parse(`:where(${allowedRoots.flatMap(selector => [selector, `${selector} *`]).join(',')})`, { context: 'selector' }).children.first;

  function checkRules(block, insideKeyframes = false) {
    block.children.forEach(node => {
      if (node.type === 'Atrule' && !declarationsFor && !insideKeyframes) {
        const name = ident.decode(node.name).toLowerCase();
        if (groupingRules.has(name) && node.prelude && node.block) {
          checkRules(node.block);
          return;
        }
        if (name === 'font-face' && !node.prelude && node.block) {
          const descriptors = node.block.children.toArray();
          const families = descriptors.filter(item =>
            item.type === 'Declaration' && ident.decode(item.property).toLowerCase() === 'font-family'
          );
          const family = families.length === 1 && familyName(families[0].value.children?.toArray() || []);
          if (!family || descriptors.some(item => item.type !== 'Declaration' || item.important)) {
            throw syntax(node.loc, '@font-face', '请提供一个字体名称及有效的字体描述符');
          }
          if (!fontFamilies.has(family)) fontFamilies.set(family, `sound-isle-${namespace}-font-${fontFamilies.size}`);
          descriptors.forEach(item => fontDescriptors.add(item));
          const value = families[0].value.children;
          value.clear();
          value.appendData({ type: 'String', value: fontFamilies.get(family) });
          return;
        }
        if (keyframeRules.has(name) && node.block && node.prelude?.children.size === 1) {
          const label = node.prelude.children.first;
          const original = label.type === 'String' ? label.value : ident.decode(label.name || '');
          if (original && (label.type === 'String' || !/^(?:none|initial|inherit|unset|revert(?:-layer)?|default)$/i.test(original))) {
            if (!keyframes.has(original)) keyframes.set(original, `sound-isle-${namespace}-${keyframes.size}`);
            if (label.type === 'String') label.value = keyframes.get(original);
            else label.name = keyframes.get(original);
            checkRules(node.block, true);
            return;
          }
        }
        throw secure(node, `@${name}`, '规则无效或无法安全限定作用域', '请使用普通选择器、@media、@supports、@container、@keyframes 或 @font-face。');
      }
      if (node.type !== 'Rule') throw syntax(node.loc, '', '此处需要完整的 CSS 规则');
      const selector = generate(node.prelude);
      if (insideKeyframes && !/^(?:from|to|[+-]?(?:\d*\.)?\d+%)\s*(?:,\s*(?:from|to|[+-]?(?:\d*\.)?\d+%)\s*)*$/i.test(selector)) {
        throw syntax(node.loc, selector, '无效的动画帧选择器');
      }
      if (!insideKeyframes) {
        node.prelude.children.forEach(part => {
          // Place the guard on the subject compound, ahead of its pseudo-element.
          let pseudo = null;
          part.children.forEach((child, item) => {
            if (child.type === 'NestingSelector') throw syntax(child.loc, selector, '请将嵌套选择器展开为完整选择器');
            if (child.type === 'Combinator') pseudo = null;
            if (!pseudo && (child.type === 'PseudoElementSelector' ||
                (child.type === 'PseudoClassSelector' && legacyPseudoElements.has(ident.decode(child.name).toLowerCase())))) {
              pseudo = item;
            }
          });
          part.children.insertData(guard, pseudo);
        });
      }
      node.block.children.forEach(declaration => {
        if (declaration.type !== 'Declaration') {
          throw syntax(declaration.loc, selector, '此处只接受属性声明。请将嵌套规则移到外层');
        }
      });
    });
  }

  if (declarationsFor && ast.children.size !== 1) {
    throw syntax(null, declarationsFor, '此输入框只接受属性声明');
  }
  checkRules(ast);

  // Check each declaration after parsing, including values stored in custom properties.
  walk(ast, {
    visit: 'Declaration',
    enter(declaration) {
      const property = ident.decode(declaration.property).toLowerCase();
      if (['behavior', '-ms-behavior', '-moz-binding'].includes(property)) {
        throw secure(declaration, property, '此属性可能执行代码', '请移除此属性。');
      }

      const urls = new Set();
      function checkResource(node) {
        try {
          const resource = verifyUrl(node.value, W);
          node.value = resource.value;
          if (resource.probe && !fontDescriptors.has(declaration)) {
            urls.add(resource.probe);
            if (!images.has(resource.probe)) images.set(resource.probe, {
              line: Math.max(1, node.loc.start.line - lineOffset),
              property
            });
          }
        } catch (error) {
          throw secure(node, property, `${error.message} «${node.value.slice(0, 90)}»`, '请更换图片地址，或使用仅含静态图形的 SVG。');
        }
      }
      walk(declaration.value, {
        enter(node) {
          if (node.type === 'Url') checkResource(node);
          if (node.type !== 'Function') return;
          const name = ident.decode(node.name).toLowerCase();
          if (['expression', 'element', '-moz-element', 'paint'].includes(name)) {
            throw secure(node, property, `不支持 ${name}()`, '请使用普通的 CSS 图形或静态图片。');
          }
          if (!resourceFunctions.has(name)) return;
          if (name === 'url' || name === 'src') {
            // Escaped function names may be tokenized as generic functions.
            const argument = node.children.first;
            if (node.children.size !== 1 || argument.type !== 'String') {
              throw secure(node, property, `${name}() 需要明确的字符串地址`, '请写成 url("图片地址")。');
            }
          }
          node.children.forEach(child => {
            if (child.type === 'String') checkResource(child);
            if (child.type === 'Function' && !imageCandidateFunctions.has(ident.decode(child.name).toLowerCase())) {
              throw secure(child, property, `不支持在 ${name}() 内动态拼装资源地址`, '可将完整的 url("图片地址") 存入自定义变量。');
            }
          });
        }
      });
      if (urls.size) imageDeclarations.set(declaration, urls);
    }
  });

  walk(ast, node => {
    if (node.type === 'Raw') throw syntax(node.loc, '', `无法解析 «${node.value}»`);
  });

  if (fontFamilies.size) {
    walk(ast, {
      visit: 'Declaration',
      enter(declaration) {
        if (fontDescriptors.has(declaration)) return;
        const property = ident.decode(declaration.property).toLowerCase();
        if (property === 'font' || property === 'font-family') {
          replaceFontFamilies(declaration.value, fontFamilies, property === 'font');
        }
      }
    });
  }

  if (keyframes.size) {
    walk(ast, {
      visit: 'Declaration',
      enter(declaration) {
        const property = ident.decode(declaration.property).toLowerCase();
        if (!/^(?:-webkit-)?animation(?:-name)?$/.test(property) && !property.startsWith('--')) return;
        const shorthand = /^(?:-webkit-)?animation$/.test(property);
        const match = shorthand ? lexer.matchProperty('animation', declaration.value) : null;
        walk(declaration.value, {
          enter(node) {
            if (node.type === 'Function' && ident.decode(node.name).toLowerCase() !== 'var') return this.skip;
            if (this.function?.children.first === node && this.function !== node) return;
            const name = node.type === 'Identifier' ? ident.decode(node.name) : node.type === 'String' ? node.value : '';
            if (!keyframes.has(name)) return;
            if (match?.matched && !match.isType(node, 'keyframes-name')) return;
            if (node.type === 'Identifier') node.name = keyframes.get(name);
            else node.value = keyframes.get(name);
          }
        });
      }
    });
  }

  const compiled = generate(ast);
  return {
    images,
    render(failedImages) {
      if (!failedImages?.size || !images.size) return compiled;
      const removed = [];
      walk(ast, {
        visit: 'Declaration',
        enter(node, item, list) {
          const urls = imageDeclarations.get(node);
          if (!urls || ![...urls].some(url => failedImages.has(url))) return;
          const next = item.next;
          removed.push({ item: list.remove(item), list, next });
        }
      });
      try {
        return removed.length ? generate(ast) : compiled;
      } finally {
        for (const { item, list, next } of removed.reverse()) list.insert(item, next);
      }
    }
  };
}
