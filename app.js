golos.config.set('websocket', 'wss://ruapi.golos.today/ws');

let sessionAuth = {
  username: null,
  postingKey: null
};
//-----

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
}
//-----
const categories = [
  { value: 'ru--golos', label: 'Голос' },
  { value: 'ru--avto', label: 'Авто' },
  { value: 'ru--biznes', label: 'Бизнес' },
  { value: 'ru--blokcheijn', label: 'Блокчейн' },
  { value: 'ru--budushchee', label: 'Будущее' },
  { value: 'ru--dom', label: 'Дом' },
  { value: 'ru--eda', label: 'Еда' },
  { value: 'ru--zhivotnyie', label: 'Животные' },
  { value: 'ru--zhiznx', label: 'Жизнь' },
  { value: 'ru--zdorovxe', label: 'Здоровье' },
  { value: 'ru--igry', label: 'Игры' },
  { value: 'ru--iskusstvo', label: 'Искусство' },
  { value: 'ru--istoriya', label: 'История' },
  { value: 'ru--kino', label: 'Кино' },
  { value: 'ru--konkursy', label: 'Конкурсы' },
  { value: 'ru--kriptovalyuty', label: 'Криптовалюты' },
  { value: 'ru--kulxtura', label: 'Культура' },
  { value: 'ru--literatura', label: 'Литература' },
  { value: 'ru--mediczina', label: 'Медицина' },
  { value: 'ru--muzyka', label: 'Музыка' },
  { value: 'ru--nauka', label: 'Наука' },
  { value: 'ru--nepoznannoe', label: 'Непознанное' },
  { value: 'ru--obrazovanie', label: 'Образование' },
  { value: 'ru--politika', label: 'Политика' },
  { value: 'ru--pravo', label: 'Право' },
  { value: 'ru--priroda', label: 'Природа' },
  { value: 'ru--psikhologiya', label: 'Психология' },
  { value: 'ru--puteshestviya', label: 'Путешествия' },
  { value: 'ru--religiya', label: 'Религия' },
  { value: 'ru--sport', label: 'Спорт' },
  { value: 'ru--tvorchestvo', label: 'Творчество' },
  { value: 'ru--tekhnologii', label: 'Технологии' },
  { value: 'ru--treijding', label: 'Трейдинг' },
  { value: 'ru--filosofiya', label: 'Философия' },
  { value: 'ru--fotografiya', label: 'Фотография' },
  { value: 'ru--yekonomika', label: 'Экономика' },
  { value: 'ru--yumor', label: 'Юмор' },
  { value: 'ru--prochee', label: 'Прочее' },
  { value: 'en', label: 'English' }
];

// Заполняем селект категорий при загрузке страницы
function initCategorySelect() {
  const select = document.getElementById('post-category');
  if (!select) return;
  select.innerHTML = ''; // Очищаем на всякий случай
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.value;
    opt.textContent = cat.label;
    select.appendChild(opt);
  });
}

// Вызываем после загрузки DOM
document.addEventListener('DOMContentLoaded', initCategorySelect);


let currentFeed = 'created'; // 'created' | 'feed' | 'blog' | 'comments'
let commentSubMode = 'to_me'; // 'to_me' | 'my' | 'his'
let targetCommentUser = '';
let filterHisToMe = true; // По умолчанию показываем только его ответы мне

let startAuthor = null;
let startPermlink = null;
let commentHistoryFrom = -1;
let isLoading = false;
let hasMore = true;
const LIMIT = 12;

let savedScrollY = 0;
const postCache = new Map();
const seenKeys = new Set();

const feedContainer = document.getElementById('feed-container');
const loader = document.getElementById('loader');
const guestPanel = document.getElementById('guest-panel');
const userPanel = document.getElementById('user-panel');
const headerUsername = document.getElementById('header-username');
const votingPowerText = document.getElementById('voting-power-text');
const commentsFilterBar = document.getElementById('comments-filter-bar');
const scrollTopBtn = document.getElementById('scroll-top-btn');
const toastEl = document.getElementById('toast');

let currentPostAuthor = null;
let currentPostPermlink = null;
let currentPostTitle = null;

function closeAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(modal => {
    modal.querySelectorAll('iframe').forEach(iframe => { iframe.src = 'about:blank'; });
    modal.classList.remove('open');
  });
  document.body.style.overflow = '';
}

let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

function calculateVotingPower(account) {
  if (!account || typeof account.voting_power !== 'number') return '100%';
  const lastVoteTime = new Date(account.last_vote_time + 'Z').getTime();
  const elapsedSeconds = Math.max(0, (Date.now() - lastVoteTime) / 1000);
  const regenerated = (elapsedSeconds * 10000) / 432000;
  const currentPower = Math.min(10000, account.voting_power + regenerated);
  return (currentPower / 100).toFixed(1) + '%';
}

async function refreshAccountStatus() {
  if (!sessionAuth.username) return;
  try {
    const [acc] = await golos.api.getAccountsAsync([sessionAuth.username]);
    if (acc) {
      votingPowerText.textContent = calculateVotingPower(acc);
      const tipEl = document.getElementById('user-tip-balance');
      if (tipEl && acc.tip_balance) {
        tipEl.textContent = acc.tip_balance;
      }
    }
  } catch (err) {
    console.warn('Не удалось обновить статус аккаунта:', err);
  }
}

function applyAuthUI() {
  const isLoggedIn = Boolean(sessionAuth.username && sessionAuth.postingKey);
  document.querySelectorAll('.auth-only').forEach(el => {
    el.classList.toggle('hidden', !isLoggedIn);
  });

  if (isLoggedIn) {
    guestPanel.classList.add('hidden');
    userPanel.classList.remove('hidden');
    headerUsername.textContent = '@' + sessionAuth.username;
    refreshAccountStatus();
  } else {
    guestPanel.classList.remove('hidden');
    userPanel.classList.add('hidden');
    if (currentFeed !== 'created') {
      switchFeed('created');
    }
  }
}

function restoreSession() {
  const savedUser = localStorage.getItem('golos_mini_user');
  const savedKey = localStorage.getItem('golos_mini_key');
  if (savedUser && savedKey) {
    sessionAuth.username = savedUser;
    sessionAuth.postingKey = savedKey;
  }
  applyAuthUI();
}



document.getElementById('submit-auth-btn').addEventListener('click', async () => {
  const rawUser = document.getElementById('login-username').value.trim().toLowerCase().replace(/^@/, '');
  const wif = document.getElementById('login-posting-key').value.trim();
  const remember = document.getElementById('login-remember').checked;
  const errorBox = document.getElementById('auth-error');

  errorBox.textContent = '';

  if (!rawUser || !wif) {
    errorBox.textContent = 'Введите логин и приватный постинг-ключ.';
    return;
  }

  try {
    const publicWif = golos.auth.wifToPublic(wif);
    const accounts = await golos.api.getAccountsAsync([rawUser]);
    if (!accounts || accounts.length === 0) {
      errorBox.textContent = 'Пользователь @' + rawUser + ' не найден в блокчейне.';
      return;
    }

        // Проверяем, что ключ принадлежит аккаунту (любой из: posting, active, owner)
    const postingAuths = accounts.at(0).posting.key_auths.map(item => item.at(0));
    const activeAuths = accounts.at(0).active.key_auths.map(item => item.at(0));
    const ownerAuths = accounts.at(0).owner.key_auths.map(item => item.at(0));

    if (!postingAuths.includes(publicWif) && !activeAuths.includes(publicWif) && !ownerAuths.includes(publicWif)) {
      errorBox.textContent = 'Этот ключ не принадлежит аккаунту @' + rawUser + '.';
      return;
    }

    // Если ключ не posting, но подходит — предупреждаем (но не блокируем)
    if (!postingAuths.includes(publicWif)) {
      const proceed = confirm(
        'Вы ввели не Posting-ключ. Этот ключ дает больше прав (возможно, Active или Owner).\n\n' +
        'Мы рекомендуем использовать Posting-ключ для безопасности.\n\n' +
        'Продолжить с этим ключом?'
      );
      if (!proceed) return;
    }

    sessionAuth.username = rawUser;
    sessionAuth.postingKey = wif;

    if (remember) {
      localStorage.setItem('golos_mini_user', rawUser);
      localStorage.setItem('golos_mini_key', wif);
    } else {
      localStorage.removeItem('golos_mini_user');
      localStorage.removeItem('golos_mini_key');
    }

    document.getElementById('auth-modal').classList.remove('open');
    document.getElementById('login-posting-key').value = '';
    applyAuthUI();
    showToast('Добро пожаловать, @' + rawUser + '!');
  } catch (err) {
    console.error('Ошибка авторизации:', err);
    errorBox.textContent = 'Ошибка проверки ключа. Убедитесь, что введен приватный Posting Key.';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  sessionAuth.username = null;
  sessionAuth.postingKey = null;
  localStorage.removeItem('golos_mini_user');
  localStorage.removeItem('golos_mini_key');
  
  stopLiveStream();
  applyAuthUI();
  showToast('Вы вышли из аккаунта');
});

//----- 2 Часть
function parseMetadata(rawMeta) {
  try {
    return typeof rawMeta === 'string' ? JSON.parse(rawMeta) : (rawMeta || {});
  } catch (e) {
    return {};
  }
}

function makeExcerpt(body, maxLength = 170) {
  const plain = (body || '')
    .replace(/!\[.*?\]\(.*?\)/g, '')       // Удаляем Markdown-картинки
    .replace(/<[^>]*>?/g, ' ')            // Удаляем HTML-теги (даже обрезанные, без закрывающей >)
    .replace(/[#>*_`~\[\]()]/g, '')       // Удаляем Markdown-символы
    .replace(/https?:\/\/\S+/g, '')       // Удаляем ссылки
    .replace(/\s+/g, ' ')                 // Схлопываем пробелы
    .trim();
  return plain.length > maxLength ? plain.slice(0, maxLength) + '...' : plain;
}

function formatReputation(raw) {
  if (!raw || raw === '0') return '25';
  const rep = parseInt(raw);
  const sign = rep < 0 ? -1 : 1;
  const abs = Math.abs(rep);
  let level = Math.log10(abs);
  level = Math.max(level - 9, 0);
  return (level * 9 * sign + 25).toFixed(2);
}

async function toggleFollow(targetUser, subscribe) {
  if (!sessionAuth.username || !sessionAuth.postingKey) {
    showToast('Нужно авторизоваться!');
    return;
  }

  const btn = document.getElementById('follow-btn');
  const originalText = btn ? btn.innerHTML : '';
  const originalClass = btn ? btn.className : '';

  // Мгновенный визуальный отклик
  if (btn) {
    btn.innerHTML = 'Загрузка...';
    btn.disabled = true;
  }

  const what = subscribe ? ['blog'] : [];
  const json = JSON.stringify(['follow', {
    follower: sessionAuth.username,
    following: targetUser,
    what: what
  }]);

  try {
    await golos.broadcast.customJsonAsync(
      sessionAuth.postingKey,
      [],
      [sessionAuth.username],
      'follow',
      json
    );
    
    showToast(subscribe ? 'Вы подписались!' : 'Вы отписались!');
    
    // Мгновенно меняем кнопку на противоположную (чтобы не ждать ноду)
    if (btn) {
      const newIsFollowing = subscribe; // Новое состояние
      btn.innerHTML = newIsFollowing ? 'Отписаться' : 'Подписаться';
      btn.className = newIsFollowing ? 'filter-btn' : 'btn-primary';
      btn.dataset.following = newIsFollowing;
      btn.disabled = false;
      
      // Перевешиваем обработчик на новое состояние
      btn.onclick = () => toggleFollow(targetUser, !newIsFollowing);
    }

    // В фоне (без задержки) перезагружаем профиль, чтобы обновить данные
    // Но делаем это так, чтобы пользователь не видел мигания (если возможно)
    // На самом деле, перезагрузка профиля вызовет openAuthorProfile, который перезапишет модалку.
    // Чтобы избежать мигания, мы можем не перезагружать профиль, а просто оставить кнопку обновленной.
    // Нода все равно обновится через пару секунд, но для пользователя это уже не важно.

  } catch (err) {
    showToast('Ошибка: ' + (err.message || err));
    if (btn) {
      btn.innerHTML = originalText;
      btn.className = originalClass;
      btn.disabled = false;
    }
  }
}
//-------
let shareTargetAuthor = null;
let shareTargetPermlink = null;

function showShareMenu(event, author, permlink) {
  event.stopPropagation();
  shareTargetAuthor = author;
  shareTargetPermlink = permlink;

  const menu = document.getElementById('share-menu');
  if (!menu) return;

  // Позиционируем меню под кнопкой
  const rect = event.target.getBoundingClientRect();
  
  // Чтобы меню не уходило за экран, ограничим позиционирование
  let leftPos = rect.left;
  if (leftPos + 180 > window.innerWidth) leftPos = window.innerWidth - 190;
  
  menu.style.left = leftPos + 'px';
  menu.style.top = (rect.bottom + 5) + 'px';
  menu.style.display = 'block';

  // Закрываем меню при клике в любом другом месте
  setTimeout(() => {
    document.addEventListener('click', closeShareMenu);
  }, 10);
}

function closeShareMenu() {
  const menu = document.getElementById('share-menu');
  if (menu) menu.style.display = 'none';
  document.removeEventListener('click', closeShareMenu);
}

function copyShareLink(service) {
  if (!shareTargetAuthor || !shareTargetPermlink) return;

  let url = '';
  if (service === 'blockchain') {
    url = `@${shareTargetAuthor}/${shareTargetPermlink}`;
  } else {
    url = `https://${service}/@${shareTargetAuthor}/${shareTargetPermlink}`;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Ссылка скопирована:\n' + url);
    }).catch(() => {
      prompt('Скопируйте ссылку вручную:', url);
    });
  } else {
    prompt('Скопируйте ссылку вручную:', url);
  }

  closeShareMenu();
}

// Навешиваем обработчики на пункты меню (после загрузки DOM)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.share-option').forEach(opt => {
    opt.addEventListener('click', () => {
      copyShareLink(opt.dataset.service);
    });
  });
});
//-------
function timeAgo(dateString) {
  const date = new Date(dateString + 'Z');
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'только что';
  const minutes = Math.floor(seconds / 60); 
  if (minutes < 60) return minutes + ' мин. назад';
  const hours = Math.floor(minutes / 60); 
  if (hours < 24) return hours + ' ч. назад';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + ' дн. назад';
  const months = Math.floor(days / 30);
  if (months < 12) return months + ' мес. назад';
  return Math.floor(months / 12) + ' г. назад';
}

function formatPayout(post) {
  const maxPayout = parseFloat(post.max_accepted_payout || '0');
  const isDeclined = maxPayout === 0;
  const pendingGolos = parseFloat(post.pending_author_payout_in_golos || '0');
  const paidGolos = parseFloat(post.author_payout_in_golos || '0');
  const donatesGolos = parseFloat(post.donates || '0');
  const totalGolos = (pendingGolos > 0 ? pendingGolos : paidGolos) + donatesGolos;

  if (isDeclined && donatesGolos === 0) return { text: 'Без выплат', declined: true };
  if (isDeclined && donatesGolos > 0) return { text: donatesGolos.toFixed(2) + ' GOLOS (донаты)', declined: false };
  return { text: totalGolos.toFixed(2) + ' GOLOS', declined: false };
}

function switchFeed(feedName) {
  currentFeed = feedName;
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.feed === feedName);
  });

  commentsFilterBar.classList.toggle('hidden', feedName !== 'comments');

  startAuthor = null;
  startPermlink = null;
  hasMore = true;
  isLoading = false;
  seenKeys.clear();
  feedContainer.innerHTML = '';
  window.scrollTo(0, 0);
  loadMoreFeed();
}
//------------------------------------------

async function fetchFeedBatch() {
  const isFirst = !startAuthor;
  const batchLimit = isFirst ? LIMIT : LIMIT + 1;

  // 1. Новое
  if (currentFeed === 'created') {
    const q = { limit: batchLimit, truncate_body: 350 };
    if (!isFirst) {
      q.start_author = startAuthor;
      q.start_permlink = startPermlink;
    }
    const res = await golos.api.getDiscussionsByCreatedAsync(q);
    return isFirst ? res : res.slice(1);
  }

  // 2. Моя лента
  if (currentFeed === 'feed') {
    const q = { select_authors: [sessionAuth.username], limit: batchLimit, truncate_body: 350 };
    if (!isFirst) {
      q.start_author = startAuthor;
      q.start_permlink = startPermlink;
    }
    const res = await golos.api.getDiscussionsByFeedAsync(q);
    return isFirst ? res : res.slice(1);
  }

  // 3. Мой блог
  if (currentFeed === 'blog') {
    const q = { select_authors: [sessionAuth.username], limit: batchLimit, truncate_body: 350 };
    if (!isFirst) {
      q.start_author = startAuthor;
      q.start_permlink = startPermlink;
    }
    const res = await golos.api.getDiscussionsByBlogAsync(q);
    return isFirst ? res : res.slice(1);
  }

      // 4. Комментарии
  if (currentFeed === 'comments') {
    // 1. Входящие ответы ("Мне" или "Его + мне") 
    if (commentSubMode === 'to_me' || (commentSubMode === 'his' && filterHisToMe)) {
      const sAuthor = isFirst ? sessionAuth.username : startAuthor;
      const sPerm = isFirst ? '' : startPermlink;
      const res = await golos.api.getRepliesByLastUpdateAsync(sAuthor, sPerm, 50);
      return isFirst ? res : res.slice(1);
    }

    // 2. "Его" (без галочки "мне")
    if (commentSubMode === 'his') {
      if (!targetCommentUser) return [];
      const sAuthor = isFirst ? targetCommentUser : startAuthor;
      const sPerm = isFirst ? '' : startPermlink;
      const res = await golos.api.getRepliesByLastUpdateAsync(sAuthor, sPerm, 25);
      return isFirst ? res : res.slice(1);
    }

    // 3. "Мои" — со стартом от твоего самого свежего сегодняшнего комментария
        // 3. "Мои" — со стартом от твоего самого свежего сегодняшнего комментария
    if (commentSubMode === 'my') {
      const me = sessionAuth.username;
      let cursorAuthor = startAuthor;
      let cursorPermlink = startPermlink;

      // Если это первая загрузка, ищем самый свежий комментарий
      if (isFirst) {
        const recentOps = await golos.api.getAccountHistoryAsync(me, -1, 100);
        if (Array.isArray(recentOps) && recentOps.length > 0) {
          recentOps.sort((a, b) => b.at(0) - a.at(0));
          const latestCommentOp = recentOps.find(([, tx]) => {
            const op = tx && tx.op;
            return op &&
              op.at(0) === 'comment' &&
              op.at(1).author.toLowerCase() === me &&
              op.at(1).parent_author !== '';
          });
          if (latestCommentOp) {
            cursorAuthor = latestCommentOp.at(1).op.at(1).author;
            cursorPermlink = latestCommentOp.at(1).op.at(1).permlink;
          }
        }
      }

      if (!cursorAuthor || !cursorPermlink) {
        // Если не нашли — фолбэк
        const sAuthor = isFirst ? me : startAuthor;
        const sPerm = isFirst ? '' : startPermlink;
        const fallbackRes = await golos.api.getRepliesByLastUpdateAsync(sAuthor, sPerm, 25);
        return isFirst ? fallbackRes : fallbackRes.slice(1);
      }

      const res = await golos.api.getDiscussionsByCommentsAsync({
        start_author: cursorAuthor,
        start_permlink: cursorPermlink,
        limit: batchLimit
      });

      // Если результат пустой (например, комментарий удален), делаем фолбэк
      if (!res || res.length === 0) {
        const sAuthor = isFirst ? me : startAuthor;
        const sPerm = isFirst ? '' : startPermlink;
        const fallbackRes = await golos.api.getRepliesByLastUpdateAsync(sAuthor, sPerm, 25);
        return isFirst ? fallbackRes : fallbackRes.slice(1);
      }

      return isFirst ? res : res.slice(1);
    }
  }

  return [];
}

function buildFeedCard(item) {
  const isComment = item.depth > 0;
  const meta = parseMetadata(item.json_metadata);
  const rawThumb = !isComment && Array.isArray(meta.image) && meta.image.length > 0 ? meta.image.at(0) : null;
  const firstImage = rawThumb ? fixImageUrl(rawThumb, '150x150') : null;
  const excerpt = makeExcerpt(item.body);
  const payout = formatPayout(item);
  const votesCount = item.net_votes || 0;
  const commentsCount = item.children || 0;

  const cardTitle = isComment
    ? (item.root_title ? '📣 ' + item.root_title : 'Комментарий')
    : (item.title || 'Без заголовка');

  const badgeHtml = isComment
    ? `<span class="comment-badge">Ответ @${item.parent_author}</span>`
    : (currentFeed === 'blog' && item.author !== sessionAuth.username ? '<span class="comment-badge">Репост</span>' : '');


    const card = document.createElement('div');
  card.className = 'post-card';
  card.dataset.author = item.author;
  card.dataset.permlink = item.permlink;

  // Подсветка непрочитанных (только для ленты "Комментарии" и только для "Мне" и "Его")
  if (currentFeed === 'comments' && commentSubMode !== 'my') {
    const readList = getReadMentions();
    const key = `${item.author}/${item.permlink}`;
    const periodHours = getMentionsPeriod();
    const dateLimit = Date.now() - periodHours * 60 * 60 * 1000;
    const createdAt = new Date(item.created + 'Z').getTime();
    
    if (!readList[key] && createdAt > dateLimit) {
      card.classList.add('unread');
    }
  }
  
 // Проверяем, голосовал ли пользователь
  let hasVoted = false;
  let voteWeight = 0;
  if (sessionAuth.username && item.active_votes) {
    const userVote = item.active_votes.find(v => v.voter === sessionAuth.username);
    if (userVote) {
      hasVoted = true;
      voteWeight = userVote.percent;
    }
  }

  const likeBtnHTML = hasVoted
    ? `<button type="button" class="like-btn liked" disabled>✅ ${voteWeight / 100}%</button>`
    : `<button type="button" class="like-btn">❤️ Лайк</button>`;
	

  card.innerHTML = `
    <div class="card-main">
      ${firstImage ? `<img class="thumb" src="${firstImage}" loading="lazy" decoding="async" onerror="this.style.display='none'">` : ''}
      <div class="card-content">
        <div class="meta">
          <span class="author-link" data-author="${item.author}">@${item.author}</span>
          ${badgeHtml}
          <span>• ${timeAgo(item.created)}</span>
        </div>
        <div class="title">${cardTitle.replace(/</g, '&lt;')}</div>
        <div class="excerpt">${excerpt}</div>
      </div>
    </div>
    <div class="card-footer">
      <div class="card-stats">
        <span class="payout-badge ${payout.declined ? 'declined' : ''}">💰 ${payout.text}</span>
        <span title="Лайков">👍 <span class="votes-count">${votesCount}</span></span>
        <span title="Комментариев">💬 ${commentsCount}</span>
      </div>
      ${likeBtnHTML}
    </div>
  `;

  card.querySelector('.author-link').addEventListener('click', (e) => {
    e.stopPropagation();
    openAuthorProfile(item.author);
  });

  const likeBtn = card.querySelector('.like-btn');
  likeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!sessionAuth.username) {
      showToast('Вам нужно авторизоваться');
      return;
    }
    openLikeModal(item.author, item.permlink, likeBtn, card.querySelector('.votes-count'));
  });

  const targetAuthor = isComment ? item.root_author : item.author;
  const targetPermlink = isComment ? item.root_permlink : item.permlink;
    // Для комментариев открываем сам комментарий (плашка корневого поста появится автоматически)
        card.addEventListener('click', () => {
    if (currentFeed === 'comments') {
      markMentionAsRead(item.author, item.permlink);
      card.classList.remove('unread');
      
      // Обновляем список упоминаний (чтобы бейдж пересчитался)
      const mention = currentMentionsList.find(m => m.author === item.author && m.permlink === item.permlink);
      if (mention) mention.isRead = true;
      updateMentionsBadge();
    }
    openPost(item.author, item.permlink);
  });

  return card;
}

async function loadMoreFeed() {
  if (isLoading || !hasMore) return;
  if (currentFeed === 'comments' && commentSubMode === 'his' && !targetCommentUser) {
    loader.textContent = 'Введите логин пользователя и нажмите «Его»';
    return;
  }

  isLoading = true;
  loader.textContent = 'Загрузка...';

  try {
    const rawItems = await fetchFeedBatch();

    if (!rawItems || rawItems.length === 0) {
      hasMore = false;
      loader.textContent = seenKeys.size === 0 ? 'Записей не найдено' : 'Все записи загружены';
      return;
    }

    const last = rawItems.at(-1);
    if (last.author === startAuthor && last.permlink === startPermlink) {
      hasMore = false;
      loader.textContent = 'Все записи загружены';
      return;
    }

    startAuthor = last.author;
    startPermlink = last.permlink;

    const fragment = document.createDocumentFragment();
    const me = (sessionAuth.username || '').toLowerCase();

    rawItems.forEach(item => {
      const key = item.author + '/' + item.permlink;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      if (currentFeed === 'comments') {
        const itemAuthor = item.author.toLowerCase();

        // 1. "Мне" — убираем свои ответы
        if (commentSubMode === 'to_me' && itemAuthor === me) return;

        // 2. "Мои" — оставляем только свои
        if (commentSubMode === 'my' && itemAuthor !== me) return;

        // 3. "Его" — если отмечена галочка "мне", оставляем только его ответы мне
        if (commentSubMode === 'his' && filterHisToMe) {
          if (itemAuthor !== targetCommentUser) return;
          const parentAuth = (item.parent_author || '').toLowerCase();		  
          const rootAuth = (item.root_author || '').toLowerCase();
          if (parentAuth !== me && rootAuth !== me) return;
        }
      }

      fragment.appendChild(buildFeedCard(item));
    });

    feedContainer.appendChild(fragment);
  } catch (err) {
    console.error('Ошибка загрузки ленты:', err);
    loader.textContent = 'Ошибка загрузки: ' + err.message;
  } finally {
    isLoading = false;
    const rect = loader.getBoundingClientRect();
    if (hasMore && rect.top <= window.innerHeight + 400) {
      loadMoreFeed();
    } else if (hasMore) {
      loader.textContent = 'Прокрутите вниз для подгрузки...';
    }
  }
}
//---------------------------------------------------------------
// 3.1 часть
const readerModal = document.getElementById('reader-modal');
const readerContent = document.getElementById('reader-content');
//------
async function openPost(author, permlink) {
  closeAllModals(); 
  
  if (!readerModal.classList.contains('open')) {
    savedScrollY = window.scrollY;
  }

  readerModal.classList.add('open');
  readerModal.scrollTop = 0;
  document.body.style.overflow = 'hidden';

  const cacheKey = author + '/' + permlink;
  const domCallbacks = {
    onOpenPost: (a, p) => openPost(a, p),
    onOpenProfile: (u) => openAuthorProfile(u)
  };

  if (postCache.has(cacheKey)) {
    readerContent.innerHTML = postCache.get(cacheKey);
    const bodyEl = document.getElementById('post-body-container');
    processPostDOM(bodyEl, domCallbacks);
    if (typeof loadComments === 'function') loadComments(author, permlink);
    return;
  }

  readerContent.innerHTML = '<p style="text-align:center;padding:40px;color:#5c6f82;">Загрузка поста...</p>';

  try {
    const post = await golos.api.getContentAsync(author, permlink);
    if (!post || !post.author) {
      readerContent.innerHTML = '<p>Пост не найден или был удален.</p>';
      return;
    }

    currentPostAuthor = post.author;
    currentPostPermlink = post.permlink;
    currentPostTitle = post.title;
    const meta = parseMetadata(post.json_metadata);
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const htmlBody = renderMarkdownWithMedia(post.body);
    const dateStr = timeAgo(post.created);

    // Определяем, голосовал ли пользователь
    let postHasVoted = false;
    let postVoteWeight = 0;
    if (sessionAuth.username && post.active_votes) {
      const userVote = post.active_votes.find(v => v.voter === sessionAuth.username);
      if (userVote) {
        postHasVoted = true;
        postVoteWeight = userVote.percent;
      }
    }

    // Формируем кнопку голоса
    const postVoteBtnHTML = (post.max_accepted_payout === '0.000 GBG')
      ? `<span style="font-size:14px; color:#777; font-weight:bold;">🚫 Выплаты отклонены</span>`
      : (postHasVoted
        ? `<button class="filter-btn" style="background:#2e7d32; color:#fff; border-color:#2e7d32; cursor:default;" disabled>✅ Вы проголосовали (${postVoteWeight / 100}%)</button>`
        : `<button class="filter-btn" onclick="openLikeModal('${escapeAttr(post.author)}', '${escapeAttr(post.permlink)}', this, null)">👍 Лайк</button>`);
    
    // Кнопки автора (с проверкой на комментарий)
    const isComment = post.parent_author !== '';
    let authorButtons = '';
    if (sessionAuth.username === post.author) {
      const hasVotes = post.net_votes > 0;
      const hasComments = post.children > 0;
      const isPayoutStarted = new Date(post.cashout_time + 'Z') < new Date();
      const canDelete = !hasVotes && !hasComments && !isPayoutStarted;

      authorButtons = `
        <button class="filter-btn" style="border-color:#f39c12; color:#f39c12;" onclick="${isComment ? 'openEditCommentModal' : 'editPost'}('${escapeAttr(post.author)}', '${escapeAttr(post.permlink)}')">✏️ Редактировать</button>
        ${canDelete ? `<button class="filter-btn" style="border-color:#c0392b; color:#c0392b;" onclick="${isComment ? 'deleteComment' : 'deletePost'}('${escapeAttr(post.author)}', '${escapeAttr(post.permlink)}')">🗑 Удалить</button>` : ''}
      `;
    }

    // Плашка корневого поста
    let rootHeaderHtml = '';
    if (post.parent_author !== '' && post.url && post.root_title) {
      let rootAuthor = '', rootPermlink = '';
      const match = post.url.match(/\/(@[^\/]+)\/([^#]+)#/);
      if (match) {
        rootAuthor = match[1].replace('@', '');
        rootPermlink = match[2];
      } else {
        rootAuthor = post.root_author;
      }

      if (rootAuthor && rootPermlink) {
        const rootTitle = post.root_title || '(Без заголовка)';
        rootHeaderHtml = `
          <div style="margin-bottom: 15px; padding: 10px; background: #f0f4f8; border-radius: 5px; font-size: 14px; border-left: 4px solid #2b70b8;">
            Обсуждение в посте: <span class="mention-in-text" onclick="closeReader(); openPost('${escapeAttr(rootAuthor)}', '${escapeAttr(rootPermlink)}')">${escapeAttr(rootTitle)}</span>
          </div>
        `;
      }
    }

    const fullHtml = `
      ${rootHeaderHtml}
      <div class="meta">
        <span class="author-link" data-author="${post.author}">@${post.author}</span>
        <span>• ${dateStr}</span>
        <span>• 💰 ${formatPayout(post).text}</span>
      </div>
      <h1 style="margin:8px 0 16px;font-size:24px;">${(post.title || '👇').replace(/</g, '&lt;')}</h1>
      <div class="post-body" id="post-body-container">${htmlBody}</div>
      
      <div class="tags">
        ${tags.map(t => `<span class="tag">#${String(t).replace(/</g, '&lt;')}</span>`).join('')}
      </div>

      <div class="post-actions" style="margin-top: 20px; display: flex; gap: 10px; border-top: 1px solid #edf2f7; padding-top: 15px; flex-wrap: wrap;">
        ${postVoteBtnHTML}
        <button class="filter-btn" onclick="openReplyModal('${escapeAttr(post.author)}', '${escapeAttr(post.permlink)}', '${escapeAttr(post.title)}')">💬 Ответить</button>
        <button class="filter-btn" onclick="showShareMenu(event, '${escapeAttr(post.author)}', '${escapeAttr(post.permlink)}')">🔗 Поделиться</button>
        ${authorButtons}
      </div>

      <div class="comments-section" style="margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 20px;">
        <h3 style="margin-top:0; font-size: 18px;">Комментарии (${post.children})</h3>
        <div id="commentsContainer"><p style="color:#777;">Загрузка комментариев...</p></div>
      </div>
    `;

    postCache.set(cacheKey, fullHtml);
    readerContent.innerHTML = fullHtml;

    const bodyEl = document.getElementById('post-body-container');
    processPostDOM(bodyEl, domCallbacks);
    readerContent.querySelector('.author-link')?.addEventListener('click', () => openAuthorProfile(post.author));

    // Принудительно восстанавливаем iframe (чтобы YouTube загрузился)
    bodyEl.querySelectorAll('iframe[data-src]').forEach(iframe => {
      iframe.src = iframe.getAttribute('data-src');
      iframe.removeAttribute('data-src');
    });
	
	//----
	

    // Загружаем комментарии
    loadComments(post.author, post.permlink);

  } catch (err) {
    console.error('Ошибка открытия поста:', err);
    readerContent.innerHTML = '<p>Ошибка загрузки поста: ' + err.message + '</p>';
  }
}
//------
async function loadComments(author, permlink) {
  const commentsContainer = document.getElementById('commentsContainer');
  if (!commentsContainer) return;

  commentsContainer.innerHTML = '<p style="color:#777;">Загрузка комментариев...</p>';

  const fetchReplies = (parentAuthor, parentPermlink) => {
    return new Promise((resolve) => {
      golos.api.getContentReplies(parentAuthor, parentPermlink, (err, comments) => {
        if (err || !comments) resolve([]);
        else resolve(comments);
      });
    });
  };

  const renderTree = async (parentAuthor, parentPermlink, container, depth = 0) => {
    const comments = await fetchReplies(parentAuthor, parentPermlink);

    if (comments.length === 0 && depth === 0) {
      container.innerHTML = '<p style="color:#777;">Комментариев пока нет. Будьте первым!</p>';
      return;
    }

    for (const comment of comments) {
      
		//---

            // 1. Парсим тело комментария
      const commentHtml = renderMarkdownWithMedia(comment.body);
      
      // 2. Создаем контейнер и вставляем HTML
      const commentDiv = document.createElement('div');
      commentDiv.className = 'comment-item';
      commentDiv.innerHTML = commentHtml; // Вставляем пока просто HTML
      
      // 3. Обрабатываем DOM (ссылки, картинки, iframe)
      const domCallbacks = {
        onOpenPost: (a, p) => openPost(a, p),
        onOpenProfile: (u) => openAuthorProfile(u)
      };
      processPostDOM(commentDiv, domCallbacks); // <--- ВАЖНО: передаем commentDiv, а не tempDiv
      
      // 4. Принудительно восстанавливаем iframe (чтобы YouTube работал)
      commentDiv.querySelectorAll('iframe[data-src]').forEach(iframe => {
        iframe.src = iframe.getAttribute('data-src');
        iframe.removeAttribute('data-src');
      });
      
      // 5. Теперь формируем финальный HTML с кнопками
      const commentTextHtml = commentDiv.innerHTML;
      
      // 6. Создаем финальный блок с кнопками
      const finalCommentDiv = document.createElement('div');
      finalCommentDiv.className = 'comment-item';
      
      // ... (дальше идет твой код с комментариями, голосами и т.д.)
      
      let commentHasVoted = false;
      let commentVoteWeight = 0;
      if (sessionAuth.username && comment.active_votes) {
        const userVote = comment.active_votes.find(v => v.voter === sessionAuth.username);
        if (userVote) {
          commentHasVoted = true;
          commentVoteWeight = userVote.percent;
        }
      }

      const commentVoteBtn = (comment.max_accepted_payout === '0.000 GBG')
        ? `<span style="font-size:11px; color:#777;">🚫 Без выплат</span>`
        : (commentHasVoted
          ? `<button class="filter-btn" style="font-size:11px; padding:2px 8px; background:#2b7bba; color:#fff;" disabled>✅ ${commentVoteWeight / 100}%</button>`
          : `<button class="filter-btn" onclick="voteComment('${comment.author}', '${comment.permlink}', this)" style="font-size:11px; padding:2px 8px;">👍</button>`);

      let commentAuthorButtons = '';
      if (sessionAuth.username === comment.author) {
        const canDeleteComment = (comment.children === 0 && comment.net_votes === 0);
        commentAuthorButtons = `
          <button class="filter-btn" onclick="openEditCommentModal('${escapeAttr(comment.author)}', '${escapeAttr(comment.permlink)}')" style="border-color: #f39c12; color: #f39c12; font-size:11px;">✏️ Ред.</button>
          ${canDeleteComment ? `<button class="filter-btn" onclick="deleteComment('${escapeAttr(comment.author)}', '${escapeAttr(comment.permlink)}')" style="border-color: #c0392b; color: #c0392b; font-size:11px;">🗑 Удал.</button>` : ''}
        `;
      }

      finalCommentDiv.innerHTML = `
        <div class="comment-header">
          <b>@${comment.author}</b> · ${timeAgo(comment.created)}
        </div>
        <div class="comment-body">${commentTextHtml}</div>
        <div style="display:flex; gap:10px; margin-top: 10px; flex-wrap: wrap;">
          <button class="filter-btn" onclick="openReplyModal('${escapeAttr(comment.author)}', '${escapeAttr(comment.permlink)}')">Ответить</button>
          ${commentVoteBtn}
          ${commentAuthorButtons}
        </div>
      `;

      container.appendChild(finalCommentDiv);

      if (comment.children > 0) {
        if (depth < 3) {
          const repliesContainer = document.createElement('div');
          repliesContainer.className = 'comment-replies';
          finalCommentDiv.appendChild(repliesContainer);
          await renderTree(comment.author, comment.permlink, repliesContainer, depth + 1);
        } else {
          const marker = document.createElement('div');
          marker.style.cssText = 'font-size: 11px; color: #2b7bba; margin-top: 10px; margin-bottom: 2px; padding-left: 15px;';
          marker.textContent = '↳ Ответ на комментарий:';
          container.appendChild(marker);
          await renderTree(comment.author, comment.permlink, container, depth + 1);
        }
      }
	  //--
    }
  };

  commentsContainer.innerHTML = '';
  renderTree(author, permlink, commentsContainer, 0);
}
//------
async function voteComment(author, permlink, btnElement) {
  if (!sessionAuth.username || !sessionAuth.postingKey) {
    showToast('Вам нужно авторизоваться');
    return;
  }

  const originalText = btnElement.innerHTML;
  btnElement.innerHTML = '⏳...';
  btnElement.disabled = true;

  try {
    await golos.broadcast.voteAsync(sessionAuth.postingKey, sessionAuth.username, author, permlink, 10000);
    btnElement.innerHTML = '✅ 100%';
    btnElement.style.background = '#2b7bba';
    btnElement.style.color = '#fff';
    showToast('Голос учтен!');
    
    // Скрываем кнопку удаления у этого комментария (если она есть)
    const commentBlock = btnElement.closest('.comment-item');
    if (commentBlock) {
      const deleteBtn = commentBlock.querySelector('.filter-btn[style*="c0392b"]');
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
  } catch (err) {
    const msg = err.message || JSON.stringify(err);
    if (msg.includes('already voted') || msg.includes('similar way')) {
      showToast('Вы уже голосовали за этот комментарий!');
      btnElement.innerHTML = '✅ Уже';
    } else {
      showToast('Ошибка голосования: ' + msg);
      btnElement.innerHTML = originalText;
      btnElement.disabled = false;
    }
  }
}
//------
function closeReader() {
  // Останавливаем все видео в модалке поста
  const iframes = readerContent.querySelectorAll('iframe');
  iframes.forEach(iframe => { 
    iframe.src = 'about:blank'; 
  });

  readerModal.classList.remove('open');
  document.body.style.overflow = '';
  readerContent.innerHTML = '';
  window.scrollTo(0, savedScrollY);
}

document.getElementById('close-reader').addEventListener('click', closeReader);
readerModal.addEventListener('click', (e) => {
  if (e.target === readerModal || e.target.classList.contains('reader-wrapper')) {
    closeReader();
  }
});

// Модальное окно мини-профиля автора с бесконечной подгрузкой списка постов
let profileState = {
  username: '',
  startAuthor: null,
  startPermlink: null,
  isLoading: false,
  hasMore: false,
  seen: new Set()
};

const profileModal = document.getElementById('profile-modal');
const profileListEl = document.getElementById('profile-posts-list');

async function loadMoreProfilePosts() {
  if (profileState.isLoading || !profileState.hasMore || !profileState.username) return;
  profileState.isLoading = true;

  let statusEl = profileListEl.querySelector('.profile-loader');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'profile-loader';
    profileListEl.appendChild(statusEl);
  }
  statusEl.textContent = 'Загрузка постов...';

  try {
    const isFirst = !profileState.startAuthor;
    const batchLimit = isFirst ? 20 : 21;
    const query = {
      select_authors: [profileState.username],
      limit: batchLimit,
      truncate_body: 1
    };

    if (!isFirst) {
      query.start_author = profileState.startAuthor;
      query.start_permlink = profileState.startPermlink;
    }

    const res = await golos.api.getDiscussionsByBlogAsync(query);
    const posts = isFirst ? res : res.slice(1);

    if (!posts || posts.length === 0) {
      profileState.hasMore = false;
      statusEl.textContent = profileState.seen.size === 0
        ? 'В блоге пока нет публикаций.'
        : 'Все посты автора загружены';
      return;
    }

    const last = posts.at(-1);
    if (last.author === profileState.startAuthor && last.permlink === profileState.startPermlink) {
      profileState.hasMore = false;
      statusEl.textContent = 'Все посты автора загружены';
      return;
    }

    profileState.startAuthor = last.author;
    profileState.startPermlink = last.permlink;

    const fragment = document.createDocumentFragment();
    posts.forEach(p => {
      const key = p.author + '/' + p.permlink;
      if (profileState.seen.has(key)) return;
      profileState.seen.add(key);

      const item = document.createElement('div');
      item.className = 'profile-post-item';
      const isReblog = p.author !== profileState.username;
      item.textContent = (isReblog ? '🔁 ' : '') + (p.title || 'Без заголовка') + ' · ' + timeAgo(p.created);

      item.addEventListener('click', () => {
        openPost(p.author, p.permlink);
      });
      fragment.appendChild(item);
    });

    profileListEl.insertBefore(fragment, statusEl);
    statusEl.textContent = profileState.hasMore ? 'Прокрутите вниз для подгрузки...' : 'Все посты автора загружены';
  } catch (err) {
    console.error('Ошибка загрузки блога автора:', err);
    statusEl.textContent = 'Ошибка загрузки: ' + err.message;
  } finally {
    profileState.isLoading = false;
    if (profileState.hasMore && profileListEl.scrollHeight <= profileListEl.clientHeight + 100) {
      loadMoreProfilePosts();
    }
  }
}

profileListEl.addEventListener('scroll', () => {
  if (!profileState.hasMore || profileState.isLoading) return;
  const nearBottom = profileListEl.scrollTop + profileListEl.clientHeight >= profileListEl.scrollHeight - 150;
  if (nearBottom) {
    loadMoreProfilePosts();
  }
}, { passive: true });

async function openAuthorProfile(username) {
	closeAllModals();
	
  const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileUsername = document.getElementById('profile-username');
  const profileReputation = document.getElementById('profile-reputation');
  const profileActions = document.getElementById('profile-actions');

  profileUsername.textContent = '@' + cleanUser;
  profileAvatar.src = 'https://' + ['images.golos.today', 'u', cleanUser, 'avatar'].join('/');
  profileReputation.textContent = '⭐ Репутация: ...';
  profileActions.innerHTML = ''; // Очищаем кнопки перед загрузкой

  // Сбрасываем и открываем модалку
  profileState = {
    username: cleanUser,
    startAuthor: null,
    startPermlink: null,
    isLoading: false,
    hasMore: true,
    seen: new Set()
  };
  profileListEl.innerHTML = '';
  profileListEl.scrollTop = 0;
  profileModal.classList.add('open');

  // Загружаем данные аккаунта и подписку
  try {
        const [acc] = await golos.api.getAccountsAsync([cleanUser]);
    if (acc) {
      // Репутация
      const rep = formatReputation(acc.reputation);
      profileReputation.textContent = `⭐ Репутация: ${rep}`;
      
      // --- НОВАЯ ЛОГИКА АВАТАРКИ ---
      const meta = parseMetadata(acc.json_metadata);
      let avatarUrl = '';
      
      if (meta.profile && meta.profile.profile_image) {
        // Прогоняем через fixImageUrl (заменяет старые домены на images.golos.today)
        avatarUrl = fixImageUrl(meta.profile.profile_image,'75x75');
      }
      
      if (avatarUrl) {
        profileAvatar.src = avatarUrl;
      } else {
        // Фолбэк: генерируем SVG с первой буквой ника
        const fallbackSvg = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 font-size=%2240%22 text-anchor=%22middle%22 fill=%22%23999%22>${cleanUser[0].toUpperCase()}</text></svg>`;
        profileAvatar.src = fallbackSvg;
      }
      
      // Обработка ошибки загрузки аватарки (если ссылка битая)
      profileAvatar.onerror = function() {
        this.onerror = null;
        this.src = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 font-size=%2240%22 text-anchor=%22middle%22 fill=%22%23999%22>${cleanUser[0].toUpperCase()}</text></svg>`;
      };
      // ----------------------------
    }

    // Проверяем подписку (если авторизованы и это не наш профиль)
    if (sessionAuth.username && sessionAuth.username !== cleanUser) {
      const following = await golos.api.getFollowingAsync(sessionAuth.username, cleanUser, 'blog', 1);
      const isFollowing = following && following.length > 0 && following[0].following === cleanUser;
      
      const btnText = isFollowing ? 'Отписаться' : 'Подписаться';
      const btnClass = isFollowing ? 'filter-btn' : 'btn-primary';
      
      profileActions.innerHTML = `
        <button type="button" class="${btnClass}" id="follow-btn" data-following="${isFollowing}">${btnText}</button>
      `;
      
      document.getElementById('follow-btn').addEventListener('click', () => toggleFollow(cleanUser, !isFollowing));
    } else if (!sessionAuth.username) {
      profileActions.innerHTML = `<button type="button" class="filter-btn" onclick="document.getElementById('auth-modal').classList.add('open')">Войти, чтобы подписаться</button>`;
    }

  } catch (err) {
    console.warn('Ошибка загрузки профиля:', err);
  }

  // Загружаем посты
  loadMoreProfilePosts();
}

// 3.2 часть
let activeVoteTarget = null;
const likeModal = document.getElementById('like-modal');
const voteSlider = document.getElementById('vote-weight-slider');
const voteLabel = document.getElementById('vote-weight-label');
const donateInput = document.getElementById('donate-amount-input');

function openLikeModal(author, permlink, btnEl, countEl) {
  activeVoteTarget = { author, permlink, btnEl, countEl };
  document.getElementById('like-modal-title').textContent = 'Поддержать @' + author;
  voteSlider.value = 100;
  voteLabel.textContent = '100%';
  donateInput.value = '';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  likeModal.classList.add('open');
  refreshAccountStatus();
}

voteSlider.addEventListener('input', () => {
  voteLabel.textContent = voteSlider.value + '%';
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    donateInput.value = btn.dataset.amount;
  });
});

donateInput.addEventListener('input', () => {
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.amount === donateInput.value.trim());
  });
});

document.getElementById('confirm-like-btn').addEventListener('click', async () => {
  if (!activeVoteTarget) return;
  const { author, permlink, btnEl, countEl } = activeVoteTarget;
  const percent = Number(voteSlider.value);
  const donateAmount = parseFloat(donateInput.value) || 0;

  if (!sessionAuth.username || !sessionAuth.postingKey) {
    showToast('Вам нужно авторизоваться');
    return;
  }

  const confirmBtn = document.getElementById('confirm-like-btn');
  const originalText = confirmBtn.innerHTML;
  confirmBtn.innerHTML = 'Отправка...';
  confirmBtn.disabled = true;

  try {
    // 1. Отправляем голос (если еще не голосовали)
    if (btnEl && !btnEl.classList.contains('liked')) {
      await golos.broadcast.voteAsync(
        sessionAuth.postingKey,
        sessionAuth.username,
        author,
        permlink,
        percent * 100
      );
      
      // Обновляем кнопку в модалке
      btnEl.classList.add('liked');
      btnEl.innerHTML = '✅ ' + percent + '%';
      btnEl.disabled = true;
      if (countEl) {
        countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1;
      }

      // Обновляем кнопку в ленте (если она есть)
      const feedCard = document.querySelector(`.post-card[data-author="${author}"][data-permlink="${permlink}"]`);
      if (feedCard) {
        const feedLikeBtn = feedCard.querySelector('.like-btn');
        const feedCountEl = feedCard.querySelector('.votes-count');
        if (feedLikeBtn && !feedLikeBtn.classList.contains('liked')) {
          feedLikeBtn.classList.add('liked');
          feedLikeBtn.innerHTML = '✅ ' + percent + '%';
          feedLikeBtn.disabled = true;
          if (feedCountEl) {
            feedCountEl.textContent = (parseInt(feedCountEl.textContent, 10) || 0) + 1;
          }
        }
      }

      // Очищаем кэш поста
      postCache.delete(author + '/' + permlink);
    }

    // 2. Отправляем донат (если указана сумма)
    if (donateAmount > 0) {
      const amountStr = donateAmount.toFixed(3) + ' GOLOS';
      const donateOptions = {
        app: 'mini-client',
        version: 1.0,
        comment: 'Донат из мини-клиента',
        target: { author: author, permlink: permlink }
      };

      await new Promise((resolve, reject) => {
        golos.broadcast.donate(
          sessionAuth.postingKey,
          sessionAuth.username,
          author,
          amountStr,
          donateOptions,
          [],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      showToast(`Голос ${percent}% и донат ${donateAmount} GOLOS учтены!`);
    } else {
      showToast(`Голос ${percent}% учтен!`);
    }

  } catch (err) {
    console.error('Ошибка:', err);
    const msg = err.message || JSON.stringify(err);
    if (msg.includes('already voted')) {
      showToast('Вы уже голосовали за этот пост!');
    } else {
      showToast('Ошибка: ' + msg);
    }
  } finally {
    confirmBtn.innerHTML = originalText;
    confirmBtn.disabled = false;
    likeModal.classList.remove('open');
    activeVoteTarget = null;

    // --- ПЕРЕЗАГРУЗКА ПОСТА ПОСЛЕ ЗАКРЫТИЯ МОДАЛКИ ---
    if (readerModal.classList.contains('open')) {
      postCache.delete(author + '/' + permlink);
      openPost(author, permlink);
    }
  }
});

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchFeed(tab.dataset.feed));
});

document.getElementById('open-auth-btn').addEventListener('click', () => {
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-modal').classList.add('open');
});

document.getElementById('open-mentions-btn')?.addEventListener('click', () => {
  closeAllModals();
  document.getElementById('mentions-enabled-cb').checked = isMentionsEnabled();
  document.getElementById('mentions-period-select').value = getMentionsPeriod();
  document.getElementById('mentions-modal').classList.add('open');
  loadMentions();
});

document.getElementById('open-editor-btn').addEventListener('click', () => {
  document.getElementById('editor-modal').classList.add('open');
});

headerUsername.addEventListener('click', () => {
  if (sessionAuth.username) openAuthorProfile(sessionAuth.username);
});

document.querySelectorAll('.filter-btn[data-cmode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-cmode]').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-his-comments').classList.remove('active');
    btn.classList.add('active');
    commentSubMode = btn.dataset.cmode;
    switchFeed('comments');
  });
});

document.getElementById('btn-his-comments').addEventListener('click', () => {
  const val = document.getElementById('target-user-input').value.trim().toLowerCase().replace(/^@/, '');
  if (!val) { showToast('Введите логин пользователя'); return; }
  document.querySelectorAll('.filter-btn[data-cmode]').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-his-comments').classList.add('active');
  commentSubMode = 'his';
  targetCommentUser = val;
  // filterHisToMe уже true по умолчанию, ничего менять не надо
  switchFeed('comments');
});



document.querySelectorAll('.modal-close-x').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = document.getElementById(btn.dataset.close);
    if (modal) {
      modal.querySelectorAll('iframe').forEach(iframe => { iframe.src = 'about:blank'; });
      modal.classList.remove('open');
    }
  });
});
/*
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  if (overlay.id === 'reader-modal') return;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.querySelectorAll('iframe').forEach(iframe => { iframe.src = 'about:blank'; });
      overlay.classList.remove('open');
    }
  });
});
*/

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (readerModal.classList.contains('open')) {
      closeReader();
      return;
    }
    // Останавливаем видео во всех открытых модалках перед закрытием
    document.querySelectorAll('.modal-overlay.open').forEach(modal => {
      modal.querySelectorAll('iframe').forEach(iframe => { iframe.src = 'about:blank'; });
      modal.classList.remove('open');
    });
  }
});

let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    requestAnimationFrame(() => {
      scrollTopBtn.classList.toggle('visible', window.scrollY > 400);

      if (!readerModal.classList.contains('open') && hasMore && !isLoading) {
        const rect = loader.getBoundingClientRect();
        if (rect.top <= window.innerHeight + 400) {
          loadMoreFeed();
        }
      }
      scrollTicking = false;
    });
    scrollTicking = true;
  }
}, { passive: true });

scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ========== РЕДАКТОР ОТВЕТА / КОММЕНТАРИЯ ==========
let replyParentAuthor = null;
let replyParentPermlink = null;
let editingCommentPermlink = null;

function openReplyModal(parentAuthor, parentPermlink, postTitle) {
  if (!sessionAuth.username || !sessionAuth.postingKey) {
    showToast('Нужно авторизоваться');
    document.getElementById('auth-modal').classList.add('open');
    return;
  }

  //closeAllModals();
  
  replyParentAuthor = parentAuthor;
  replyParentPermlink = parentPermlink;
  editingCommentPermlink = null;

  document.getElementById('reply-modal-title').textContent = 'Ответ';
  
  let targetText = '';
  if (postTitle) {
    targetText = `В ответ на пост: "${postTitle}"`;
  } else {
    targetText = `В ответ на комментарий @${parentAuthor}`;
  }
  document.getElementById('reply-target-text').textContent = targetText;

  document.getElementById('reply-body').value = `@${parentAuthor}, `;
  document.getElementById('reply-submit-btn').textContent = 'Отправить';
  document.getElementById('reply-status').textContent = '';

  switchReplyTab('editor');
  document.getElementById('reply-modal').classList.add('open');
}

function openEditCommentModal(author, permlink) {
  if (!sessionAuth.username || !sessionAuth.postingKey) return;

 // closeAllModals();
  
  golos.api.getContentAsync(author, permlink).then(post => {
    if (!post) return showToast('Комментарий не найден');

    replyParentAuthor = post.parent_author;
    replyParentPermlink = post.parent_permlink;
    editingCommentPermlink = post.permlink;

    document.getElementById('reply-modal-title').textContent = 'Редактирование комментария';
    document.getElementById('reply-target-text').textContent = '';
    document.getElementById('reply-body').value = post.body;
    document.getElementById('reply-submit-btn').textContent = 'Сохранить';
    document.getElementById('reply-status').textContent = '';

    switchReplyTab('editor');
    document.getElementById('reply-modal').classList.add('open');
  }).catch(err => showToast('Ошибка: ' + err.message));
}

function switchReplyTab(tab) {
  const textarea = document.getElementById('reply-body');
  const preview = document.getElementById('reply-preview');
  const btnEditor = document.getElementById('reply-tab-editor-btn');
  const btnPreview = document.getElementById('reply-tab-preview-btn');

  if (tab === 'preview') {
    const htmlBody = renderMarkdownWithMedia(textarea.value);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlBody;

    // Применяем ту же логику, что и в постах
        processPostDOM(tempDiv, {
      onOpenPost: (a, p) => openPost(a, p),
      onOpenProfile: (u) => openAuthorProfile(u)
    });

    preview.innerHTML = tempDiv.innerHTML;

    // Принудительно восстанавливаем iframe (чтобы YouTube/Rutube работали в предпросмотре)
    preview.querySelectorAll('iframe[data-src]').forEach(iframe => {
      iframe.src = iframe.getAttribute('data-src');
      iframe.removeAttribute('data-src');
    });
	
	
    textarea.style.display = 'none';
    preview.style.display = 'block';
    btnPreview.classList.add('btn-primary');
    btnPreview.classList.remove('filter-btn');
    btnEditor.classList.add('filter-btn');
    btnEditor.classList.remove('btn-primary');
  } else {
    textarea.style.display = 'block';
    preview.style.display = 'none';
    btnEditor.classList.add('btn-primary');
    btnEditor.classList.remove('filter-btn');
    btnPreview.classList.add('filter-btn');
    btnPreview.classList.remove('btn-primary');
  }
}

function insertReplyMD(before, after) {
  const textarea = document.getElementById('reply-body');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);
  textarea.value = text.substring(0, start) + before + selected + after + text.substring(end);
  textarea.focus();
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = start + before.length + selected.length;
}

function insertEmoji(emoji) {
  const textarea = document.getElementById('reply-body');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.substring(0, start) + emoji + textarea.value.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
  textarea.focus();
}

async function sendReply() {
  const body = document.getElementById('reply-body').value.trim();
  if (!body) return showToast('Введите текст');

  const submitBtn = document.getElementById('reply-submit-btn');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = 'Отправка...';
  submitBtn.disabled = true;

  const permlink = editingCommentPermlink || ('re-' + Date.now());
  
  // Сбор упоминаний (используем функцию из старого клиента)
  const mentionedUsers = extractMentionedUsers(body);
  const metaObj = { tags: ['comment'], app: 'golos.today/0.1' }; 
  // Вариант забирать теги из поста-родителя
 /*   const mentionedUsers = extractMentionedUsers(body);

  let parentTags = ['golos'];
  try {
    // Если мы знаем корневой пост (из openPost), берем теги оттуда
    if (currentPostAuthor && currentPostPermlink) {
      const rootPost = await golos.api.getContentAsync(currentPostAuthor, currentPostPermlink);
      if (rootPost && rootPost.json_metadata) {
        const meta = parseMetadata(rootPost.json_metadata);
        if (Array.isArray(meta.tags) && meta.tags.length > 0) {
          parentTags = meta.tags;
        }
      }
    }
  } catch (e) {
    console.warn('Не удалось получить теги родительского поста:', e);
  }

  const metaObj = { tags: parentTags, app: 'mini-client/1.0' };
  */
  //---
  if (mentionedUsers.length > 0) metaObj.users = mentionedUsers;
  const jsonMetadata = JSON.stringify(metaObj);

  document.getElementById('reply-status').textContent = 'Отправка...';
  document.getElementById('reply-status').style.color = '#333';

  try {
    await golos.broadcast.commentAsync(
      sessionAuth.postingKey,
      replyParentAuthor,
      replyParentPermlink,
      sessionAuth.username,
      permlink,
      '',
      body,
      jsonMetadata
    );
	//-------
	    // Отмечаем комментарий, на который ответили, как прочитанный
    if (replyParentAuthor && replyParentPermlink) {
      markMentionAsRead(replyParentAuthor, replyParentPermlink);
      
      // Убираем подсветку в ленте (если открыта)
      const card = document.querySelector(`.post-card[data-author="${replyParentAuthor}"][data-permlink="${replyParentPermlink}"]`);
      if (card) card.classList.remove('unread');
      
      updateMentionsBadge();
    }
	//----

    document.getElementById('reply-status').textContent = editingCommentPermlink ? 'Успешно обновлено!' : 'Успешно отправлено!';
    document.getElementById('reply-status').style.color = 'green';

    setTimeout(() => {
      const replyModal = document.getElementById('reply-modal');
      replyModal.querySelectorAll('iframe').forEach(iframe => { iframe.src = 'about:blank'; });
      replyModal.classList.remove('open');
      // Перезагружаем комментарии
            if (readerModal.classList.contains('open')) {
        if (currentPostAuthor && currentPostPermlink) {
          loadComments(currentPostAuthor, currentPostPermlink);
        }
      }
      editingCommentPermlink = null;
    }, 1500);

  } catch (err) {
    document.getElementById('reply-status').textContent = 'Ошибка: ' + (err.message || err);
    document.getElementById('reply-status').style.color = 'red';
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}
//---------
// ========== УДАЛЕНИЕ ПОСТОВ И КОММЕНТАРИЕВ ==========

async function deletePost(author, permlink) {
  if (!sessionAuth.username || !sessionAuth.postingKey) {
    showToast('Нужно авторизоваться');
    return;
  }

  if (!confirm('Вы уверены, что хотите удалить этот пост?')) return;

  try {
    await golos.broadcast.deleteCommentAsync(
      sessionAuth.postingKey,
      author,
      permlink
    );
    
    showToast('Пост удален!');
    closeReader();
    
    // Обновляем ленту (если мы в ней)
    if (typeof switchFeed === 'function') {
      switchFeed(currentFeed);
    }
  } catch (err) {
    const msg = err.message || JSON.stringify(err);
    if (msg.includes('Cannot delete a comment with replies')) {
      showToast('Невозможно удалить пост, так как под ним есть комментарии.');
    } else if (msg.includes('business logic error') || msg.includes('Cannot delete')) {
      showToast('Невозможно удалить пост. Скорее всего, он уже получил выплаты или голоса.');
    } else {
      showToast('Ошибка удаления: ' + msg);
    }
  }
}

async function deleteComment(author, permlink) {
  if (!sessionAuth.username || !sessionAuth.postingKey) {
    showToast('Нужно авторизоваться');
    return;
  }

  if (!confirm('Удалить комментарий?')) return;

  try {
    await golos.broadcast.deleteCommentAsync(
      sessionAuth.postingKey,
      author,
      permlink
    );
    
    showToast('Комментарий удален!');
    
    // Перезагружаем комментарии
    if (currentPostAuthor && currentPostPermlink) {
      loadComments(currentPostAuthor, currentPostPermlink);
    }
  } catch (err) {
    const msg = err.message || JSON.stringify(err);
    if (msg.includes('Cannot delete a comment with replies')) {
      showToast('Невозможно удалить комментарий, так как на него есть ответы.');
    } else if (msg.includes('Cannot delete a comment with network positive votes') || msg.includes('net positive votes')) {
      showToast('Невозможно удалить комментарий, так как за него уже проголосовали.');
    } else {
      showToast('Ошибка удаления: ' + msg);
    }
  }
}


//------
function closeModalWithCleanup(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.querySelectorAll('iframe').forEach(iframe => { iframe.src = 'about:blank'; });
    modal.classList.remove('open');
  }
}


// Вспомогательная функция для сбора упоминаний (из старого клиента)
function extractMentionedUsers(text) {
  const regex = /@([a-z][a-z0-9-]{1,14}[a-z0-9])/gi;
  const matches = text.matchAll(regex);
  const users = [];
  const seen = new Set();

  for (const match of matches) {
    const user = match[1].toLowerCase();
    if (user.includes('--')) continue;
    if (user === sessionAuth.username) continue;
    if (!seen.has(user)) {
      seen.add(user);
      users.push(user);
    }
  }
  return users;
}

// ========== РЕДАКТОР ПОСТОВ ==========
let editingPost = null; // Если null — новый пост, иначе объект с данными

// Автосохранение в localStorage
function saveDraftToStorage() {
  const title = document.getElementById('post-title').value;
  const body = document.getElementById('post-body').value;
  const tags = document.getElementById('post-tags').value;
  const category = document.getElementById('post-category').value;
  const payout = document.getElementById('post-payout').value;
  
  const draft = { title, body, tags, category, payout, savedAt: Date.now() };
  localStorage.setItem('golos_draft', JSON.stringify(draft));
}

function loadDraftFromStorage() {
  const raw = localStorage.getItem('golos_draft');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearDraftFromStorage() {
  localStorage.removeItem('golos_draft');
}

// Вызываем сохранение при вводе (с задержкой, чтобы не спамить)
let draftSaveTimer = null;
function triggerDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveDraftToStorage, 1000);
}

// Навешиваем слушатели на поля ввода (после загрузки DOM)
document.addEventListener('DOMContentLoaded', () => {
  const titleInput = document.getElementById('post-title');
  const bodyInput = document.getElementById('post-body');
  const tagsInput = document.getElementById('post-tags');
  const categorySelect = document.getElementById('post-category');
  const payoutSelect = document.getElementById('post-payout');

  [titleInput, bodyInput, tagsInput].forEach(el => {
    if (el) el.addEventListener('input', triggerDraftSave);
  });
  [categorySelect, payoutSelect].forEach(el => {
    if (el) el.addEventListener('change', triggerDraftSave);
  });
});

// Открытие редактора для НОВОГО поста
function openEditorForNewPost() {
  closeAllModals();
  editingPost = null;
  
    // Убедимся, что категории загружены
  const categorySelect = document.getElementById('post-category');
  if (categorySelect && categorySelect.options.length === 0) {
    initCategorySelect();
  }
  

  // Пытаемся загрузить черновик
  const draft = loadDraftFromStorage();
  
  if (draft) {
    document.getElementById('post-title').value = draft.title || '';
    document.getElementById('post-body').value = draft.body || '';
    document.getElementById('post-tags').value = draft.tags || '';
    if (draft.category) document.getElementById('post-category').value = draft.category;
    if (draft.payout) document.getElementById('post-payout').value = draft.payout;
    showToast('Загружен сохраненный черновик');
  } else {
    clearEditorFields();
  }

  switchPostTab('editor');
  document.getElementById('editor-modal').classList.add('open');
}

// Очистка всех полей
function clearEditorFields() {
  document.getElementById('post-title').value = '';
  document.getElementById('post-body').value = '';
  document.getElementById('post-tags').value = '';
  document.getElementById('post-category').selectedIndex = 0;
  document.getElementById('post-payout').value = '50';
  clearDraftFromStorage();
  editingPost = null;
}

// Кнопка "Очистить всё"
function clearEditorAll() {
  if (confirm('Очистить все поля и удалить черновик?')) {
    clearEditorFields();
    showToast('Редактор очищен');
  }
}

// Открытие редактора для РЕДАКТИРОВАНИЯ поста
async function editPost(author, permlink) {
  closeAllModals();
  
  try {
    const post = await golos.api.getContentAsync(author, permlink);
    if (!post) return showToast('Пост не найден');

    // Загружаем данные поста (перезаписываем черновик)
    document.getElementById('post-title').value = post.title || '';
    document.getElementById('post-body').value = post.body || '';
    
    const meta = parseMetadata(post.json_metadata);
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const category = tags[0] || 'ru--golos';
    const extraTags = tags.slice(1).join(', ');
    
    // Если категории нет в селекте, добавляем её
    const categorySelect = document.getElementById('post-category');
    if (!Array.from(categorySelect.options).some(opt => opt.value === category)) {
      const newOpt = document.createElement('option');
      newOpt.value = category;
      newOpt.textContent = category;
      categorySelect.appendChild(newOpt);
    }
    categorySelect.value = category;
    document.getElementById('post-tags').value = extraTags;

    editingPost = {
      author: post.author,
      permlink: post.permlink,
      parent_author: post.parent_author,
      parent_permlink: post.parent_permlink
    };

    switchPostTab('editor');
    document.getElementById('editor-modal').classList.add('open');
  } catch (err) {
    showToast('Ошибка загрузки поста: ' + err.message);
  }
}

function switchPostTab(tab) {
  const textarea = document.getElementById('post-body');
  const preview = document.getElementById('post-preview');
  const btnEditor = document.getElementById('post-tab-editor-btn');
  const btnPreview = document.getElementById('post-tab-preview-btn');

  if (tab === 'preview') {
    const htmlBody = renderMarkdownWithMedia(textarea.value);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlBody;

    processPostDOM(tempDiv, {
      onOpenPost: (a, p) => openPost(a, p),
      onOpenProfile: (u) => openAuthorProfile(u)
    });

    preview.innerHTML = tempDiv.innerHTML;
    
    // Восстанавливаем iframe
    preview.querySelectorAll('iframe[data-src]').forEach(iframe => {
      iframe.src = iframe.getAttribute('data-src');
      iframe.removeAttribute('data-src');
    });

    textarea.style.display = 'none';
    preview.style.display = 'block';
    btnPreview.classList.add('btn-primary');
    btnPreview.classList.remove('filter-btn');
    btnEditor.classList.add('filter-btn');
    btnEditor.classList.remove('btn-primary');
  } else {
    textarea.style.display = 'block';
    preview.style.display = 'none';
    btnEditor.classList.add('btn-primary');
    btnEditor.classList.remove('filter-btn');
    btnPreview.classList.add('filter-btn');
    btnPreview.classList.remove('btn-primary');
  }
}

function toggleEditorSettings() {
  const settings = document.getElementById('editor-settings');
  settings.style.display = settings.style.display === 'none' ? 'block' : 'none';
}

function insertPostMD(before, after) {
  const textarea = document.getElementById('post-body');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);
  textarea.value = text.substring(0, start) + before + selected + after + text.substring(end);
  textarea.focus();
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = start + before.length + selected.length;
  triggerDraftSave();
}

async function publishPost() {
  const title = document.getElementById('post-title').value.trim();
  const body = document.getElementById('post-body').value.trim();
  const category = document.getElementById('post-category').value;
  const extraTagsRaw = document.getElementById('post-tags').value.trim();
  const payoutMode = document.getElementById('post-payout').value;

  if (!title || !body) {
    showToast('Заполните заголовок и текст');
    return;
  }

  // Обработка тегов
  let tags = [category];
  if (extraTagsRaw) {
    const extraTags = extraTagsRaw.split(',').map(t => {
      let tag = t.trim().toLowerCase();
      if (/[а-яё]/i.test(tag)) {
        tag = 'ru--' + transliterate(tag).replace(/[^a-z0-9-]/g, '');
      } else {
        tag = tag.replace(/[^a-z0-9-]/g, '');
      }
      return tag;
    }).filter(t => t);
    tags = [...new Set([...tags, ...extraTags])];
  }
  tags = tags.filter(t => t && t !== '-' && t.length > 1);

  // Сбор картинок и ссылок
  const links = [];
  const images = [];
  const imgRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/gi;
  let match;
  while ((match = imgRegex.exec(body)) !== null) images.push(match[1].trim());
  
  const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
  while ((match = ytRegex.exec(body)) !== null) {
    links.push(`https://youtube.com/shorts/${match[1]}`);
    if (images.length === 0) images.push(`https://img.youtube.com/vi/${match[1]}/0.jpg`);
  }
  const scRegex = /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/gi;
  while ((match = scRegex.exec(body)) !== null) links.push(match[0]);
  if (images.length === 0) {
    const rawImgMatch = body.match(/(https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|gif|webp|svg)(?:\?[^\s"'<>]*)?)/i);
    if (rawImgMatch) images.push(rawImgMatch[1].trim());
  }

function transliterate(str) {
  const ru = 'щ ш ч ц й ё э ю я х ж а б в г д е з и к л м н о п р с т у ф ъ ы ь ґ є і ї'.split(' ');
  const en = 'shch sh ch cz ij yo ye yu ya kh zh a b v g d e z i k l m n o p r s t u f xx y x g e i i'.split(' ');
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i].toLowerCase();
    const index = ru.indexOf(char);
    if (index !== -1) {
      result += en[index];
    } else {
      result += char;
    }
  }
  return result;
}


  // Сбор упоминаний
  const mentionedUsers = extractMentionedUsers(body);

  //const metaObj = { tags: tags, app: 'golos.today/0.1', format: 'markdown' };  // mini-client/1.0
  const metaObj = { app: 'golos.today/0.1', format: 'markdown', tags: tags };
  if (images.length > 0) metaObj.image = images;
  if (links.length > 0) metaObj.links = links;
  if (mentionedUsers.length > 0) metaObj.users = mentionedUsers;
  const jsonMetadata = JSON.stringify(metaObj);

	//---фиксированный префикс пермлинка
  //let permlink = 'post-' + Date.now();
  
  //---транслитерация пермлинка из заголовка
    // Генерируем permlink из заголовка (транслит + очистка)
  let permlink = '';
  if (!editingPost) {
    // Транслитерируем заголовок
    let slug = transliterate(title)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') // Заменяем все не-буквы/цифры на дефисы
      .replace(/-+/g, '-')         // Убираем повторяющиеся дефисы
      .replace(/^-|-$/g, '');      // Убираем дефисы в начале и конце
    
    // Ограничиваем длину (например, до 50 символов)
    slug = slug.substring(0, 50).replace(/-$/, '');
    
    // Если получилось пусто, используем fallback
    permlink = slug || ('post-' + Date.now());
  } else {
    permlink = editingPost.permlink;
  }
  //---
  let parentAuthor = '';
  let parentPermlink = category;

  if (editingPost) {
    permlink = editingPost.permlink;
    parentAuthor = editingPost.parent_author;
    parentPermlink = editingPost.parent_permlink;
  }

  let percent_steem_dollars = 10000;
  let max_accepted_payout = '10000.000 GBG';
  
  if (payoutMode === '100') {
    percent_steem_dollars = 0;
  } else if (payoutMode === '0') {
    max_accepted_payout = '0.000 GBG';
  }

  const submitBtn = document.getElementById('post-submit-btn');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = 'Отправка...';
  submitBtn.disabled = true;
  document.getElementById('post-status').textContent = 'Отправка поста...';

  try {
    // Шаг 1: отправляем comment
    await golos.broadcast.commentAsync(
      sessionAuth.postingKey,
      parentAuthor, parentPermlink,
      sessionAuth.username,
      permlink,
      title, body, jsonMetadata
    );

    // Шаг 2: настройки выплат (только для нового поста)
    if (!editingPost) {
      await golos.broadcast.commentOptionsAsync(
        sessionAuth.postingKey,
        sessionAuth.username,
        permlink,
        max_accepted_payout,
        percent_steem_dollars,
        true, true, []
      );
    }

    document.getElementById('post-status').textContent = 'Успешно опубликовано!';
    document.getElementById('post-status').style.color = 'green';

    // Очищаем черновик после успешной публикации
    clearDraftFromStorage();

    setTimeout(() => {
      closeAllModals();
      if (editingPost) {
        openPost(editingPost.author, editingPost.permlink);
        editingPost = null;
      } else {
        switchFeed(currentFeed);
      }
      // Очищаем поля после публикации
      clearEditorFields();
    }, 1500);

  } catch (err) {
    document.getElementById('post-status').textContent = 'Ошибка: ' + (err.message || err);
    document.getElementById('post-status').style.color = 'red';
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

// ========== УПОМИНАНИЯ (прочитанные) ==========

function getReadMentions() {
  try {
    return JSON.parse(localStorage.getItem('golos_read_mentions') || '{}');
  } catch (e) { return {}; }
}

function markMentionAsRead(author, permlink) {
  const read = getReadMentions();
  read[`${author}/${permlink}`] = Date.now();
  localStorage.setItem('golos_read_mentions', JSON.stringify(read));
}

function cleanOldReadMentions() {
  const read = getReadMentions();
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  let changed = false;
  for (const key in read) {
    if (now - read[key] > oneWeek) {
      delete read[key];
      changed = true;
    }
  }
  if (changed) localStorage.setItem('golos_read_mentions', JSON.stringify(read));
}

function isMentionsEnabled() {
  return localStorage.getItem('golos_mentions_enabled') !== 'false';
}

function getMentionsPeriod() {
  const p = localStorage.getItem('golos_mentions_period');
  return p ? parseInt(p) : 24;
}

// ========== УПОМИНАНИЯ (ЛОГИКА) ==========

let currentMentionsList = [];

async function loadMentions() {
  if (!sessionAuth.username) return;
  if (!isMentionsEnabled()) {
    document.getElementById('mentions-list-container').innerHTML = '<p style="color:#777;">Уведомления отключены.</p>';
    return;
  }

  const periodHours = getMentionsPeriod();
  const dateLimit = new Date(Date.now() - periodHours * 60 * 60 * 1000);

  try {
    const history = await golos.api.getAccountHistoryAsync(sessionAuth.username, -1, 200);
    if (!history) return;

    const readList = getReadMentions();
    let rawMentions = [];

    history.forEach(item => {
      const tx = item[1];
      if (!tx || !tx.op) return;
      if (tx.op[0] !== 'comment') return;

      const opValue = tx.op[1];
      const postAuthor = opValue.author;
      const postPermlink = opValue.permlink;
      const parentAuthor = opValue.parent_author;
      const body = opValue.body || '';
      const created = tx.timestamp;

      const postDate = new Date(created + 'Z');
      if (postDate < dateLimit) return;
      if (postAuthor === sessionAuth.username) return; // Себя пропускаем

      let isMention = false;
      
      // Проверка метаданных
      try {
        const meta = parseMetadata(opValue.json_metadata);
        if (meta.users && Array.isArray(meta.users) && meta.users.includes(sessionAuth.username)) {
          isMention = true;
        }
      } catch (e) {}

      // Проверка текста
      if (!isMention) {
        const mentionRegex = new RegExp(`@${sessionAuth.username}\\b`, 'i');
        if (mentionRegex.test(body)) isMention = true;
      }

      // Ответ на мой пост
      if (parentAuthor === sessionAuth.username) isMention = true;

      if (isMention) {
        const id = `${postAuthor}/${postPermlink}`;
        const isRead = !!readList[id];

        rawMentions.push({
          author: postAuthor,
          permlink: postPermlink,
          parent_author: parentAuthor,
          parent_permlink: opValue.parent_permlink,
          root_author: opValue.root_author,
          root_permlink: opValue.root_permlink,
          title: opValue.title || '',
          body: body,
          created: created,
          isRead: isRead
        });
      }
    });

    // Дедупликация
    const uniqueMentions = {};
    rawMentions.forEach(m => {
      const key = `${m.author}/${m.permlink}`;
      if (!uniqueMentions[key] || new Date(m.created) > new Date(uniqueMentions[key].created)) {
        uniqueMentions[key] = m;
      }
    });

    let mentionsList = Object.values(uniqueMentions).sort((a, b) => new Date(b.created) - new Date(a.created));

    // Подтягиваем заголовки корневых постов
    const uniqueParentPosts = [...new Set(mentionsList.map(m => {
      const rAuthor = m.root_author || m.parent_author;
      const rPermlink = m.root_permlink || m.parent_permlink;
      return `${rAuthor}/${rPermlink}`;
    }))];

    const fetchTitles = uniqueParentPosts.map(key => {
      return new Promise((resolve) => {
        const [pAuthor, pPermlink] = key.split('/');
        if (!pPermlink || !pAuthor) { resolve({ key, title: 'Пост' }); return; }
        golos.api.getContent(pAuthor, pPermlink, (err, post) => {
          if (err || !post) resolve({ key, title: 'Пост не найден' });
          else resolve({ key, title: post.title || '(Без заголовка)' });
        });
      });
    });

    Promise.all(fetchTitles).then(titlesArray => {
      const titlesMap = {};
      titlesArray.forEach(item => titlesMap[item.key] = item.title);

      currentMentionsList = mentionsList.map(m => {
        const rAuthor = m.root_author || m.parent_author;
        const rPermlink = m.root_permlink || m.parent_permlink;
        const key = `${rAuthor}/${rPermlink}`;
        return {
          ...m,
          root_author: rAuthor,
          root_permlink: rPermlink,
          parent_title: titlesMap[key] || 'Пост',
          isComment: m.parent_author !== ''
        };
      });

      renderMentionsList();
      updateMentionsBadge();
    });

  } catch (err) {
    console.error('Ошибка загрузки упоминаний:', err);
  }
}

function renderMentionsList() {
  const container = document.getElementById('mentions-list-container');
  if (!container) return;

  if (!currentMentionsList || currentMentionsList.length === 0) {
    container.innerHTML = '<p style="color:#777;">Упоминаний пока нет.</p>';
    return;
  }

  container.innerHTML = currentMentionsList.map(m => {
    const safeTitle = escapeAttr(m.parent_title);
    let postHeader = '';
    if (m.isComment) {
      postHeader = `
        <div style="font-size: 12px; color: #777; margin-bottom: 5px;">
          💬 Комментарий к посту: 
          <span class="mention-in-text" onclick="closeAllModals(); openPost('${escapeAttr(m.root_author)}', '${escapeAttr(m.root_permlink)}')">${safeTitle}</span>
        </div>
      `;
    }
    const itemTitle = m.isComment ? `<span style="color: #2b7bba; font-weight: bold;">Ответ</span>` : `<span style="color: #2b7bba; font-weight: bold;">Пост</span>`;
    
    return `
      <div class="profile-post-item" style="padding: 10px; border-bottom: 1px solid #edf2f7; cursor: pointer; ${m.isRead ? 'opacity: 0.6;' : 'background: #f8fafc;'}" 
           onclick="handleMentionClick('${m.author}', '${m.permlink}')">
        ${postHeader}
        <h4 style="margin: 0 0 5px; font-size: 15px; color: #2b7bba;">
          ${itemTitle} от @${m.author}
        </h4>
        <div style="font-size: 13px; color: #777;">
          ${timeAgo(m.created)}
        </div>
      </div>
    `;
  }).join('');
}

function handleMentionClick(author, permlink) {
  markMentionAsRead(author, permlink);
  const mention = currentMentionsList.find(m => m.author === author && m.permlink === permlink);
  if (mention) mention.isRead = true;
  
  updateMentionsBadge();
  closeAllModals();
  openPost(author, permlink);

  // Убираем подсветку в ленте (если она открыта и это "Его" или "Мне")
  if (currentFeed === 'comments' && (commentSubMode === 'to_me' || commentSubMode === 'his')) {
    const card = document.querySelector(`.post-card[data-author="${author}"][data-permlink="${permlink}"]`);
    if (card) card.classList.remove('unread');
  }
}

function updateMentionsBadge() {
  const badge = document.getElementById('mentions-badge');
  if (!badge) return;
  
  const unreadCount = currentMentionsList.filter(m => !m.isRead).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}
function markAllMentionsAsRead() {
  if (!currentMentionsList || currentMentionsList.length === 0) return;
  const read = getReadMentions();
  currentMentionsList.forEach(m => {
    if (!m.isRead) {
      m.isRead = true;
      read[`${m.author}/${m.permlink}`] = Date.now();
    }
  });
  localStorage.setItem('golos_read_mentions', JSON.stringify(read));
  updateMentionsBadge();
  renderMentionsList();

  // Убираем подсветку во всей ленте комментариев (если открыта)
  if (currentFeed === 'comments' && (commentSubMode === 'to_me' || commentSubMode === 'his')) {
    document.querySelectorAll('.post-card.unread').forEach(card => card.classList.remove('unread'));
  }
}

function toggleMentionsSetting(enabled) {
  localStorage.setItem('golos_mentions_enabled', enabled ? 'true' : 'false');
  if (enabled) {
    loadMentions();
  } else {
    document.getElementById('mentions-list-container').innerHTML = '<p style="color:#777;">Уведомления отключены.</p>';
    updateMentionsBadge();
  }
}

function saveMentionsPeriod(val) {
  localStorage.setItem('golos_mentions_period', val);
  loadMentions();
}

// ========== LIVE-СТРИМ ==========
let liveStreamActive = false;

function toggleLiveStream(enabled) {
  localStorage.setItem('golos_mentions_live', enabled ? 'true' : 'false');
  
  if (enabled) {
    startLiveStream();
  } else {
    stopLiveStream();
  }
}

function isLiveStreamEnabled() {
  return localStorage.getItem('golos_mentions_live') === 'true';
}

let liveStreamRelease = null; // Для остановки стрима

function startLiveStream() {
  if (liveStreamActive || !sessionAuth.username) return;
  liveStreamActive = true;
  console.log('Live-стрим запущен');

  // Сохраняем функцию отписки
  liveStreamRelease = golos.api.streamOperations(async (err, operation) => {
    if (err) {
      console.error('Ошибка стрима:', err);
      return;
    }

    // operation — это кортеж [opType, opData]
    const [opType, opData] = operation;

    if (opType !== 'comment') return;

    // Это комментарий (не пост)
    if (opData.parent_author === '') return;

    const isToMe = opData.parent_author === sessionAuth.username;
    const hasMention = new RegExp(`@${sessionAuth.username}\\b`, 'i').test(opData.body || '');
    
    if (!isToMe && !hasMention) return;
    if (opData.author === sessionAuth.username) return;

    console.log('STREAM: комментарий для нас:', opData);

    try {
      // 1. Обновляем колокольчик
      await loadMentions();

      // 2. Добавляем в ленту "Комментарии" (если открыта)
      if (currentFeed === 'comments' && commentSubMode === 'to_me') {
        const existing = document.querySelector(`.post-card[data-author="${opData.author}"][data-permlink="${opData.permlink}"]`);
        if (!existing) {
          const fullPost = await golos.api.getContentAsync(opData.author, opData.permlink);
          if (fullPost) {
            const card = buildFeedCard(fullPost);
            feedContainer.insertBefore(card, feedContainer.firstChild);
            showToast(`Новый ответ от @${opData.author}`);
          }
        }
      }
    } catch (e) {
      console.warn('Ошибка обработки стрима:', e);
    }
  });
}

function stopLiveStream() {
  if (!liveStreamActive) return;
  liveStreamActive = false;
  
  if (liveStreamRelease) {
    liveStreamRelease(); // Отписываемся
    liveStreamRelease = null;
  }
  
  console.log('Live-стрим остановлен');
}



// Функция проверки новых комментариев (только для "Мне")
async function checkNewComments() {
  if (currentFeed !== 'comments' || commentSubMode !== 'to_me') return;
  if (!sessionAuth.username) return;

  try {
    const res = await golos.api.getRepliesByLastUpdateAsync(sessionAuth.username, '', 10);
    if (!res || res.length === 0) return;

    const existingKeys = new Set(
      Array.from(document.querySelectorAll('.post-card')).map(card => 
        `${card.dataset.author}/${card.dataset.permlink}`
      )
    );

    // Фильтруем: только те, что нет в DOM, и созданы недавно (например, за последние 10 минут)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const fresh = res.filter(item => {
      const key = `${item.author}/${item.permlink}`;
      const createdAt = new Date(item.created + 'Z').getTime();
      return !existingKeys.has(key) && item.author !== sessionAuth.username && createdAt > tenMinutesAgo;
    });

    if (fresh.length > 0) {
      const fragment = document.createDocumentFragment();
      fresh.reverse().forEach(item => {
        fragment.appendChild(buildFeedCard(item));
      });
      feedContainer.insertBefore(fragment, feedContainer.firstChild);
      
      showToast(`Новых ответов: ${fresh.length}`);
    }
  } catch (err) {
    console.warn('Ошибка проверки новых комментариев:', err);
  }
}
// Открытие модалки
document.getElementById('open-mentions-btn')?.addEventListener('click', () => {
  closeAllModals();
  document.getElementById('mentions-enabled-cb').checked = isMentionsEnabled();
  document.getElementById('mentions-period-select').value = getMentionsPeriod();
  document.getElementById('mentions-modal').classList.add('open');
  loadMentions();
});

restoreSession();
loadMoreFeed();

// Если пользователь авторизован, проверяем настройку Live
if (sessionAuth.username) {
  document.getElementById('mentions-live-cb').checked = isLiveStreamEnabled();
  if (isLiveStreamEnabled()) {
    startLiveStream();
  }
}