const RemarkableClass = window.Remarkable || (window.remarkable && window.remarkable.Remarkable);
const md = new RemarkableClass({
  html: true,
  breaks: true
});

function fixImageUrl(url, size = '0x0') {
  if (!url) return '';
  let fixed = url.trim();

  const lastHttp = fixed.lastIndexOf('http');
  if (lastHttp > 0) {
    fixed = fixed.substring(lastHttp);
  }

  if (fixed.includes('images.golos.io/')) {
    fixed = 'https://' + ['images.golos.today', size, fixed].join('/');
  }
  

  return fixed;
}

// Проверка, является ли ссылка внутренним постом Голоса (golos.id, golos.in, golos.today)
function parseInternalGolosLink(href) {
  try {
    const urlObj = new URL(href);
    const host = urlObj.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'golos.id' && host !== 'golos.in' && host !== 'golos.today') {
      return null;
    }
    const parts = urlObj.pathname.split('/').filter(Boolean);
    const authorIndex = parts.findIndex(part => part.startsWith('@'));
    if (authorIndex !== -1 && parts.at(authorIndex + 1)) {
      const author = parts.at(authorIndex).slice(1).toLowerCase();
      return { author, permlink: parts.at(authorIndex + 1) };
    }
  } catch (e) {}
  return null;
}

function renderMarkdownWithMedia(rawText) {
  if (!rawText) return '';
  let text = rawText;
  const iframes = [];

  const saveIframe = (html) => {
    iframes.push(html);
    return '\n\nIFRAMEHOLDER' + (iframes.length - 1) + 'END\n\n';
  };

  // 1. Сохраняем существующие <iframe>
  text = text.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gis, (match) => saveIframe(match));
  text = text.replace(/<iframe\b[^>]*\/?>/gi, (match) => {
    if (match.endsWith('/>')) return match;
    return saveIframe(match + '</iframe>');
  });

  // 2. Разделяем блоки выравнивания
  text = text
    .replace(/(<div\b[^>]*>|<center\b[^>]*>)/gi, '$1\n\n')
    .replace(/(<\/div>|<\/center>)/gi, '\n\n$1');

      // 3. YouTube (обычные, shorts, youtu.be, live)
  text = text.replace(
    /(?:\[[^\]]*\]\()?(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^&\s)]*&)?v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<"')]*)?\)?/gi,
    (match, videoId) => {
      const isShorts = match.includes('/shorts/');
      const w = isShorts ? '315' : '560';
      const h = isShorts ? '560' : '315';
      const embedUrl = 'https://' + ['www.youtube.com', 'embed', videoId].join('/');
      return saveIframe('<div class="video-box" style="text-align:center;margin:15px 0;"><iframe width="' + w + '" height="' + h + '" src="' + embedUrl + '" frameborder="0" allowfullscreen></iframe></div>');
    }
  );

  // 4. Rutube и Rutube Shorts
  text = text.replace(
    /(?:\[[^\]]*\]\()?(?:https?:\/\/)?(?:www\.)?rutube\.ru\/(video|shorts)\/([a-zA-Z0-9_-]+)\/?(?:\?([^\s<"')]*))?\)?/gi,
    (match, type, videoId, query) => {
      const isShorts = type.toLowerCase() === 'shorts';
      const w = isShorts ? '315' : '720';
      const h = isShorts ? '560' : '405';
      const q = query ? '?' + query : '';
      const embedUrl = 'https://' + ['rutube.ru', 'play', 'embed', videoId, q].join('/');
      return saveIframe('<div class="video-box" style="text-align:center;margin:15px 0;"><iframe width="' + w + '" height="' + h + '" src="' + embedUrl + '" frameborder="0" allow="clipboard-write; autoplay" allowfullscreen></iframe></div>');
    }
  );



  // 5. SoundCloud — через простое сложение строк +
  text = text.replace(
    /(?:\[[^\]]*\]\()?(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:[^\s<"')]*)?\)?/gi,
    (match, user, track) => {
      if (match.includes('href=')) return match;
      const cleanUrl = 'https://soundcloud.com' + user + '/' + track;
      const iframeUrl = 'https://soundcloud.com' + encodeURIComponent(cleanUrl) + '&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true';
      return saveIframe('<div style="text-align:center;margin:15px 0;"><iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="' + iframeUrl + '"></iframe></div>');
    }
  );

  // 6. Защищаем оставшиеся HTML-теги и Markdown-ссылки перед поиском голых URL
  const protectedBlocks = [];
  const protect = (str) => {
    protectedBlocks.push(str);
    return 'PROTECTED' + (protectedBlocks.length - 1) + 'END';
  };

  text = text.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*?)?>/g, protect);
  text = text.replace(/!?\[[^\]]*\]\([^)]+\)/g, protect);

  // 7. Оборачиваем обычные голые ссылки и картинки
  text = text.replace(/https?:\/\/[^\s<>"'\]]+/gi, (rawUrl) => {
    let url = rawUrl;
    let trailing = '';
    while (/[.,;:!?)]$/.test(url)) {
      if (url.endsWith(')') && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) break;
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url) || /images\.golos\.id|imgp\.golos\.id|\/ipfs\//i.test(url)) {
      return protect('<img src="' + url + '">') + trailing;
    }
    return protect('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>') + trailing;
  });

  // Возвращаем защищенные блоки
  let prevText;
  do {
    prevText = text;
    text = text.replace(/PROTECTED(\d+)END/g, (_, idx) => protectedBlocks.at(Number(idx)) || '');
  } while (text !== prevText);

  // Рендерим Markdown
  let htmlBody = md.render(text);

  // Возвращаем все iframe
  iframes.forEach((iframeCode, index) => {
    htmlBody = htmlBody.replace('IFRAMEHOLDER' + index + 'END', iframeCode);
  });

  return htmlBody;
}

const iframeObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const iframe = entry.target;
      const lazySrc = iframe.getAttribute('data-src');
      if (lazySrc) {
        iframe.src = lazySrc;
        iframe.removeAttribute('data-src');
      }
      observer.unobserve(iframe);
    }
  });
}, { rootMargin: '300px' });

function processPostDOM(root, callbacks = {}) {
  const { onOpenPost, onOpenProfile } = callbacks;

  // 1. Адаптивные iframe с ленивой загрузкой
  root.querySelectorAll('iframe').forEach(iframe => {
    const src = iframe.getAttribute('src');
    if (src) {
      iframe.setAttribute('data-src', src);
      iframe.removeAttribute('src');
      iframe.setAttribute('loading', 'lazy');
      iframeObserver.observe(iframe);
    }

    if ((src || '').includes('soundcloud.com')) {
      iframe.style.width = '100%';
      return;
    }

    if (iframe.parentElement && iframe.parentElement.classList.contains('videoWrapper')) return;

    const isVertical = Number(iframe.getAttribute('height')) > Number(iframe.getAttribute('width'));
    const wrapper = document.createElement('div');
    wrapper.className = 'videoWrapper';

    if (isVertical) {
      wrapper.style.cssText = 'position:relative; width:315px; max-width:100%; height:560px; margin:15px auto; overflow:hidden; background:#000; border-radius:8px;';
    } else {
      wrapper.style.cssText = 'position:relative; padding-bottom:56.25%; height:0; overflow:hidden; margin:15px 0; background:#000; border-radius:8px;';
    }

    iframe.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; border:0;';
    iframe.parentNode.insertBefore(wrapper, iframe);
    wrapper.appendChild(iframe);
  });

  // 2. Проксируем картинки и настраиваем стили
  root.querySelectorAll('img').forEach(img => {
    const rawSrc = img.getAttribute('src');
    if (rawSrc) {
      img.setAttribute('src', fixImageUrl(rawSrc));
    }
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    if (!img.style.maxWidth) {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.margin = '15px 0';
      img.style.display = 'block';
    }
  });

  // 3. Внутренние ссылки golos.id / golos.in / golos.today открываем внутри окна чтения, остальные — в новой вкладке
  root.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const internal = parseInternalGolosLink(href);
    if (internal && onOpenPost) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenPost(internal.author, internal.permlink);
      });
    } else {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  // 4. Кликабельные @упоминания (открывают модалку профиля автора)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const nodesToReplace = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentNode.tagName === 'SCRIPT' || node.parentNode.tagName === 'STYLE' || node.parentNode.closest('a')) continue;
    if (node.nodeValue.includes('@')) nodesToReplace.push(node);
  }

  nodesToReplace.forEach(textNode => {
    const regex = /(^|[^a-zA-Z0-9./_-])@([a-z0-9.-]{3,16})(?![a-z0-9.-])/gi;
    if (!regex.test(textNode.nodeValue)) return;
    const span = document.createElement('span');
    span.innerHTML = textNode.nodeValue.replace(
      regex,
      '$1<span class="mention-in-text" data-user="$2">@$2</span>'
    );
    span.querySelectorAll('.mention-in-text').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onOpenProfile) onOpenProfile(el.dataset.user.toLowerCase());
      });
    });
    textNode.parentNode.replaceChild(span, textNode);
  });
}
