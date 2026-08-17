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
  title: "HypeStudy — Private Research Browser",
  description:
    "A privacy-oriented browser for reading, research, and personal use. Browse with fewer interruptions when other hosts are filtered. Not a flashcard or quiz LMS.",
  keywords:
    "HypeStudy, private browser, research browser, reading, homework research, study, education, privacy, personal browsing, student research, K-12 resources, college reading",
  siteName: "HypeStudy",
  author: "HypeStudy",
  themeColor: "#f8f6f1",
  url: "https://hypestudy.com/",
  robots: "index, follow",
  ogImage: "https://hypestudy.com/logo.png",
  ogImageWidth: "496",
  ogImageHeight: "503",
  ogImageAlt: "HypeStudy — private research browser",
  twitter: "@hypestudy",
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "HypeStudy",
    applicationCategory: "BrowserApplication",
    operatingSystem: "Web",
    description:
      "Privacy-oriented research browser for reading, homework, and personal browsing.",
    url: "https://hypestudy.com/",
    logo: "https://hypestudy.com/logo.png",
    image: "https://hypestudy.com/logo.png",
  },
};

export const HOME_SEO = {
  title: "PeteZah — Privacy Browser, Games, and the Open Web",
  description:
    "PeteZah is a privacy-oriented browser with HTML5 games, a licensed streaming-service movie directory, optional music overlay, and full-internet browsing. Use it lawfully.",
  keywords:
    "PeteZah, PeteZah Games, privacy browser, private browser, HTML5 games, online games, research browser, licensed streaming, movies directory, web browser, apps",
  siteName: "PeteZah Games",
  author: "PeteZah",
  themeColor: "#020810",
  url: "https://petezahgames.com/",
  robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  ogImage: "https://petezahgames.com/og-share.png",
  ogImageWidth: "1200",
  ogImageHeight: "630",
  ogImageAlt: "PeteZah — privacy browser and games",
  twitter: "@petezahgames",
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "PeteZah Games",
        url: "https://petezahgames.com/",
        description:
          "Privacy-oriented browser with games, a licensed movie directory, and general web access.",
        image: {
          "@type": "ImageObject",
          url: "https://petezahgames.com/og-share.png",
          width: 1200,
          height: 630,
        },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://petezahgames.com/?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "PeteZah Browser",
        applicationCategory: "BrowserApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description:
          "A privacy-oriented browser with games, licensed streaming-service links, music overlay, and web access.",
        image: "https://petezahgames.com/og-share.png",
      },
      {
        "@type": "Organization",
        name: "PeteZah Games",
        url: "https://petezahgames.com/",
        logo: {
          "@type": "ImageObject",
          url: "https://petezahgames.com/logo.png",
          width: 496,
          height: 503,
        },
      },
    ],
  },
};

export function seoForHost(host) {
  return isPeteZahHomeHost(host) ? HOME_SEO : EDU_SEO;
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
      /petezahgames|PeteZah|proxy browser|unblocked games|private browser|privacy browser/i.test(body) &&
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

  if (home) {
    out = out.replace(
      /<div class="education-is-key"[\s\S]*?<\/div>/gi,
      `<div class="education-is-key" aria-hidden="true"><h1>PeteZah</h1><p>Privacy-oriented browser with games, a licensed movie directory, and general web access.</p></div>`
    );
  }

  return out;
}
