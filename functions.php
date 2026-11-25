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
    ], 'auto', '字海天气', '天气使用 Open-Meteo。IP 估算使用 GeoJS，可能有位置偏差；访客可以更换城市或主动授权浏览器定位。天气接口不可用时沿用原有字海。'));
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
    $positions = [[.10,.60], [.39,.61], [.90,.59], [.055,.90], [.37,.90], [.93,.90]];
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
        'friendsPage' => $page, 'friendsPages' => $pages,
        // Loaded on demand by highlight.js / math.js, only for articles that use them.
        'prism' => wordsea_asset_url('assets/vendor/prism.js'),
        'katex' => [
            'js' => wordsea_asset_url('assets/vendor/katex/katex.min.js'),
            'css' => wordsea_asset_url('assets/vendor/katex/katex.min.css'),
        ]
    ];
}

function wordsea_json($value)
{
    return json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function wordsea_lazy_images($html)
{
    // The first image may be the first thing a reader sees, so only later ones wait for the scroll.
    $index = 0;
    return preg_replace_callback('/<img\b(?![^>]*\bloading=)[^>]*>/i', function ($match) use (&$index) {
        $tag = $match[0];
        if ($index++ === 0) return $tag;
        $attributes = ' loading="lazy"' . (stripos($tag, 'decoding=') === false ? ' decoding="async"' : '');
        return preg_replace('/^<img\b/i', '<img' . $attributes, $tag);
    }, $html);
}

function wordsea_callout_block($inner, $types, $icons, $chevron)
{
    $trimmed = ltrim($inner);
    $hasP = (bool) preg_match('/^<p\b[^>]*>(.*?)<\/p>\s*(.*)$/is', $trimmed, $pm);
    $first = $hasP ? ltrim($pm[1]) : $trimmed;
    $rest = $hasP ? $pm[2] : '';

    if (!preg_match('/^\[!([a-z]+)\]([+-])?(?=$|\s|<br\b)(.*)$/is', $first, $mm)) {
        return null;
    }
    $key = strtolower($mm[1]);
    if (!isset($types[$key])) {
        return null;
    }

    $meta = $types[$key];
    $kind = $meta['kind'];
    $fold = $mm[2];
    $after = $mm[3];
    if (preg_match('/^(.*?)(?:<br\s*\/?>|\r?\n)(.*)$/is', $after, $lm)) {
        $head = trim($lm[1]);
        $tail = ltrim($lm[2]);
    } else {
        $head = trim($after);
        $tail = '';
    }

    if ($hasP) {
        $body = ($tail !== '' ? '<p>' . $tail . '</p>' : '') . trim($rest);
    } else {
        $body = trim($tail);
    }

    if ($body === '' && $head !== '' && $fold === '') {
        $titleHtml = $meta['label'];
        $body = '<p>' . $head . '</p>';
    } else {
        $titleHtml = $head !== '' ? $head : $meta['label'];
        if (!$hasP && $body !== '' && !preg_match('/^<(?:p|ul|ol|blockquote|pre|div|table|h[1-6]|hr|details|figure)\b/i', $body)) {
            $body = '<p>' . $body . '</p>';
        }
    }

    $iconHtml = '<span class="callout-icon" aria-hidden="true">' . $icons[$kind] . '</span>';
    $bodyHtml = $body !== '' ? '<div class="callout-body">' . $body . '</div>' : '';
    if ($fold !== '') {
        $openAttr = $fold === '+' ? ' open' : '';
        return '<details class="callout callout-' . $kind . ' callout-foldable" data-callout="' . $kind . '"' . $openAttr . '>'
            . '<summary class="callout-title">' . $iconHtml . '<span class="callout-label">' . $titleHtml . '</span>' . $chevron . '</summary>'
            . $bodyHtml . '</details>';
    }
    return '<blockquote class="callout callout-' . $kind . '" data-callout="' . $kind . '">'
        . '<div class="callout-title">' . $iconHtml . '<span class="callout-label">' . $titleHtml . '</span></div>'
        . $bodyHtml . '</blockquote>';
}

/**
 * Turn GitHub / Obsidian alert blockquotes (`> [!WARNING]`, `> [!NOTE]`, etc.)
 * into styled semantic callouts while leaving code blocks and regular quotes intact.
 */
function wordsea_callouts($html)
{
    if (!is_string($html) || stripos($html, '<blockquote') === false || strpos($html, '[!') === false) {
        return $html;
    }
    static $types = [
        'note'      => ['kind' => 'note',      'label' => '备注'],
        'info'      => ['kind' => 'note',      'label' => '说明'],
        'abstract'  => ['kind' => 'note',      'label' => '摘要'],
        'summary'   => ['kind' => 'note',      'label' => '摘要'],
        'tip'       => ['kind' => 'tip',       'label' => '提示'],
        'hint'      => ['kind' => 'tip',       'label' => '提示'],
        'success'   => ['kind' => 'tip',       'label' => '完成'],
        'check'     => ['kind' => 'tip',       'label' => '完成'],
        'done'      => ['kind' => 'tip',       'label' => '完成'],
        'important' => ['kind' => 'important', 'label' => '重要'],
        'attention' => ['kind' => 'important', 'label' => '重要'],
        'warning'   => ['kind' => 'warning',   'label' => '警告'],
        'warn'      => ['kind' => 'warning',   'label' => '警告'],
        'caution'   => ['kind' => 'caution',   'label' => '警示'],
        'danger'    => ['kind' => 'caution',   'label' => '危险'],
        'error'     => ['kind' => 'caution',   'label' => '错误'],
        'bug'       => ['kind' => 'caution',   'label' => '故障'],
        'fail'      => ['kind' => 'caution',   'label' => '失败'],
        'failure'   => ['kind' => 'caution',   'label' => '失败'],
    ];
    static $icons = [
        'note'      => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 7.2v3.6"/><circle cx="8" cy="5.1" r=".6" fill="currentColor" stroke="none"/></svg>',
        'tip'       => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.2 12.2h3.6M6.8 14h2.4M5.4 10.2c-.8-.8-1.4-1.8-1.4-3.1a4 4 0 1 1 8 0c0 1.3-.6 2.3-1.4 3.1-.4.4-.6.9-.6 1.5v.5H6v-.5c0-.6-.2-1.1-.6-1.5Z"/></svg>',
        'important' => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.2 3.2A1.2 1.2 0 0 1 3.4 2h9.2a1.2 1.2 0 0 1 1.2 1.2v6.6a1.2 1.2 0 0 1-1.2 1.2H6.4L3.2 13.6V11h-.2a1.2 1.2 0 0 1-.8-1.2V3.2Z"/><path d="M8 4.8v3"/><circle cx="8" cy="9.55" r=".6" fill="currentColor" stroke="none"/></svg>',
        'warning'   => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.15 2.45a1 1 0 0 1 1.7 0l5.3 9.2A1 1 0 0 1 13.3 13.15H2.7a1 1 0 0 1-.85-1.5l5.3-9.2Z"/><path d="M8 6.1v3.2"/><circle cx="8" cy="11.15" r=".6" fill="currentColor" stroke="none"/></svg>',
        'caution'   => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.4 2h5.2L14 5.4v5.2L10.6 14H5.4L2 10.6V5.4L5.4 2Z"/><path d="M8 5.2v3.5"/><circle cx="8" cy="10.8" r=".6" fill="currentColor" stroke="none"/></svg>',
    ];
    static $chevron = '<svg class="callout-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.25 9.75 8 6 11.75"/></svg>';

    $pattern = '~<(pre|code|script|style)\b[^>]*>.*?</\1\s*>|<blockquote\b[^>]*>|</blockquote>~is';
    if (!preg_match_all($pattern, $html, $matches, PREG_OFFSET_CAPTURE)) {
        return $html;
    }

    $out = '';
    $cursor = 0;
    $depth = 0;
    $openStart = 0;
    $openTag = '';
    $innerStart = 0;

    foreach ($matches[0] as $match) {
        $token = $match[0];
        $pos = $match[1];
        $lower = strtolower(substr($token, 0, 13));
        if (strpos($lower, '<blockquote') === 0) {
            if ($depth === 0) {
                $openStart = $pos;
                $openTag = $token;
                $innerStart = $pos + strlen($token);
            }
            $depth++;
            continue;
        }
        if ($lower === '</blockquote>') {
            if ($depth === 0) continue;
            $depth--;
            if ($depth > 0) continue;

            $out .= substr($html, $cursor, $openStart - $cursor);
            $inner = wordsea_callouts(substr($html, $innerStart, $pos - $innerStart));
            $cursor = $pos + strlen($token);

            // Typecho's HyperDown merges adjacent `>` blocks separated only by a blank line into one <blockquote>.
            // Split top-level `<p>[!TYPE]` boundaries so consecutive callouts render as separate cards.
            $splits = [];
            $splitPattern = '~<(pre|code|script|style)\b[^>]*>.*?</\1\s*>|<blockquote\b[^>]*>|</blockquote>|<details\b[^>]*>|</details>|<p\b[^>]*>\s*\[!([a-z]+)\][+-]?(?=$|\s|<br\b)~is';
            if (preg_match_all($splitPattern, $inner, $sm, PREG_OFFSET_CAPTURE)) {
                $nest = 0;
                foreach ($sm[0] as $i => $sMatch) {
                    $sTok = $sMatch[0];
                    $sLow = strtolower(substr($sTok, 0, 13));
                    if (strpos($sLow, '<blockquote') === 0 || strpos($sLow, '<details') === 0) {
                        $nest++;
                    } elseif ($sLow === '</blockquote>' || strpos($sLow, '</details>') === 0) {
                        $nest = max(0, $nest - 1);
                    } elseif ($nest === 0 && isset($sm[2][$i][0]) && $sm[2][$i][0] !== '' && isset($types[strtolower($sm[2][$i][0])])) {
                        $splits[] = $sMatch[1];
                    }
                }
            }

            if ($splits && ($splits[0] > 0 || count($splits) > 1)) {
                $points = $splits[0] > 0 ? array_merge([0], $splits) : $splits;
                $count = count($points);
                for ($i = 0; $i < $count; $i++) {
                    $segStart = $points[$i];
                    $segEnd = $i + 1 < $count ? $points[$i + 1] : strlen($inner);
                    $chunk = trim(substr($inner, $segStart, $segEnd - $segStart));
                    if ($chunk === '') continue;
                    $block = wordsea_callout_block($chunk, $types, $icons, $chevron);
                    $out .= $block !== null ? $block : ($openTag . $chunk . $token);
                }
            } else {
                $rendered = wordsea_callout_block($inner, $types, $icons, $chevron);
                $out .= $rendered !== null ? $rendered : ($openTag . $inner . $token);
            }
        }
    }

    $out .= substr($html, $cursor);
    return $out;
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
