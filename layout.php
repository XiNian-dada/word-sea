<?php
if (!defined('__TYPECHO_ROOT_DIR__')) exit;
$wordSeaConfig = wordsea_config($this);
?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="<?php $this->options->charset(); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#150f21">
  <title><?php $this->archiveTitle(['category'=>'分类 · %s','tag'=>'标签 · %s','search'=>'搜索 · %s','author'=>'作者 · %s'], '', ' · '); ?><?php echo wordsea_escape($this->options->title); ?></title>
  <link rel="stylesheet" href="<?php $this->options->themeUrl('assets/scene.css?v=0.3.9'); ?>">
  <link rel="stylesheet" href="<?php $this->options->themeUrl('assets/blog.css?v=0.3.8'); ?>">
  <link rel="stylesheet" href="<?php $this->options->themeUrl('assets/weather.css?v=0.3.0'); ?>">
  <link rel="stylesheet" href="<?php $this->options->themeUrl('assets/responsive.css?v=0.3.9'); ?>">
  <link rel="stylesheet" href="<?php $this->options->themeUrl('assets/reader.css?v=0.3.9'); ?>">
  <?php $this->header('commentReply=&antiSpam='); ?>
  <noscript><style>.controls,.passage-tools,.pick-entry,.weather-chip{display:none}.article-scroll{bottom:32px}.friend-list{bottom:80px!important}</style></noscript>
</head>
<body class="<?php echo $wordSeaConfig['scene'] === 'article' ? 'article-mode' : ($wordSeaConfig['scene'] === 'friends' ? 'friends-mode' : ''); ?>">
  <main id="wordsea-scene" data-scene="<?php echo $wordSeaConfig['scene']; ?>" aria-label="由多语言文字组成的动态海洋">
    <div id="sea-scene">
    <canvas id="sky-base" aria-hidden="true"></canvas>
    <canvas id="sky" aria-hidden="true"></canvas>
    <canvas id="ocean" role="img" aria-label="海、sea、mer、mar 等文字随波浪起伏，远方夕阳映在海面，天空中漂浮着多语言的云。"></canvas>
    <canvas id="weather-fx" aria-hidden="true"></canvas>
    <div id="friends-shade" aria-hidden="true"></div>
    <canvas id="beacons" aria-hidden="true"></canvas>
    <div id="dive-shade" aria-hidden="true"></div>
    </div>
    <canvas id="passage" role="img" aria-label="两侧布满多语言名言的高墙，上下没有边界，延伸到中央雾光中的无限远处。"></canvas>
    <div class="vignette"></div>
    <div id="scene-veil" aria-hidden="true"></div>
    <header class="header">
      <div class="identity"><div class="symbol" aria-hidden="true">海</div><div><h1><a href="<?php $this->options->siteUrl(); ?>" data-wordsea-link><?php echo wordsea_escape($this->options->title); ?></a></h1><div class="kicker"><?php echo wordsea_escape($this->options->description); ?></div></div></div>
      <div class="edition"><b>24 种语言 · 同一片海</b><br>AN EXPERIMENT IN TYPE & TIDE</div>
    </header>
    <button id="weather-open" class="weather-chip" type="button" aria-haspopup="dialog" aria-controls="weather-dialog"><span aria-hidden="true">◌</span><span id="weather-summary">让字海跟随天气</span></button>
    <div class="caption"><p><?php echo wordsea_escape($this->options->wordSeaCaption ?: '语言有边界，海没有。'); ?></p><span id="hint">移动鼠标探索 · 点击海面泛起涟漪</span></div>
    <nav class="journal" id="journal" aria-label="文章列表"><?php $this->need('journal.php'); ?></nav>
    <section class="article-view" id="article-view" aria-label="文章阅读"<?php if ($wordSeaConfig['scene'] !== 'article'): ?> hidden inert<?php endif; ?>>
      <div class="article-backdrop" aria-hidden="true"></div>
      <div class="reading-progress" id="reading-progress" role="progressbar" aria-label="正文阅读进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span class="reading-progress-fill" aria-hidden="true"></span></div>
      <nav class="passage-nav" aria-label="阅读导航">
        <a class="passage-back" id="back-sea" href="<?php $this->options->siteUrl(); ?>" data-wordsea-link><svg viewBox="0 0 24 24"><path d="m10 5-7 7 7 7M3 12h18"/></svg>返回字海</a>
        <span class="passage-name">语 廊 · BETWEEN THE WORDS</span>
        <div class="passage-tools">
          <button class="pick-entry" id="pick-quote" type="button" title="点击两侧高墙也可拾句">拾一句 ↗</button>
          <button class="icon-button" id="passage-play" aria-label="暂停动画" aria-pressed="false" title="暂停 / 继续（空格）"><svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg></button>
          <button class="icon-button" id="passage-immersive" aria-label="只看文字长廊" title="只看文字长廊（H）"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
        </div>
      </nav>
      <nav class="reading-toc" id="reading-toc" aria-label="文章目录" hidden>
        <button class="reading-toc-toggle" type="button" aria-label="展开文章目录" aria-expanded="false" aria-controls="reading-toc-list" title="文章目录"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></button>
        <div class="reading-toc-panel"><p class="reading-toc-label">沿着章节前行</p><ol class="reading-toc-list" id="reading-toc-list"></ol></div>
      </nav>
      <div class="article-scroll" id="article-scroll" tabindex="0" aria-label="文章正文"><article class="article-text" id="article-text"><?php $this->need('article.php'); ?></article></div>
      <div class="passage-foot">沿着文字，走向远处。 · 点击两侧高墙，拾起一句话</div>
    </section>
    <section class="friends-view" id="friends-view" aria-label="友链 · 海上灯火"<?php if ($wordSeaConfig['scene'] !== 'friends'): ?> hidden inert<?php endif; ?>>
      <nav class="passage-nav" aria-label="友链导航">
        <a class="passage-back" id="back-friends" href="<?php $this->options->siteUrl(); ?>" data-wordsea-link><svg viewBox="0 0 24 24"><path d="m10 5-7 7 7 7M3 12h18"/></svg>返回字海</a>
        <span class="passage-name">FRIENDS ACROSS THE SEA</span>
        <div class="passage-tools">
          <button class="icon-button" id="friends-play" aria-label="暂停动画" aria-pressed="false" title="暂停 / 继续（空格）"><svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg></button>
          <button class="icon-button" id="friends-immersive" aria-label="只看海上灯火" title="只看海上灯火（H）"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
        </div>
      </nav>
      <div class="friends-intro"><p class="friends-eyebrow">LINKS / 彼此照亮的地方</p><h1 id="friends-heading" tabindex="-1">海上灯火</h1><p>隔着海，仍能看见彼此。</p></div>
      <div class="friend-list" id="friend-list" role="list" aria-label="友链"><?php $this->need('friends-content.php'); ?></div>
      <div class="friends-foot" id="friends-foot">共 <?php echo $wordSeaConfig['friendsCount']; ?> 盏灯<span class="friends-hint"> · 悬停或聚焦，让光落进字浪</span></div>
      <nav class="friends-pagination" id="friends-pagination" aria-label="友链分页">
        <?php if ($wordSeaConfig['scene'] === 'friends' && $wordSeaConfig['friendsPages'] > 1): ?>
          <?php if ($wordSeaConfig['friendsPage'] > 1): ?><a data-wordsea-link href="<?php echo wordsea_escape(wordsea_friends_page_url($this, $wordSeaConfig['friendsPage'] - 1)); ?>">← 前一片灯火</a><?php endif; ?>
          <span><?php echo $wordSeaConfig['friendsPage']; ?> / <?php echo $wordSeaConfig['friendsPages']; ?></span>
          <?php if ($wordSeaConfig['friendsPage'] < $wordSeaConfig['friendsPages']): ?><a data-wordsea-link href="<?php echo wordsea_escape(wordsea_friends_page_url($this, $wordSeaConfig['friendsPage'] + 1)); ?>">下一片灯火 →</a><?php endif; ?>
        <?php endif; ?>
      </nav>
    </section>
    <div class="controls" role="group" aria-label="海洋设置">
      <div class="control-surface"></div>
      <button class="icon-button" id="play" aria-label="暂停动画" aria-pressed="false" title="暂停 / 继续（空格）"><svg id="play-icon" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg></button>
      <button class="sea-settings-open" id="sea-settings-open" type="button" aria-haspopup="dialog" aria-controls="sea-settings-dialog" aria-expanded="false">海洋设置<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></svg></button>
      <div class="themes" role="group" aria-label="时段">
        <button class="theme" data-theme="daybreak" aria-pressed="false">破晓</button>
        <button class="theme" data-theme="morning" aria-pressed="false">清晨</button>
        <button class="theme" data-theme="noon" aria-pressed="false">正午</button>
        <button class="theme" data-theme="afternoon" aria-pressed="false">午后</button>
        <button class="theme" data-theme="sunset" aria-pressed="true">夕照</button>
        <button class="theme" data-theme="night" aria-pressed="false">月夜</button>
        <button class="theme" data-theme="auto" aria-pressed="false" aria-label="跟随本地时间" title="跟随本地时间">自动</button>
      </div>
      <div class="range-group"><label for="wind">风浪</label><input id="wind" type="range" min="0" max="100" value="<?php echo $wordSeaConfig['wind']; ?>"><output id="wind-value" for="wind"><?php echo $wordSeaConfig['wind']; ?>%</output></div>
      <div class="range-group"><label for="density">字密度</label><input id="density" type="range" min="30" max="100" value="<?php echo $wordSeaConfig['density']; ?>"><output id="density-value" for="density"><?php echo $wordSeaConfig['density']; ?>%</output></div>
      <div class="tools">
        <button class="plain-button" id="clouds" aria-pressed="true" title="显示 / 隐藏文字云"><svg viewBox="0 0 24 24"><path d="M6.5 18a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.5 1.4A3.8 3.8 0 1 1 18 18Z"/></svg><span>云</span></button>
        <button class="icon-button" id="immersive" title="沉浸模式（H）" aria-label="进入沉浸模式"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
      </div>
    </div>
    <dialog class="sea-settings-dialog" id="sea-settings-dialog" aria-labelledby="sea-settings-heading">
      <div class="sea-settings-heading"><h2 id="sea-settings-heading">让海，换一种心情</h2><button class="sea-settings-close" type="button" aria-label="关闭海洋设置">×</button></div>
      <div class="sea-settings-body"></div>
    </dialog>
    <button class="icon-button restore" id="restore" aria-label="退出沉浸模式" title="显示控制（H / Esc）"><svg viewBox="0 0 24 24"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg></button>
    <div class="error" id="error" role="status"><p>动态背景暂时不可用，文章仍可阅读。</p></div>
    <div class="site-footer" id="site-footer"><?php echo wordsea_escape($this->options->wordSeaFooter); ?> <a href="<?php $this->options->feedUrl(); ?>">RSS</a></div>
    <div id="site-status" role="status" aria-live="polite"></div>
  </main>
  <script id="wordsea-config" type="application/json"><?php echo wordsea_json($wordSeaConfig); ?></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/collect-data.js?v=0.2.2'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/scene.js?v=0.3.10'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/responsive.js?v=0.3.9'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/weather.js?v=0.3.1'); ?>"></script>
  <script data-wordsea-runtime data-manual src="<?php $this->options->themeUrl('assets/vendor/prism.js?v=1.30.0'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/highlight.js?v=0.1.6'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/media.js?v=0.3.8'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/reader-tools.js?v=0.3.6'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/reading.js?v=0.3.8'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/collect.js?v=0.3.7'); ?>"></script>
  <script data-wordsea-runtime src="<?php $this->options->themeUrl('assets/blog.js?v=0.2.1'); ?>"></script>
  <?php $this->footer(); ?>
</body>
</html>
