import { Fragment } from "react";

/**
 * SÖZDİZİMİ RENKLENDİRME — kütüphanesiz.
 *
 * Sitedeki örnekler kısa ve dört dilde (ts, bash, http, json). Bir
 * renklendirici kitaplık bunun için yüzlerce kB eklerdi. Burada her dil için
 * tek bir düzenli ifade alternasyonu var; eşleşmeyen metin olduğu gibi kalır.
 * Sunucuda çalışır, çıktı düz <span>'lardır; kopyalanan metin bozulmaz.
 *
 * Renk sınıfları globals.css'te (`.tok-*`), renkler token'lardan gelir.
 */
export type Lang = "ts" | "bash" | "http" | "json" | "text";

type Rule = { cls: string; re: RegExp };

const TS_KEYWORDS =
  "import|from|export|const|let|var|await|async|new|return|function|if|else|type|interface|throw|try|catch|default|as|of|in|typeof";

const RULES: Record<Exclude<Lang, "text">, Rule[]> = {
  ts: [
    { cls: "tok-comment", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
    { cls: "tok-string", re: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y },
    { cls: "tok-keyword", re: new RegExp(`\\b(?:${TS_KEYWORDS})\\b`, "y") },
    { cls: "tok-number", re: /\b\d[\d_]*n?\b/y },
    { cls: "tok-fn", re: /\b[A-Za-z_$][\w$]*(?=\s*\()/y },
    { cls: "tok-prop", re: /\b[A-Za-z_$][\w$]*(?=\s*:)/y },
    { cls: "tok-punct", re: /[{}()[\];,.=<>+\-*/!?:|&]+/y },
  ],
  bash: [
    { cls: "tok-comment", re: /#[^\n]*/y },
    { cls: "tok-prompt", re: /^\$ /my },
    { cls: "tok-string", re: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/y },
    { cls: "tok-flag", re: /(?<=\s)-{1,2}[A-Za-z][\w-]*/y },
    { cls: "tok-cmd", re: /^(?:\$ )?[a-z][\w.-]*/my },
    { cls: "tok-keyword", re: /\$[A-Z_][A-Z0-9_]*/y },
  ],
  http: [
    { cls: "tok-status", re: /^HTTP\/\d(?:\.\d)? \d{3}[^\n]*/my },
    { cls: "tok-status", re: /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) [^\n]*/my },
    { cls: "tok-header", re: /^[A-Za-z][\w-]*(?=:)/my },
    { cls: "tok-prop", re: /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y },
    { cls: "tok-string", re: /"(?:[^"\\\n]|\\.)*"/y },
    { cls: "tok-number", re: /\b\d+(?:\.\d+)?\b/y },
    { cls: "tok-punct", re: /[{}[\],:]+/y },
  ],
  json: [
    { cls: "tok-prop", re: /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y },
    { cls: "tok-string", re: /"(?:[^"\\\n]|\\.)*"/y },
    { cls: "tok-keyword", re: /\b(?:true|false|null)\b/y },
    { cls: "tok-number", re: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/iy },
    { cls: "tok-punct", re: /[{}[\],:]+/y },
  ],
};

/** Dosya adı veya kabuk etiketinden dil tahmini ("server.ts", "bash", "GET /book"). */
export function langFromTitle(title?: string): Lang {
  if (!title) return "text";
  const t = title.toLowerCase();
  if (t.endsWith(".ts") || t.endsWith(".tsx") || t.endsWith(".js") || t === "typescript") return "ts";
  if (t === "bash" || t === "sh" || t === "shell" || t === "zsh") return "bash";
  if (t === "http" || /^(get|post|put|patch|delete) /.test(t)) return "http";
  if (t === "json" || t.endsWith(".json")) return "json";
  return "text";
}

export function highlight(code: string, lang: Lang): React.ReactNode {
  if (lang === "text") return code;
  const rules = RULES[lang];
  const out: React.ReactNode[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) out.push(plain);
    plain = "";
  };

  while (i < code.length) {
    let matched = false;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(code);
      if (m && m.index === i && m[0].length > 0) {
        flush();
        out.push(
          <span key={out.length} className={rule.cls}>
            {m[0]}
          </span>,
        );
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += code[i];
      i += 1;
    }
  }
  flush();
  return out.map((node, k) => <Fragment key={k}>{node}</Fragment>);
}
