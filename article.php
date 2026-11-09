<?php if (!defined('__TYPECHO_ROOT_DIR__')) exit; ?>
<?php if ($this->is('single') && wordsea_scene($this) === 'article'): ?>
  <?php
    ob_start();
    $this->content();
    $wordSeaArticleBody = wordsea_lazy_images(ob_get_clean());
    $wordSeaArticleInfo = wordsea_article_info($this, $wordSeaArticleBody, $this->options->wordSeaFreshness);
  ?>
  <div class="article-meta"><?php if ($this->is('post')): ?><time datetime="<?php $this->date('c'); ?>"><?php $this->date('Y.m.d'); ?></time> · <?php $this->category(' / '); ?><?php else: ?><?php echo wordsea_escape($this->options->title); ?><?php endif; ?></div>
  <h1 id="article-heading" tabindex="-1"><?php echo wordsea_title_escape($this->title); ?></h1>
  <?php if ($wordSeaArticleInfo): ?>
    <div class="article-reading-info" aria-label="文章阅读信息">
      <span>预计 <?php echo $wordSeaArticleInfo['minutes']; ?> 分钟阅读</span>
      <span>最后更新 <time datetime="<?php echo wordsea_escape($wordSeaArticleInfo['datetime']); ?>"><?php echo wordsea_escape($wordSeaArticleInfo['updated']); ?></time></span>
    </div>
    <?php if ($wordSeaArticleInfo['stale']): ?>
      <aside class="article-freshness" aria-label="文章时效提醒">
        <span class="article-freshness-label">时效提醒</span>
        本文距上次更新已过去 <?php echo $wordSeaArticleInfo['days']; ?> 天，部分信息可能已发生变化，请结合最新资料阅读。
      </aside>
    <?php endif; ?>
  <?php endif; ?>
  <div class="post-content" itemprop="articleBody"<?php if ($this->is('post') && !$this->hidden): ?> data-reading-key="<?php echo wordsea_escape($this->permalink); ?>" data-reading-version="<?php echo max((int) $this->created, (int) $this->modified); ?>"<?php endif; ?>><?php echo $wordSeaArticleBody; ?></div>
  <?php if ($this->is('post')): ?>
    <div class="post-tags"><?php $this->tags(' · ', true, ''); ?></div>
    <?php if (!$this->hidden): ?>
      <footer class="reading-end" aria-label="文章结尾">
        <p class="reading-end-note">这一程，读完了。</p>
        <?php $wordSeaSignature = trim((string) $this->options->wordSeaSignature); if ($wordSeaSignature !== '-'): ?>
          <div class="author-signature">
            <span class="author-seal" aria-hidden="true">海</span>
            <div><span class="author-name"><?php echo wordsea_escape($this->author->screenName); ?></span><p><?php echo wordsea_escape($wordSeaSignature ?: '写于这片字海。'); ?></p></div>
          </div>
        <?php endif; ?>
        <nav class="post-near" aria-label="相邻文章">
          <div><span class="reading-near-label">← 上一篇</span><?php $this->thePrev('%s','这里是文字的起点'); ?></div>
          <div><span class="reading-near-label">下一篇 →</span><?php $this->theNext('%s','暂时读到这里'); ?></div>
        </nav>
        <a class="reading-return" href="<?php $this->options->siteUrl(); ?>" data-wordsea-link data-wordsea-return>↑ 返回字海</a>
      </footer>
    <?php endif; ?>
  <?php endif; ?>
  <?php if (!$this->hidden): $this->need('comments.php'); endif; ?>
<?php endif; ?>
