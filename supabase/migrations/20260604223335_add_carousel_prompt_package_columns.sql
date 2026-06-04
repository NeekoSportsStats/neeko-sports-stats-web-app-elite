alter table social_content_posts
  add column if not exists per_slide_prompts       jsonb  default '[]'::jsonb,
  add column if not exists full_carousel_prompt    text,
  add column if not exists carousel_prompt_package text,
  add column if not exists full_slide_text_package text,
  add column if not exists background_prompt_package text,
  add column if not exists prompt_mode             text   default 'full_graphic';
