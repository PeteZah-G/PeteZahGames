use lol_html::{element, html_content::ContentType, HtmlRewriter, Settings};
use std::cell::RefCell;
use std::rc::Rc;
use url::Url;
use crate::constants::{MOCHI_PREFIX, PART_1, PART_2};
use crate::encoding::encode_mochi_url;

pub fn rewrite_html(body: &[u8], target_url: &Url, base_url_str: &str) -> Vec<u8> {
    let base_url_owned = base_url_str.to_string();
    let current_base = Rc::new(RefCell::new(target_url.clone()));
    let base_for_updater = current_base.clone();
    let target_url_for_base = target_url.clone();

    let rewrite_url = {
        let current_base = current_base.clone();
        Rc::new(move |url: &str| -> Option<String> {
            if url.is_empty()
                || url.starts_with("data:")
                || url.starts_with("blob:")
                || url.starts_with("javascript:")
                || url.starts_with("mailto:")
                || url.starts_with("tel:")
                || url.starts_with('#')
                || url.starts_with(MOCHI_PREFIX)
            {
                return None;
            }
            if url.starts_with("http://") || url.starts_with("https://") {
                return Some(format!("{}{}/", MOCHI_PREFIX, encode_mochi_url(url)));
            }
            if url.starts_with("//") {
                let scheme = current_base.borrow().scheme().to_string();
                let full = format!("{}:{}", scheme, url);
                return Some(format!("{}{}/", MOCHI_PREFIX, encode_mochi_url(&full)));
            }
            let base = current_base.borrow().clone();
            if let Ok(resolved) = base.join(url) {
                return Some(format!(
                    "{}{}/",
                    MOCHI_PREFIX,
                    encode_mochi_url(resolved.as_str())
                ));
            }
            None
        })
    };

    let rw1 = rewrite_url.clone();
    let rw2 = rewrite_url.clone();
    let rw3 = rewrite_url.clone();
    let rw5 = rewrite_url.clone();
    let rw6 = rewrite_url.clone();
    let rw7 = rewrite_url.clone();
    let base_url_for_head = base_url_owned.clone();
    let base_url_for_html = base_url_owned.clone();
    let script_injected = Rc::new(RefCell::new(false));
    let script_injected_for_head = script_injected.clone();
    let script_injected_for_html = script_injected.clone();
    let base_for_href = base_for_updater.clone();
    let base_for_style = base_for_updater.clone();
    let mut output = Vec::with_capacity(body.len() + 2048);
    let mut rewriter = HtmlRewriter::new(
        Settings {
            element_content_handlers: vec![
                element!("html", move |el| {
                    if !*script_injected_for_html.borrow() {
                        let full_script =
                            format!("{}{}{}", PART_1, base_url_for_html, PART_2);
                        el.prepend(&full_script, ContentType::Html);
                        *script_injected_for_html.borrow_mut() = true;
                    }
                    Ok(())
                }),
                element!("head", move |el| {
                    if !*script_injected_for_head.borrow() {
                        let full_script =
                            format!("{}{}{}", PART_1, base_url_for_head, PART_2);
                        el.prepend(&full_script, ContentType::Html);
                        *script_injected_for_head.borrow_mut() = true;
                    }
                    if base_url_for_head.contains("gn-math.dev") {
                        let intercept_script = r##"<script>
(function(){
var _f=window.fetch.bind(window);
window.fetch=function(u,o){
var s=typeof u==='string'?u:(u&&u.url?u.url:String(u));
if(s.indexOf('data.jsdelivr.com/v1/stats/')!==-1){
return Promise.resolve(new Response('{"total":0,"files":[],"versions":[]}',{status:200,headers:{'Content-Type':'application/json'}}));
}
return _f(u,o).then(function(r){
if(r.status>=500||r.status===404){
var ct=r.headers.get('content-type')||'';
if(ct.indexOf('json')!==-1){
return new Response('{"total":0,"files":[],"versions":[]}',{status:200,headers:{'Content-Type':'application/json'}});
}
return new Response('',{status:200,headers:{'Content-Type':'text/html'}});
}
return r;
}).catch(function(){
return new Response('{"total":0,"files":[],"versions":[]}',{status:200,headers:{'Content-Type':'application/json'}});
});
};
var _iv=setInterval(function(){
var zf=document.getElementById('zoneFrame');
if(zf&&!zf._hooked){
zf._hooked=1;
zf.addEventListener('load',function(){
try{if(zf.contentDocument&&zf.contentDocument.body){
var t=zf.contentDocument.body.innerText||'';
if(t.indexOf('Failed to fetch')!==-1||t.indexOf('upstream error')!==-1||t.indexOf('not found')!==-1){
zf.srcdoc='<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100%;margin:0;font-family:sans-serif;text-align:center"><div><h2 style="font-size:24px;margin-bottom:8px">Game Unavailable</h2><p style="color:#999">This game\u2019s content is no longer available.</p></div></body></html>';
}
}}catch(e){}
});
clearInterval(_iv);
}
},200);
setTimeout(function(){clearInterval(_iv);},15000);
})();
</script>"##;
                        el.prepend(intercept_script, ContentType::Html);

                        let gnmath_inject = r#"<style>
                            .zone-header { display: none !important; }
                            header { display: none !important; }
                            main { display: none !important; }
                            footer { display: none !important; }
                            #zoneViewer { display: flex !important; position: fixed; inset: 0; z-index: 9999; background: #000; }
                            #zoneFrame { flex: 1; width: 100%; height: 100%; border: none; }
                            body { margin: 0; padding: 0; overflow: hidden; background: #000; }
                        </style><script>window.sadjgknsdfjg='https://gn-math.dev'</script>"#;
                        el.append(gnmath_inject, ContentType::Html);
                    }
                    Ok(())
                }),
                element!("base[href]", move |el| {
                    if let Some(href) = el.get_attribute("href") {
                        if let Ok(parsed_base) = target_url_for_base.join(&href) {
                            *base_for_href.borrow_mut() = parsed_base.clone();
                            let escaped_target = parsed_base.as_str().replace('\'', "\\'");
                            let injection = format!("<script>window.__MOCHI_TARGET__ = '{}';</script>", escaped_target);
                            el.after(&injection, ContentType::Html);
                        }
                        let proxy_href =
                            if href.starts_with("http://") || href.starts_with("https://") {
                                format!("{}{}/", MOCHI_PREFIX, encode_mochi_url(&href))
                            } else if href.starts_with("//") {
                                let scheme = target_url_for_base.scheme();
                                let full = format!("{}:{}", scheme, href);
                                format!("{}{}/", MOCHI_PREFIX, encode_mochi_url(&full))
                            } else if let Ok(parsed_base) = target_url_for_base.join(&href) {
                                format!(
                                    "{}{}/",
                                    MOCHI_PREFIX,
                                    encode_mochi_url(parsed_base.as_str())
                                )
                            } else {
                                href
                            };
                        let _ = el.set_attribute("href", &proxy_href);
                    }
                    Ok(())
                }),
                element!("link[href]", move |el| {
                    if let Some(val) = el.get_attribute("href") {
                        if let Some(rewritten) = rw1(&val) {
                            let _ = el.set_attribute("href", &rewritten);
                        }
                    }
                    Ok(())
                }),
                element!("script[type]", |el| {
                    if let Some(type_val) = el.get_attribute("type") {
                        if let Some(dash_pos) = type_val.find('-') {
                            let prefix = &type_val[..dash_pos];
                            if prefix.len() >= 8 && prefix.chars().all(|c| c.is_ascii_hexdigit()) {
                                let real_type = &type_val[dash_pos + 1..];
                                if real_type == "module" {
                                    let _ = el.set_attribute("type", "module");
                                } else if real_type == "text/javascript" {
                                    el.remove_attribute("type");
                                } else {
                                    let _ = el.set_attribute("type", real_type);
                                }
                            }
                        }
                    }
                    Ok(())
                }),
                element!("script[src]", move |el| {
                    if let Some(val) = el.get_attribute("src") {
                        if let Some(rewritten) = rw2(&val) {
                            let _ = el.set_attribute("src", &rewritten);
                        }
                    }
                    Ok(())
                }),
                element!("img[src], input[src], track[src]", move |el| {
                    if let Some(val) = el.get_attribute("src") {
                        if let Some(rewritten) = rw3(&val) {
                            let _ = el.set_attribute("src", &rewritten);
                        }
                    }
                    Ok(())
                }),
                element!(
                    "source[src], video[src], audio[src], video[poster]",
                    move |el| {
                        if let Some(val) = el.get_attribute("src") {
                            if let Some(rewritten) = rw5(&val) {
                                let _ = el.set_attribute("src", &rewritten);
                            }
                        }
                        if let Some(val) = el.get_attribute("poster") {
                            if let Some(rewritten) = rw5(&val) {
                                let _ = el.set_attribute("poster", &rewritten);
                            }
                        }
                        Ok(())
                    }
                ),
                element!("a[href], area[href]", move |el| {
                    if let Some(val) = el.get_attribute("href") {
                        if let Some(rewritten) = rw6(&val) {
                            let _ = el.set_attribute("href", &rewritten);
                        }
                    }
                    Ok(())
                }),
                element!("iframe[src], embed[src], object[data], form[action]", move |el| {
                    let attr = if el.tag_name() == "form" {
                        "action"
                    } else if el.tag_name() == "object" {
                        "data"
                    } else {
                        "src"
                    };
                    if let Some(val) = el.get_attribute(attr) {
                        if let Some(rewritten) = rw7(&val) {
                            let _ = el.set_attribute(attr, &rewritten);
                        }
                    }
                    Ok(())
                }),
                element!("*[style]", move |el| {
                    if let Some(style_val) = el.get_attribute("style") {
                        let current_base = base_for_style.borrow().clone();
                        let rewritten = rewrite_css_urls(&style_val, &current_base);
                        if rewritten != style_val {
                            let _ = el.set_attribute("style", &rewritten);
                        }
                    }
                    Ok(())
                }),
            ],
            ..Settings::default()
        },
        |c: &[u8]| {
            output.extend_from_slice(c);
        },
    );

    let _ = rewriter.write(body);
    let _ = rewriter.end();

    if !*script_injected.borrow() {
        let full_script = format!("{}{}{}", PART_1, base_url_owned, PART_2);
        let mut new_output = Vec::with_capacity(full_script.len() + output.len());
        new_output.extend_from_slice(full_script.as_bytes());
        new_output.extend_from_slice(&output);
        return new_output;
    }

    output
}

pub fn rewrite_css_urls(css: &str, base_url: &Url) -> String {
    let mut result = String::with_capacity(css.len() + 512);
    let mut rest = css;

    while let Some((url_pos, paren_pos)) = find_url_fn(rest) {
        result.push_str(&rest[..url_pos]);
        rest = &rest[paren_pos + 1..];
        rest = rest.trim_start();

        let quote_char = if rest.starts_with('"') {
            rest = &rest[1..];
            Some('"')
        } else if rest.starts_with('\'') {
            rest = &rest[1..];
            Some('\'')
        } else {
            None
        };

        let end_pos = if let Some(q) = quote_char {
            rest.find(q).unwrap_or(rest.len())
        } else {
            rest.find(')').unwrap_or(rest.len())
        };

        let url_val = rest[..end_pos].trim();
        rest = &rest[end_pos..];

        if let Some(q) = quote_char {
            if rest.starts_with(q) {
                rest = &rest[1..];
            }
        }
        rest = rest.trim_start();
        if rest.starts_with(')') {
            rest = &rest[1..];
        }

        let resolved = if url_val.starts_with("http://") || url_val.starts_with("https://") {
            Some(url_val.to_string())
        } else if url_val.starts_with("//") {
            let scheme = base_url.scheme();
            Some(format!("{}:{}", scheme, url_val))
        } else if !url_val.is_empty() && !url_val.starts_with("data:") && !url_val.starts_with('#')
        {
            base_url.join(url_val).ok().map(|u| u.to_string())
        } else {
            None
        };

        if let Some(abs_url) = resolved {
            result.push_str("url(");
            result.push('"');
            result.push_str(MOCHI_PREFIX);
            result.push_str(&encode_mochi_url(&abs_url));
            result.push('/');
            result.push('"');
            result.push(')');
        } else {
            result.push_str("url(");
            if let Some(q) = quote_char {
                result.push(q);
            }
            result.push_str(url_val);
            if let Some(q) = quote_char {
                result.push(q);
            }
            result.push(')');
        }
    }

    result.push_str(rest);
    result
}

fn find_url_fn(s: &str) -> Option<(usize, usize)> {
    let bytes = s.as_bytes();
    if bytes.len() < 4 {
        return None;
    }
    for i in 0..=bytes.len() - 4 {
        let a = bytes[i].to_ascii_lowercase();
        let b = bytes[i + 1].to_ascii_lowercase();
        let c = bytes[i + 2].to_ascii_lowercase();
        if a == b'u' && b == b'r' && c == b'l' {
            let mut j = i + 3;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b'(' {
                return Some((i, j));
            }
        }
    }
    None
} 