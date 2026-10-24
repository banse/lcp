// What the seat works on, and what he does for it. feed.js puts each task into one category; each theme maps the
// categories to the activities it can show. Both themes start with the owner's mapping of 2026-10-24, and either
// can change on its own.

// legend wording for each category, in the order the legend lists them
export const CATEGORIES = {
  token: 'Token launch work: any step of a launch that makes a token (custom token, v4 hook, coin)',
  website: 'Websites: building or reviewing a site or a contract\'s front end',
  other: 'Everything else: contracts-only launches, plain jobs',
  research: 'Research reports',
  video: 'Video',
  audio: 'Audio and music',
  image: 'Images and logos',
  oracle: 'Oracle questions, or a seat on an oracle panel',
};

// how the diary names a task of each category
export const CATEGORY_SAY = {
  token: 'token launch work', website: 'a website', other: 'a task', research: 'a research task',
  video: 'a video task', audio: 'an audio task', image: 'an image task', oracle: 'an oracle question',
};

const OWNER_2026_10_24 = {
  token: 'computer', website: 'cook', other: 'cook', research: 'book', video: 'tv', audio: 'piano', image: 'easel',
  oracle: 'telescope',
};

export const MAPPINGS = {
  pixel: { ...OWNER_2026_10_24 },
  imd: { ...OWNER_2026_10_24 },
};

export const ACTIVITIES = ['computer', 'cook', 'book', 'tv', 'piano', 'easel', 'telescope'];
