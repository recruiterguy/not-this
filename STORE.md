# Store listing copy

Paste-ready text for the Chrome Web Store, Firefox Add-ons, and Edge Add-ons listings.

## Name

Not This.

## Short description (132 characters max on Chrome)

Collapses low-effort Reddit comments (GIFs, "This.", lol, bare links, bots, copypasta) so you can read the actual discussion.

## Full description

You open a Reddit thread to see what people think. What you get is a reaction GIF, then "This.", then "lol", then a bot telling you it's a bot, then someone quoting the comment above them and adding nothing. Somewhere under all that is the actual discussion.

Not This. folds the low-effort replies out of the way. They're still there, marked with a small badge that says why, and any one of them expands with a click. What's left is the thread you came for.

WHAT IT COLLAPSES

Each of these has its own switch in the popup, so you decide what counts.

• GIF-only replies, whether from the GIPHY picker or uploaded
• Emoji-only and emote-only comments
• Stock phrases: "This.", "Came here to say this", "Take my upvote", "Username checks out", "lol", "F", r/whoosh, and a few hundred relatives. Whole-comment matches only, so "This is the part everyone misses" stays open.
• Bare links with no commentary
• Bot replies: AutoModerator, accounts ending in "bot", "I am a bot" footers, RemindMe! requests
• Well-known copypasta

Off by default, because they take judgment: image-only comments, replies that just quote the parent, comments under a word count you pick, and comments below a score you pick. There's also a mute list for usernames you're done reading.

WHAT IT NEVER DOES

• Collapse a comment that has real words in it (unless you turn on the short-comment or score rules)
• Re-collapse a comment you've expanded
• Touch a comment Reddit already collapsed
• Vote, post, report, or click anything on your behalf
• Send anything anywhere. No accounts, no analytics, no network requests. Your settings and a single all-time counter live in your browser and nowhere else.

SEE WHAT IT SAVED YOU

A line above each thread reads "22 low-effort comments collapsed (7 GIF, 4 "this", 4 bot)" with a Show them button if you want to check its work. The same count sits on the toolbar icon, and the popup keeps a running all-time total.

THE DETAILS

• Works on new Reddit and old.reddit.com
• Collapse them with a badge, or hide them from the page entirely
• Keep replies visible under a collapsed comment, if you'd rather not lose the conversation beneath a GIF
• Open source and unminified. Every line is on GitHub: https://github.com/recruiterguy/not-this
• Found a phrase it should catch, or one it shouldn't have? Open an issue on GitHub.

Not affiliated with or endorsed by Reddit, Inc.

## Category

Chrome: Productivity (or Social & Communication). Firefox: Social & Communication.

## Permission justifications (Chrome privacy tab)

- **storage:** saves the user's rule toggles and settings, and a single all-time counter.
- **Host permission for reddit.com:** the extension reads comment text on Reddit pages to
  decide which comments to collapse, and modifies the page to collapse them. It runs nowhere else.
- **Data collection:** none. The extension makes no network requests.

## Single purpose (Chrome)

Collapses low-effort comments on Reddit comment pages.

## Website / support URL

https://github.com/recruiterguy/not-this

## Screenshot ideas (1280×800)

1. A busy thread before/after, with the banner "22 low-effort comments collapsed (…)" visible.
2. The popup with the rule switches.
3. A close-up of two collapsed comments with GIF and BOT badges, one expanded.
