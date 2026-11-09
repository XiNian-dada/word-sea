<?php if (!defined('__TYPECHO_ROOT_DIR__')) exit; $wordSeaConfig = wordsea_config($this); ?>
<?php if ($wordSeaConfig['scene'] === 'friends' && $this->hidden): ?>
  <div class="friends-locked"><?php $this->content(); ?></div>
<?php else: ?>
  <?php foreach ($wordSeaConfig['friends'] as $wordSeaIndex => $wordSeaFriend): ?>
  <div role="listitem" ><a class="friend-link" href="<?php echo wordsea_escape($wordSeaFriend['href']); ?>" target="_blank" rel="noopener noreferrer" style="--lamp:rgb(<?php echo implode(',', $wordSeaFriend['color']); ?>)" aria-label="<?php echo wordsea_escape($wordSeaFriend['name']); ?>，新窗口打开">
    <span class="friend-avatar" aria-hidden="true"><?php if ($wordSeaFriend['avatar']): ?><img src="<?php echo wordsea_escape($wordSeaFriend['avatar']); ?>" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><?php else: ?><svg viewBox="0 0 24 24"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg><?php endif; ?></span>
    <span class="friend-copy"><span class="friend-name"><?php echo wordsea_escape($wordSeaFriend['name']); ?></span><span class="friend-note"><?php echo wordsea_escape($wordSeaFriend['note']); ?></span></span>
  </a></div>
  <?php endforeach; ?>
  <?php if (!$wordSeaConfig['friends']): ?><p class="friends-empty">海上暂时还没有灯火。<br>以后会有人在这里停靠。</p><?php endif; ?>
<?php endif; ?>
