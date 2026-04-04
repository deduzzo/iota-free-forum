/**
 * api-rss.js — RSS feed controller
 *
 * Generates RSS 2.0 XML feeds for forum threads.
 * No external dependencies — uses template strings for XML generation.
 */

const db = require('../utility/db');

/**
 * Escape special XML characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert a timestamp (ms or ISO string) to RFC 822 date format.
 * @param {number|string} ts
 * @returns {string}
 */
function toRfc822(ts) {
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  return d.toUTCString();
}

/**
 * Strip HTML tags and truncate to maxLen characters.
 * @param {string} html
 * @param {number} maxLen
 * @returns {string}
 */
function stripAndTruncate(html, maxLen = 300) {
  if (!html) return '';
  const text = String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

/**
 * Build RSS 2.0 XML from a list of threads.
 * @param {object[]} threads
 * @param {string} title
 * @param {string} selfUrl
 * @param {string} baseUrl
 * @returns {string}
 */
function buildRss(threads, title, selfUrl, baseUrl) {
  const items = threads.map((t) => {
    const link = `${baseUrl}/t/${t.id}`;
    const author = t.authorUsername || t.authorId || 'anonymous';
    return `    <item>
      <title>${escapeXml(t.title)}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(stripAndTruncate(t.content))}</description>
      <pubDate>${toRfc822(t.createdAt)}</pubDate>
      <guid>${escapeXml(t.id)}</guid>
      <author>${escapeXml(author)}</author>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Decentralized community on IOTA 2.0</description>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

module.exports = {

  friendlyName: 'RSS Feed',
  description: 'Generate RSS 2.0 feeds for forum threads.',

  fn: async function (req, res) {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const categoryId = req.params.categoryId || null;

      let threads;
      let feedTitle;
      let selfUrl;

      if (categoryId) {
        // Per-category feed
        const result = db.getThreadsByCategory(categoryId, 1, 50);
        threads = result.threads;

        const cat = db.getModel('categories').findOne({ id: categoryId });
        const catName = cat ? cat.name : categoryId;
        feedTitle = `IotaPolis Forum — ${catName}`;
        selfUrl = `${baseUrl}/api/v1/rss/category/${categoryId}`;
      } else {
        // Latest threads across all categories
        threads = db.getModel('threads').findAll(
          { hidden: 0 },
          { sort: 'createdAt DESC', limit: 50 },
        );

        // Enrich with author usernames
        const User = db.getModel('users');
        for (const t of threads) {
          if (t.authorId && !t.authorUsername) {
            const u = User.findOne({ id: t.authorId });
            if (u && u.showUsername) t.authorUsername = u.username;
          }
        }

        feedTitle = 'IotaPolis Forum';
        selfUrl = `${baseUrl}/api/v1/rss/latest`;
      }

      const xml = buildRss(threads, feedTitle, selfUrl, baseUrl);

      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      return res.send(xml);
    } catch (err) {
      sails.log.error('[RSS] Error generating feed:', err);
      return res.serverError({ error: 'Failed to generate RSS feed' });
    }
  },
};
