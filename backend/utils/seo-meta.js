const HOME_HOSTS = new Set(["petezahgames.com"]);

export function normalizeHost(host) {
  return String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

export function isPeteZahHomeHost(host) {
  return HOME_HOSTS.has(normalizeHost(host));
}

export const EDU_SEO = {
  title: "HypeStudy — Secure Study Platform for Students",
  description:
    "Create flashcards, take quizzes, track your progress with advanced analytics, and master any subject with confidence. Online learning tools for K-12, college, and lifelong learners.",
  keywords:
    "study, flashcards, quiz, analytics, HypeStudy, learning, education, study tools, exam prep, student platform, online learning, academic success, tutoring, homework help, SAT prep, ACT prep, STEM education, curriculum, academic resources, e-learning",
  siteName: "HypeStudy",
  author: "HypeStudy",
  themeColor: "#f8f6f1",
  url: "https://hypestudy.com/",
  robots: "index, follow",
  ogImage: "https://hypestudy.com/logo.png",
  ogImageWidth: "496",
  ogImageHeight: "503",
  ogImageAlt: "HypeStudy Logo - Secure Study Platform",
  twitter: "@hypestudy",
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "HypeStudy",
    description:
      "Secure study platform offering flashcards, quizzes, analytics, and academic resources for students.",
    url: "https://hypestudy.com/",
    logo: "https://hypestudy.com/logo.png",
    image: "https://hypestudy.com/logo.png",
    areaServed: "Worldwide",
  },
};

export const HOME_SEO = {
  title: "PeteZah Games — Unblocked Games, Proxy Browser, Movies & Music",
  description:
    "PeteZah Games is a free unblocked games site and private proxy browser. Play HTML5 games at school, unblock YouTube and Reddit, stream movies and music, and browse with a fast web proxy.",
  keywords:
    "unblocked games, unblocked games at school, proxy, web proxy, proxy browser, unblock youtube, petezah, petezah games, petezahgames, unblocked proxy, private browser, html5 games, unblocked movies, unblocked music, chromebook games, school proxy",
  siteName: "PeteZah Games",
  author: "PeteZah",
  themeColor: "#020810",
  url: "https://petezahgames.com/",
  robots: "index, follow",
  ogImage: "https://petezahgames.com/og-share.png",
  ogImageWidth: "1200",
  ogImageHeight: "630",
  ogImageAlt: "PeteZah Games — Unblocked Games and Proxy Browser",
  twitter: "@petezahgames",
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PeteZah Games",
    alternateName: ["PeteZah", "PeteZahGames"],
    description:
      "Unblocked games, proxy browser, movies, and music. Play at school and browse privately.",
    url: "https://petezahgames.com/",
    logo: "https://petezahgames.com/logo.png",
    image: "https://petezahgames.com/og-share.png",
    areaServed: "Worldwide",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://petezahgames.com/?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  },
};

export function seoForHost(host) {
  return isPeteZahHomeHost(host) ? HOME_SEO : EDU_SEO;
}

function upsertLinkRel(html, rel, href) {
  const re = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*>`, "i");
  const tag = `<link rel="${rel}" href="${escapeAttr(href)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function upsertMeta(html, attr, key, content) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*>`, "i");
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function stripSensitiveInlineScripts(html) {
  return String(html || "").replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (full, body) => {
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(full)) return full;
    if (/src\s*=/i.test(full) && !body.trim()) return full;
    if (
      /petezahgames|PeteZah|proxy browser|unblocked games|private browser/i.test(body) &&
      (/location\.hostname|seo\s*=|jsonLd|og:title|canonical/i.test(body) ||
        /petezahgames\.com/i.test(body))
    ) {
      return "";
    }
    return full;
  });
}

export function applySeoToHtml(html, host) {
  const home = isPeteZahHomeHost(host);
  const seo = home ? HOME_SEO : EDU_SEO;
  let out = stripSensitiveInlineScripts(html);

  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(seo.title)}</title>`);

  const pairs = [
    ["name", "title", seo.title],
    ["name", "description", seo.description],
    ["name", "keywords", seo.keywords],
    ["name", "author", seo.author],
    ["name", "robots", seo.robots],
    ["name", "theme-color", seo.themeColor],
    ["name", "application-name", seo.siteName],
    ["name", "apple-mobile-web-app-title", seo.siteName],
    ["property", "og:title", seo.title],
    ["property", "og:description", seo.description],
    ["property", "og:site_name", seo.siteName],
    ["property", "og:url", seo.url],
    ["property", "og:image", seo.ogImage],
    ["property", "og:image:secure_url", seo.ogImage],
    ["property", "og:image:width", seo.ogImageWidth],
    ["property", "og:image:height", seo.ogImageHeight],
    ["property", "og:image:alt", seo.ogImageAlt],
    ["property", "og:image:type", "image/png"],
    ["property", "og:type", "website"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", seo.title],
    ["name", "twitter:description", seo.description],
    ["name", "twitter:url", seo.url],
    ["name", "twitter:image", seo.ogImage],
    ["name", "twitter:image:alt", seo.ogImageAlt],
    ["name", "twitter:site", seo.twitter],
    ["name", "twitter:creator", seo.twitter],
  ];

  for (const [attr, key, content] of pairs) {
    out = upsertMeta(out, attr, key, content);
  }

  const canonical = `<link rel="canonical" href="${escapeAttr(seo.url)}" />`;
  if (/rel=["']canonical["']/i.test(out)) {
    out = out.replace(/<link[^>]+rel=["']canonical["'][^>]*>/i, canonical);
  } else {
    out = out.replace(/<\/head>/i, `  ${canonical}\n</head>`);
  }

  const ld = `<script type="application/ld+json" id="pz-seo-ld">${JSON.stringify(seo.jsonLd)}</script>`;
  if (/id=["']pz-seo-ld["']/.test(out)) {
    out = out.replace(/<script[^>]*id=["']pz-seo-ld["'][^>]*>[\s\S]*?<\/script>/i, ld);
  } else {
    out = out.replace(/<\/head>/i, `  ${ld}\n</head>`);
  }

  const icon = "/logo.png";
  out = upsertLinkRel(out, "icon", icon);
  out = upsertLinkRel(out, "shortcut icon", icon);
  out = upsertLinkRel(out, "apple-touch-icon", icon);

  return out;
}
