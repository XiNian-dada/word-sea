<?php if (!defined('__TYPECHO_ROOT_DIR__')) exit; $wordSeaLost = wordsea_is_404($this); ?>
<h2 class="journal-label" id="journal-heading" tabindex="-1"><?php $this->archiveTitle(['category'=>'分类 · %s','tag'=>'标签 · %s','search'=>'搜索 · %s','author'=>'作者 · %s'], '', ''); ?><?php if ($this->is('index')): ?>NOTES FROM THE SHORE · 海边的文字<?php endif; ?></h2>
<div class="journal-scroll">
<?php if (!$this->is('single') && !$wordSeaLost): ?>
  <?php if ($this->have()): $wordSeaNumber = 0; while ($this->next()): $wordSeaNumber++; ?>
    <a class="story-link" href="<?php $this->permalink(); ?>" data-wordsea-link>
      <span class="story-number"><?php echo str_pad($wordSeaNumber, 2, '0', STR_PAD_LEFT); ?></span>
      <span class="story-copy"><span class="story-title"><?php echo wordsea_title_escape($this->title); ?></span><span class="story-meta"><?php $this->date('Y.m.d'); ?></span></span>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>
    </a>
  <?php endwhile; else: ?>
    <p class="empty-note">这片海还没有新的文字。</p>
  <?php endif; ?>
<?php elseif ($wordSeaLost): ?>
  <p class="empty-note">这页文字漂向了别处。</p><a href="<?php $this->options->siteUrl(); ?>" data-wordsea-link>返回首页</a>
<?php endif; ?>
</div>
<div class="journal-tools">
<div class="journal-pagination"><?php if (!$this->is('single') && !$wordSeaLost) $this->pageNav('上一页','下一页',1,'…'); ?></div>
<nav class="site-pages" aria-label="博客页面">
  <?php $wordSeaFriendEntry = false; foreach (wordsea_pages() as $wordSeaPage): ?>
    <a href="<?php echo wordsea_escape($wordSeaPage['url']); ?>" data-wordsea-link<?php if ($wordSeaPage['friends'] && !$wordSeaFriendEntry): $wordSeaFriendEntry = true; ?> id="open-friends"<?php endif; ?>><?php echo wordsea_title_escape($wordSeaPage['title']); ?></a>
  <?php endforeach; ?>
</nav>
<form class="site-search" action="<?php $this->options->siteUrl(); ?>" method="get" role="search"><label class="sr-only" for="sea-search">搜索文章</label><input id="sea-search" name="s" type="search" placeholder="搜索一行文字" required><button aria-label="搜索" type="submit">↗</button></form>
</div>
