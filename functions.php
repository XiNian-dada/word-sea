<?php
if (!defined('__TYPECHO_ROOT_DIR__')) exit;

function themeConfig($form)
{
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Select('wordSeaTime', [
        'auto' => '跟随访客本地时间', 'daybreak' => '破晓', 'morning' => '清晨',
        'noon' => '正午', 'afternoon' => '午后', 'sunset' => '夕照', 'night' => '月夜'
    ], 'auto', '默认光线'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Select('wordSeaWeather', [
        'auto' => '开启，按访客 IP 估算城市', 'city' => '开启，访客自行选择城市', 'off' => '默认关闭'
    ], 'auto', '字海天气', '天气使用 Open-Meteo。IP 估算使用 ipwho.is，可能有位置偏差；访客可以更换城市或主动授权浏览器定位。天气接口不可用时沿用原有字海。'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Text('wordSeaWeatherCity', null, '', '默认天气城市', '选填，例如 成都、上海、Singapore。未保存城市的访客优先使用此城市；访客仍可自行更换。'));
    $form->addInput((new \Typecho\Widget\Helper\Form\Element\Text('wordSeaWind', null, '45', '默认风浪（0–100）'))->addRule('wordsea_wind_valid', '请填写 0–100 的整数'));
    $form->addInput((new \Typecho\Widget\Helper\Form\Element\Text('wordSeaDensity', null, '95', '默认字密度（30–100）'))->addRule('wordsea_density_valid', '请填写 30–100 的整数'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Text('wordSeaCaption', null, '语言有边界，海没有。', '首页短句'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Text('wordSeaSignature', null, '写于这片字海。', '文章落款短句', '显示在文章末尾的作者姓名下方；作者姓名使用文章的真实作者。留空使用默认短句，填写 - 可隐藏整个落款。纯文字。'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Select('wordSeaFreshness', [
        '90' => '最后更新超过 90 天', '180' => '最后更新超过 180 天',
        '365' => '最后更新超过 365 天', '0' => '关闭提醒'
    ], '180', '文章时效提醒', '以最后更新时间为准。预计阅读时长和更新日期仍会显示。'));
    $friends = new \Typecho\Widget\Helper\Form\Element\Textarea('wordSeaFriends', null, wordsea_json(wordsea_default_friends()), '友链管理', '填写名称和完整网址，简介、头像可留空。可新增、删除或调整顺序，最后点击页面底部「保存设置」。超过六条自动分页。');
    $friends->input->setAttribute('data-wordsea-friends', '');
    $editor = new \Typecho\Widget\Helper\Layout('div', [
        'class' => 'wordsea-friends-editor',
        'data-defaults' => wordsea_escape(wordsea_json(wordsea_default_friends()))
    ]);
    $friends->container($editor);
    $fallback = new \Typecho\Widget\Helper\Layout('noscript');
    $friends->container($fallback->html('<p class="description">当前浏览器未启用 JavaScript，可直接编辑上方 JSON。每项填写 name、url，description 和 avatar 选填。留空使用预置友链，填写 [] 表示空列表。</p>'));
    $friends->container(new \Typecho\Widget\Helper\Layout('link', [
        'rel' => 'stylesheet', 'href' => wordsea_asset('assets/admin.css')
    ]));
    $script = new \Typecho\Widget\Helper\Layout('script', [
        'src' => wordsea_asset('assets/admin.js'), 'defer' => 'defer'
    ]);
    $friends->container($script->setClose(false));
    $form->addInput($friends->addRule('wordsea_friends_valid', '友链名称不能为空，网址及头像须为有效的 http/https 地址；JSON 模式下请填写数组'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Radio('wordSeaMissing', ['1' => '开启', '0' => '关闭'], '1', '404 公益寻人', '404 页面随机展示一条「宝贝回家」的寻人信息，由访客浏览器经盒盖 API 获取；接口不可用时只显示页面未找到。'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Radio('wordSeaAjax', ['1' => '开启', '0' => '关闭，使用普通页面跳转'], '1', '场景转场', '含额外脚本的插件页面会自动使用普通跳转，以保留插件行为。'));
    $form->addInput(new \Typecho\Widget\Helper\Form\Element\Text('wordSeaFooter', null, '', '页脚文字', '纯文字，例如版权说明或备案号。'));
}

/** Theme file URL with its modification time, so every edit busts caches by itself. */
function wordsea_asset($path)
{
    return wordsea_escape(wordsea_asset_url($path));
}

function wordsea_asset_url($path)
{
    $options = \Widget\Options::alloc();
    $file = __DIR__ . '/' . ltrim($path, '/');
    $version = is_file($file) ? (string) filemtime($file) : '0';
    // themeUrl() echoes its result unless it is given a theme name; this form returns it.
    return $options->themeUrl($path, $options->theme) . '?v=' . $version;
}

/**
 * Import map from every script module to its versioned URL. Relative imports
 * drop the entry's ?v=, so without it an update could pair a fresh main.js
 * with stale cached modules.
 */
function wordsea_import_map()
{
    $options = \Widget\Options::alloc();
    $root = __DIR__ . '/assets/js/';
    $imports = [];
    foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)) as $file) {
        if ($file->getExtension() !== 'js') continue;
        $path = 'assets/js/' . str_replace('\\', '/', substr($file->getPathname(), strlen($root)));
        $imports[$options->themeUrl($path, $options->theme)] = wordsea_asset_url($path);
    }
    ksort($imports);
    return wordsea_json(['imports' => $imports]);
}

function wordsea_escape($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function wordsea_title_escape($value)
{
    // Typecho content titles are already escaped when saved; keep valid entities intact.
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', false);
}

function wordsea_url($value)
{
    $value = trim((string) $value);
    if (!filter_var($value, FILTER_VALIDATE_URL)) return '';
    $parts = parse_url($value);
    return isset($parts['scheme'], $parts['host']) && in_array(strtolower($parts['scheme']), ['https', 'http'], true)
        && !isset($parts['user']) && !isset($parts['pass']) ? $value : '';
}

function wordsea_scene($archive)
{
    if ($archive->is('page') && $archive->template === 'friends.php' && !$archive->hidden) return 'friends';
    return $archive->is('single') ? 'article' : 'sea';
}

/** Typecho files a missing page as an archive with the slug 404, so is('404') never matches it. */
function wordsea_is_404($archive)
{
    return $archive->getArchiveType() === 'archive' && (string) $archive->getArchiveSlug() === '404';
}

function wordsea_pages()
{
    static $rows;
    if ($rows !== null) return $rows;
    $rows = [];
    \Widget\Contents\Page\Rows::alloc()->to($pages);
    while ($pages->next()) {
        $rows[] = ['title' => (string) $pages->title, 'url' => (string) $pages->permalink, 'friends' => $pages->template === 'friends.php'];
    }
    return $rows;
}

function wordsea_default_friends()
{
    static $rows;
    if ($rows === null) {
        $path = __DIR__ . '/friends.json';
        $decoded = is_readable($path) ? json_decode((string) file_get_contents($path), true) : null;
        $rows = is_array($decoded) ? $decoded : [];
    }
    return $rows;
}

function wordsea_friends($options)
{
    $value = trim((string) $options->wordSeaFriends);
    $raw = $value === '' ? wordsea_default_friends() : json_decode($value, true);
    if (!is_array($raw)) return [];
    $colors = [[255,204,135], [153,221,203], [219,196,255], [148,203,255], [255,175,188], [255,224,163]];
    $positions = [[.10,.63], [.44,.64], [.88,.61], [.055,.89], [.40,.86], [.92,.89]];
    $rows = [];
    foreach ($raw as $item) {
        if (!is_array($item) || !isset($item['name'], $item['url']) || !is_string($item['name']) || !is_string($item['url'])) continue;
        $url = wordsea_url($item['url']); $name = trim($item['name']);
        if ($url === '' || $name === '') continue;
        $i = count($rows) % 6;
        $rows[] = [
            'name' => $name, 'href' => $url,
            'note' => isset($item['description']) && is_string($item['description']) ? $item['description'] : '',
            'avatar' => isset($item['avatar']) && is_string($item['avatar']) ? wordsea_url($item['avatar']) : '',
            'color' => $colors[$i], 'at' => $positions[$i]
        ];
    }
    return $rows;
}

function wordsea_config($archive)
{
    // The layout and the friends list both ask; the page is the same object.
    static $cache = [];
    $key = spl_object_id($archive);
    if (isset($cache[$key])) return $cache[$key];
    $options = \Widget\Options::alloc(); $friendsUrl = '';
    foreach (wordsea_pages() as $page) { if ($page['friends']) { $friendsUrl = $page['url']; break; } }
    $all = wordsea_friends($options); $pages = max(1, (int) ceil(count($all) / 6));
    $page = max(1, min($pages, (int) $archive->request->get('friends_page', 1)));
    $theme = (string) $options->wordSeaTime;
    if (!in_array($theme, ['auto','daybreak','morning','noon','afternoon','sunset','night'], true)) $theme = 'auto';
    $scene = wordsea_scene($archive);
    return $cache[$key] = [
        'scene' => $scene, 'homeUrl' => (string) $options->siteUrl,
        'friendsUrl' => $friendsUrl, 'siteTitle' => (string) $options->title,
        'theme' => $theme,
        'weather' => ['mode' => in_array((string) $options->wordSeaWeather, ['auto','city','off'], true) ? (string) $options->wordSeaWeather : 'auto', 'city' => mb_substr(trim((string) $options->wordSeaWeatherCity), 0, 80, 'UTF-8')],
        'wind' => max(0, min(100, is_numeric($options->wordSeaWind) ? (int) $options->wordSeaWind : 45)),
        'density' => max(30, min(100, is_numeric($options->wordSeaDensity) ? (int) $options->wordSeaDensity : 95)),
        'ajax' => (string) $options->wordSeaAjax !== '0',
        'friends' => $scene === 'friends' ? array_slice($all, ($page - 1) * 6, 6) : [], 'friendsCount' => count($all),
        'friendsPage' => $page, 'friendsPages' => $pages
    ];
}

function wordsea_json($value)
{
    return json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function wordsea_reading_minutes($html)
{
    // Estimate rendered text once: CJK characters at 300/min, other words at 200/min.
    $text = preg_replace('~<(script|style|svg|iframe)\b[^>]*>.*?</\1\s*>~is', ' ', (string) $html);
    $text = preg_replace('~</?(?:p|div|section|article|h[1-6]|li|ul|ol|blockquote|pre|tr|td|th|br|hr)\b[^>]*>~i', ' ', $text);
    $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5 | ENT_SUBSTITUTE, 'UTF-8');
    $cjk = '/[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]/u';
    $characters = preg_match_all($cjk, $text);
    $other = preg_replace($cjk, ' ', $text);
    $words = preg_match_all('/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[\x{2019}\x{0027}-][\p{L}\p{M}\p{N}]+)*/u', (string) $other);
    return max(1, (int) ceil((int) $characters / 300 + (int) $words / 200));
}

function wordsea_article_info($archive, $html, $freshness = '180', $now = null)
{
    if (!$archive->is('post') || $archive->hidden) return null;
    $updated = max((int) $archive->created, (int) $archive->modified);
    $date = new \Typecho\Date($updated);
    $days = max(0, (int) floor((($now === null ? \Typecho\Date::time() : $now) - $updated) / 86400));
    $value = (string) $freshness;
    $threshold = in_array($value, ['0', '90', '180', '365'], true) ? (int) $value : 180;
    return [
        'minutes' => wordsea_reading_minutes($html),
        'updated' => $date->format('Y.m.d'), 'datetime' => $date->format('Y-m-d'),
        'days' => $days, 'stale' => $threshold > 0 && $days >= $threshold
    ];
}

function wordsea_friends_page_url($archive, $page)
{
    $url = (string) $archive->permalink;
    return $url . (strpos($url, '?') === false ? '?' : '&') . 'friends_page=' . (int) $page;
}

function wordsea_wind_valid($value) { return filter_var($value, FILTER_VALIDATE_INT) !== false && $value >= 0 && $value <= 100; }
function wordsea_density_valid($value) { return filter_var($value, FILTER_VALIDATE_INT) !== false && $value >= 30 && $value <= 100; }
function wordsea_friends_valid($value)
{
    if (trim((string) $value) === '') return true;
    $items = json_decode($value, true);
    if (!is_array($items) || ($items && array_keys($items) !== range(0, count($items) - 1))) return false;
    foreach ($items as $item) {
        if (!is_array($item) || !isset($item['name'], $item['url']) || !is_string($item['name']) || trim($item['name']) === '' || !is_string($item['url']) || wordsea_url($item['url']) === '') return false;
        if (isset($item['description']) && !is_string($item['description'])) return false;
        if (isset($item['avatar']) && (!is_string($item['avatar']) || ($item['avatar'] !== '' && wordsea_url($item['avatar']) === ''))) return false;
    }
    return true;
}
