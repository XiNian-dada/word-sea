<?php
if (!defined('__TYPECHO_ROOT_DIR__')) exit;
$wordSeaConfig = wordsea_config($this);
$wordSeaScene = $wordSeaConfig['scene'];
$wordSeaIcon = [
  'pause' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
  'expand' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  'back' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg>',
];
?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="<?php $this->options->charset(); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#25182b">
  <title><?php $this->archiveTitle(['category'=>'分类 · %s','tag'=>'标签 · %s','search'=>'搜索 · %s','author'=>'作者 · %s'], '', ' · '); ?><?php echo wordsea_escape($this->options->title); ?></title>
  <link rel="stylesheet" href="<?php echo wordsea_asset('assets/css/theme.css'); ?>">
  <script type="importmap" data-wordsea-runtime><?php echo wordsea_import_map(); ?></script>
  <link rel="modulepreload" href="<?php echo wordsea_asset('assets/js/scene/app.js'); ?>">
  <?php $this->header('commentReply=&antiSpam='); ?>
  <noscript><style>.dock,.passage-tools,.weather-chip{display:none}</style></noscript>
</head>
<body class="<?php echo $wordSeaScene === 'article' ? 'article-mode' : ($wordSeaScene === 'friends' ? 'friends-mode' : ''); ?>">
  <main id="wordsea-scene" data-scene="<?php echo $wordSeaScene; ?>" aria-label="由多语言文字组成的动态海洋">
    <canvas id="scene-canvas" role="img" aria-label="海、sea、mer、mar 等文字写在起伏的海面上，天空与云层随时段和天气变化。"></canvas>
    <div class="scene-grade" aria-hidden="true"></div>

    <header class="masthead" data-home-ui>
      <a class="brand" href="<?php $this->options->siteUrl(); ?>" data-wordsea-link>
        <span class="brand-seal" aria-hidden="true">海</span>
        <span class="brand-text"><span class="brand-name"><?php echo wordsea_escape($this->options->title); ?></span><span class="brand-tagline"><?php echo wordsea_escape($this->options->description); ?></span></span>
      </a>
      <button id="weather-open" class="weather-chip" type="button" aria-haspopup="dialog" aria-controls="weather-dialog"><span class="weather-glyph" aria-hidden="true"></span><span id="weather-summary">让字海跟随天气</span></button>
    </header>

    <section class="hero" data-home-ui aria-label="首页短句">
      <p class="hero-kicker">24 种语言 · 同一片海</p>
      <p class="hero-line"><?php echo wordsea_escape($this->options->wordSeaCaption ?: '语言有边界，海没有。'); ?></p>
      <p class="hero-hint" id="hint">移动鼠标探索 · 点击海面泛起涟漪</p>
    </section>

    <nav class="journal" id="journal" aria-label="文章列表" data-home-ui><?php $this->need('journal.php'); ?></nav>

    <div class="dock controls" role="group" aria-label="海洋设置" data-home-ui>
      <button class="dock-icon" id="play" type="button" data-action="pause" aria-label="暂停动画" aria-pressed="false" title="暂停 / 继续（空格）"><?php echo $wordSeaIcon['pause']; ?></button>
      <button class="sea-settings-open" id="sea-settings-open" type="button" aria-haspopup="dialog" aria-controls="sea-settings-dialog" aria-expanded="false"><span id="theme-current">海洋设置</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></svg></button>
      <div class="themes" role="group" aria-label="时段">
        <?php foreach (['daybreak'=>'破晓','morning'=>'清晨','noon'=>'正午','afternoon'=>'午后','sunset'=>'夕照','night'=>'月夜'] as $wordSeaKey => $wordSeaLabel): ?>
          <button class="theme" type="button" data-theme="<?php echo $wordSeaKey; ?>" aria-pressed="false"><?php echo $wordSeaLabel; ?></button>
        <?php endforeach; ?>
        <button class="theme" type="button" data-theme="auto" aria-pressed="false" title="跟随本地时间">自动</button>
      </div>
      <div class="range-group"><label for="wind">风浪</label><input id="wind" type="range" min="0" max="100" value="<?php echo $wordSeaConfig['wind']; ?>"><output id="wind-value" for="wind"><?php echo $wordSeaConfig['wind']; ?>%</output></div>
      <div class="range-group"><label for="density">字密度</label><input id="density" type="range" min="30" max="100" value="<?php echo $wordSeaConfig['density']; ?>"><output id="density-value" for="density"><?php echo $wordSeaConfig['density']; ?>%</output></div>
      <button class="dock-toggle" id="clouds" type="button" aria-pressed="true" title="显示 / 隐藏文字云"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 18a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.5 1.4A3.8 3.8 0 1 1 18 18Z"/></svg><span>云</span></button>
      <button class="dock-icon" id="immersive" type="button" data-action="immersive" aria-label="进入沉浸模式" title="沉浸模式（H）"><?php echo $wordSeaIcon['expand']; ?></button>
    </div>
    <dialog class="sea-settings-dialog" id="sea-settings-dialog" aria-labelledby="sea-settings-heading">
      <div class="sheet-heading"><h2 id="sea-settings-heading">让海，换一种心情</h2><button class="sheet-close sea-settings-close" type="button" aria-label="关闭海洋设置">×</button></div>
      <div class="sea-settings-body"></div>
    </dialog>
    <button class="dock-icon restore" id="restore" type="button" data-action="restore" aria-label="退出沉浸模式" title="显示控制（H / Esc）"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg></button>

    <section class="article-view" id="article-view" aria-label="文章阅读"<?php if ($wordSeaScene !== 'article'): ?> hidden inert<?php endif; ?>>
      <div class="reading-progress" id="reading-progress" role="progressbar" aria-label="正文阅读进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span class="reading-progress-fill" aria-hidden="true"></span></div>
      <nav class="passage-nav" aria-label="阅读导航">
        <a class="pill-link passage-back" id="back-sea" href="<?php $this->options->siteUrl(); ?>" data-wordsea-link><?php echo $wordSeaIcon['back']; ?><span>返回字海</span></a>
        <span class="passage-name">语廊 · BETWEEN THE WORDS</span>
        <div class="passage-tools">
          <button class="pick-entry" id="pick-quote" type="button" title="点击两侧高墙也可拾句">拾一句</button>
          <button class="dock-icon" id="passage-play" type="button" data-action="pause" aria-label="暂停动画" aria-pressed="false" title="暂停 / 继续（空格）"><?php echo $wordSeaIcon['pause']; ?></button>
          <button class="dock-icon" id="passage-immersive" type="button" data-action="immersive" aria-label="只看文字长廊" title="只看文字长廊（H）"><?php echo $wordSeaIcon['expand']; ?></button>
        </div>
      </nav>
      <nav class="reading-toc" id="reading-toc" aria-label="文章目录" hidden>
        <button class="reading-toc-toggle" type="button" aria-label="展开文章目录" aria-expanded="false" aria-controls="reading-toc-list" title="文章目录"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></button>
        <div class="reading-toc-panel"><p class="reading-toc-label">沿着章节前行</p><ol class="reading-toc-list" id="reading-toc-list"></ol></div>
      </nav>
      <div class="article-scroll" id="article-scroll" tabindex="0" aria-label="文章正文"><article class="article-text" id="article-text"><?php $this->need('article.php'); ?></article></div>
      <p class="passage-foot">点击两侧高墙，拾起一句话</p>
    </section>

    <section class="friends-view" id="friends-view" aria-label="友链 · 海上灯火"<?php if ($wordSeaScene !== 'friends'): ?> hidden inert<?php endif; ?>>
      <nav class="passage-nav" aria-label="友链导航">
        <a class="pill-link passage-back" id="back-friends" href="<?php $this->options->siteUrl(); ?>" data-wordsea-link><?php echo $wordSeaIcon['back']; ?><span>返回字海</span></a>
        <span class="passage-name">FRIENDS ACROSS THE SEA</span>
        <div class="passage-tools">
          <button class="dock-icon" id="friends-play" type="button" data-action="pause" aria-label="暂停动画" aria-pressed="false" title="暂停 / 继续（空格）"><?php echo $wordSeaIcon['pause']; ?></button>
          <button class="dock-icon" id="friends-immersive" type="button" data-action="immersive" aria-label="只看海上灯火" title="只看海上灯火（H）"><?php echo $wordSeaIcon['expand']; ?></button>
        </div>
      </nav>
      <div class="friends-intro"><p class="friends-eyebrow">LINKS · 彼此照亮的地方</p><h1 id="friends-heading" tabindex="-1">海上灯火</h1><p>隔着海，仍能看见彼此。</p></div>
      <div class="friend-list" id="friend-list" role="list" aria-label="友链"><?php $this->need('friends-content.php'); ?></div>
      <div class="friends-foot" id="friends-foot">共 <?php echo $wordSeaConfig['friendsCount']; ?> 盏灯<span class="friends-hint"> · 悬停或聚焦，让光落进字浪</span></div>
      <nav class="friends-pagination" id="friends-pagination" aria-label="友链分页">
        <?php if ($wordSeaScene === 'friends' && $wordSeaConfig['friendsPages'] > 1): ?>
          <?php if ($wordSeaConfig['friendsPage'] > 1): ?><a data-wordsea-link href="<?php echo wordsea_escape(wordsea_friends_page_url($this, $wordSeaConfig['friendsPage'] - 1)); ?>">← 前一片灯火</a><?php endif; ?>
          <span><?php echo $wordSeaConfig['friendsPage']; ?> / <?php echo $wordSeaConfig['friendsPages']; ?></span>
          <?php if ($wordSeaConfig['friendsPage'] < $wordSeaConfig['friendsPages']): ?><a data-wordsea-link href="<?php echo wordsea_escape(wordsea_friends_page_url($this, $wordSeaConfig['friendsPage'] + 1)); ?>">下一片灯火 →</a><?php endif; ?>
        <?php endif; ?>
      </nav>
    </section>

    <div class="scene-error" id="error" role="status" hidden><p>动态背景暂时不可用，文章仍可阅读。</p></div>
    <footer class="site-footer" id="site-footer" data-home-ui><?php echo wordsea_escape($this->options->wordSeaFooter); ?> <a href="<?php $this->options->feedUrl(); ?>">RSS</a></footer>
    <div id="site-status" role="status" aria-live="polite"></div>
  </main>
  <script id="wordsea-config" type="application/json"><?php echo wordsea_json($wordSeaConfig); ?></script>
  <script data-wordsea-runtime src="<?php echo wordsea_asset('assets/collect-data.js'); ?>"></script>
  <script data-wordsea-runtime data-manual src="<?php echo wordsea_asset('assets/vendor/prism.js'); ?>"></script>
  <script data-wordsea-runtime type="module" src="<?php echo wordsea_asset('assets/js/main.js'); ?>"></script>
  <?php $this->footer(); ?>
</body>
</html>
