<?php if (!defined('__TYPECHO_ROOT_DIR__')) exit; $this->comments()->to($comments); ?>
<section id="comments" class="comments" aria-label="文章评论">
<?php if ($comments->have()): ?>
  <h2><?php $this->commentsNum('评论','1 条评论','%d 条评论'); ?></h2>
  <?php $comments->listComments(); $comments->pageNav(); ?>
<?php endif; ?>
<?php if ($this->allow('comment')): ?>
  <div class="respond" id="<?php $this->respondId(); ?>">
    <div class="cancel-comment-reply"><?php $comments->cancelReply(); ?></div>
    <h2>留一行字</h2>
    <form class="comment-form" id="comment-form" method="post" action="<?php $this->commentUrl(); ?>"<?php if ($this->options->commentsAntiSpam): ?> data-comment-token="<?php echo wordsea_escape($this->security->getToken($this->request->getRequestUrl())); ?>"<?php endif; ?>>
      <?php if ($this->user->hasLogin()): ?>
        <p>你好，<?php echo wordsea_escape($this->user->screenName); ?>。<a href="<?php $this->options->logoutUrl(); ?>">退出登录</a></p>
      <?php else: ?>
        <div class="comment-fields">
          <label>称呼<input name="author" autocomplete="name" required value="<?php $this->remember('author'); ?>"></label>
          <label>邮箱<input name="mail" type="email" autocomplete="email"<?php if ($this->options->commentsRequireMail): ?> required<?php endif; ?> value="<?php $this->remember('mail'); ?>"></label>
          <label>网站<input name="url" type="url" autocomplete="url"<?php if ($this->options->commentsRequireUrl): ?> required<?php endif; ?> value="<?php $this->remember('url'); ?>"></label>
        </div>
      <?php endif; ?>
      <label>内容<textarea name="text" rows="5" required><?php $this->remember('text'); ?></textarea></label>
      <?php if ($this->options->commentsAntiSpam): ?><noscript><input type="hidden" name="_" value="<?php echo wordsea_escape($this->security->getToken($this->request->getRequestUrl())); ?>"></noscript><?php endif; ?>
      <button class="submit" type="submit">提交评论</button>
    </form>
  </div>
<?php endif; ?>
</section>
