"use client";
import type React from "react";

export function SearchHighlight({ text, q }: { text: string, q: string }){
  const query = q.trim();
  if(!query) return <>{text}</>;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let parts: string[];
  try{ parts = text.split(new RegExp(`(${esc})`, "ig")); }catch{ return <>{text}</>; }
  return <>{parts.map((p,i)=> p.toLowerCase()===query.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>)}</>;
}

export function RenderContent({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const blockRegex = /```([\s\S]*?)```/g;
  let last = 0; let m: RegExpExecArray | null; let idx=0;
  const inline = (s: string) => {
    const tokens: React.ReactNode[] = [];
    const segs = s.split(/(`[^`]+`)/g);
    segs.forEach((seg, i) => {
      if (seg.startsWith("`") && seg.endsWith("`") && seg.length>1) {
        tokens.push(<code key={`c-${i}-${idx++}`}>{seg.slice(1,-1)}</code>);
        return;
      }
      const spoilerSplit = seg.split(/(\|\|[^|]+\|\|)/g);
      spoilerSplit.forEach((sp, j) => {
        if (sp.startsWith("||") && sp.endsWith("||")) {
          tokens.push(<span key={`sp-${i}-${j}`} className="spoiler" onClick={e=> (e.currentTarget.style.color = e.currentTarget.style.color ? "" : "#fff")}>{sp.slice(2,-2)}</span>);
          return;
        }
        const mentionSplit = sp.split(/(@\w+|#\w+)/g);
        mentionSplit.forEach((ms, k) => {
          if (/^@\w+/.test(ms) || /^#\w+/.test(ms)) {
            tokens.push(<span key={`mn-${i}-${j}-${k}`} className="mention">{ms}</span>);
            return;
          }
          const boldParts = ms.split(/(\*\*[^*]+\*\*)/g);
          boldParts.forEach((bp, b) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              tokens.push(<strong key={`b-${i}-${j}-${k}-${b}`}>{bp.slice(2,-2)}</strong>);
              return;
            }
            const italicParts = bp.split(/(\*[^*]+\*|_[^_]+_)/g);
            italicParts.forEach((ip, c) => {
              if ((ip.startsWith("*") && ip.endsWith("*") && ip.length>2) || (ip.startsWith("_") && ip.endsWith("_") && ip.length>2)) {
                tokens.push(<em key={`it-${i}-${j}-${k}-${b}-${c}`}>{ip.slice(1,-1)}</em>);
                return;
              }
              const strikeParts = ip.split(/(~~[^~]+~~)/g);
              strikeParts.forEach((stp, d) => {
                if (stp.startsWith("~~") && stp.endsWith("~~")) {
                  tokens.push(<s key={`s-${i}-${j}-${k}-${b}-${c}-${d}`}>{stp.slice(2,-2)}</s>);
                  return;
                }
                const uParts = stp.split(/(__[^_]+__)/g);
                uParts.forEach((up, e) => {
                  if (up.startsWith("__") && up.endsWith("__")) {
                    tokens.push(<u key={`u-${i}-${j}-${k}-${b}-${c}-${d}-${e}`}>{up.slice(2,-2)}</u>);
                    return;
                  }
                  if (up.startsWith("> ")) {
                    tokens.push(<blockquote key={`q-${i}-${j}-${k}-${b}-${c}-${d}-${e}`}>{up.slice(2)}</blockquote>);
                    return;
                  }
                  if (up) {
                    const urlParts = up.split(/(https?:\/\/[^\s]+)/g);
                    urlParts.forEach((part, f) => {
                      if (/^https?:\/\//.test(part)) {
                        const isImage = /\.(gif|png|jpe?g|webp)(\?|$)/i.test(part) || /giphy\.com|tenor\.com|media\.giphy/i.test(part);
                        if (isImage) {
                          tokens.push(<img key={`img-${i}-${j}-${k}-${b}-${c}-${d}-${e}-${f}`} src={part} alt="gif" style={{maxWidth:"220px", maxHeight:"220px", border:"1px solid var(--border)", display:"block", margin:"6px 0"}} onClick={()=>window.open(part,"_blank")} />);
                        } else {
                          tokens.push(<a key={`lnk-${i}-${j}-${k}-${b}-${c}-${d}-${e}-${f}`} href={part} target="_blank" rel="noopener noreferrer" style={{color:"#fff", textDecoration:"underline", textUnderlineOffset:"3px"}}>{part}</a>);
                        }
                        return;
                      }
                      if (part) tokens.push(<span key={`t-${i}-${j}-${k}-${b}-${c}-${d}-${e}-${f}-${tokens.length}`}>{part}</span>);
                    });
                  }
                });
              });
            });
          });
        });
      });
    });
    return tokens;
  };
  const raw = text;
  let found=false;
  while ((m = blockRegex.exec(raw)) !== null) {
    found=true;
    const before = raw.slice(last, m.index);
    if (before) parts.push(<span key={`pre-b-${idx++}`}>{inline(before)}</span>);
    parts.push(<pre key={`pre-${idx++}`}><code>{m[1]}</code></pre>);
    last = m.index + m[0].length;
  }
  if (!found) return <>{inline(raw)}</>;
  const after = raw.slice(last);
  if (after) parts.push(<span key={`pre-a-${idx++}`}>{inline(after)}</span>);
  return <>{parts}</>;
}
